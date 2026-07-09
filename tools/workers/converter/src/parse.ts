import type { Arg, Direction, Fmt, Meta, Profile, RejectVariant, Rewrite, Rule, Script } from "./types";

/* ---------------------------------- 通用工具 ---------------------------------- */

/** 按逗号切分，忽略引号与括号（()/[]/{}）内部的逗号 */
export function splitParams(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  let depth = 0;
  let quote: string | null = null;
  for (const ch of s) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    if (ch === ")" || ch === "]" || ch === "}") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** 解析 key=value（只按第一个 = 切） */
function kv(token: string): [string, string] | null {
  const i = token.indexOf("=");
  if (i <= 0) return null;
  return [token.slice(0, i).trim().toLowerCase(), token.slice(i + 1).trim()];
}

function unquote(s: string): string {
  if (s.length >= 2 && ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s;
}

function boolOf(s: string | undefined): boolean {
  return s === "true" || s === "1";
}

interface Sections {
  meta: Record<string, string>;
  sections: Map<string, string[]>;
}

/** 拆分 #!元信息 与 [Section] 行；跳过注释与空行 */
function splitSections(text: string): Sections {
  const meta: Record<string, string> = {};
  const sections = new Map<string, string[]>();
  let cur: string[] | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#!")) {
      const m = line.slice(2).match(/^([\w-]+)\s*=?\s*(.*)$/);
      if (m) meta[m[1].toLowerCase()] = m[2].trim();
      continue;
    }
    if (line.startsWith("#") || line.startsWith(";") || line.startsWith("//")) continue;
    const sec = line.match(/^\[(.+)\]$/);
    if (sec) {
      const key = sec[1].trim().toLowerCase();
      cur = sections.get(key) ?? [];
      sections.set(key, cur);
      continue;
    }
    if (cur) cur.push(line);
    else {
      // 无 section 的裸行（QX snippet 常见：rewrite 行 + hostname 行）
      const orphan = sections.get("") ?? [];
      sections.set("", orphan);
      orphan.push(line);
    }
  }
  return { meta, sections };
}

/** 未识别的段落发告警，避免静默吞内容（来源格式误判时能暴露） */
function warnUnknownSections(sections: Map<string, string[]>, known: Set<string>, warnings: string[], fmt: string): void {
  for (const [name, lines] of sections) {
    if (!known.has(name) && lines.length) {
      warnings.push(`[${name}] 不是 ${fmt} 已知段落（共 ${lines.length} 行未转换）；若来源格式识别有误，请显式指定 from= 参数`);
    }
  }
}

function pickMeta(m: Record<string, string>): Meta {
  return {
    name: m["name"],
    desc: m["desc"] || m["description"],
    author: m["author"],
    homepage: m["homepage"],
    icon: m["icon"],
    category: m["category"],
    system: m["system"],
    version: m["version"],
    tag: m["tag"],
  };
}

/* ---------------------------------- 格式识别 ---------------------------------- */

export function detectFormat(text: string): Fmt | null {
  const { meta, sections } = splitSections(text);
  let loon = 0;
  let surge = 0;
  let qx = 0;

  // 注意：[MITM]/[mitm] 三端同名，不能作为判别信号
  if (sections.has("rewrite_local") || sections.has("task_local") || sections.has("filter_local")) qx += 4;
  if (sections.has("url rewrite") || sections.has("map local") || sections.has("header rewrite") || sections.has("body rewrite")) surge += 4;
  if (sections.has("argument")) loon += 4;
  if (sections.has("rewrite")) loon += 2; // [Rewrite] 是 Loon 段名
  if (meta["arguments"] !== undefined || meta["arguments-desc"] !== undefined || meta["category"] !== undefined) surge += 2;

  for (const l of sections.get("script") ?? []) {
    if (/^[^=]+=\s*type\s*=/.test(l)) surge += 3; // Surge: name = type=...
    if (/^(http-request|http-response|cron|generic|network-changed)\b/.test(l)) loon += 3; // Loon: type pattern ...
  }
  for (const l of sections.get("rewrite") ?? []) {
    if (/\s(reject(-200|-img|-dict|-array|-drop)?|302|307|header|header-add|header-del|header-replace|mock-response-body|response-body-replace-regex|request-body-replace-regex)(\s|$)/.test(` ${l} `)) loon += 2;
  }
  // 裸 QX rewrite 行（snippet 无段名）
  for (const l of sections.get("") ?? []) {
    if (/\surl\s+(reject|reject-200|reject-img|reject-dict|reject-array|302|307|script-|request-|response-|echo-response)/.test(l)) qx += 3;
    if (/^hostname\s*=/.test(l)) qx += 1;
  }

  const max = Math.max(loon, surge, qx);
  if (max === 0) return null;
  if (max === qx) return "qx";
  if (max === surge) return "surge";
  return "loon";
}

/* ---------------------------------- Loon 解析 ---------------------------------- */

const REJECTS = new Set<string>(["reject", "reject-200", "reject-img", "reject-dict", "reject-array", "reject-drop"]);

function parseLoonRewrite(line: string, out: Rewrite[], warnings: string[]): void {
  const sp = line.indexOf(" ");
  if (sp < 0) {
    warnings.push(`[Rewrite] 无法解析: ${line}`);
    return;
  }
  const pattern = line.slice(0, sp);
  const rest = line.slice(sp + 1).trim();
  const [verb, ...args] = rest.split(/\s+/);
  const argStr = args.join(" ");

  if (REJECTS.has(verb)) {
    out.push({ kind: "reject", pattern, variant: verb as RejectVariant });
    return;
  }
  if (verb === "302" || verb === "307") {
    out.push({ kind: "redirect", pattern, location: args[0] ?? "", status: verb === "302" ? 302 : 307 });
    return;
  }
  if (verb === "header") {
    out.push({ kind: "transparent", pattern, replacement: args[0] ?? "" });
    return;
  }
  const hm = verb.match(/^(response-)?header-(add|del|replace|replace-regex)$/);
  if (hm) {
    const direction: Direction = hm[1] ? "response" : "request";
    const op = hm[2] as "add" | "del" | "replace" | "replace-regex";
    if (op === "replace-regex") {
      out.push({ kind: "header", direction, pattern, op, field: args[0] ?? "", regex: args[1] ?? "", value: args.slice(2).join(" ") });
    } else {
      out.push({ kind: "header", direction, pattern, op, field: args[0] ?? "", value: args.slice(1).join(" ") });
    }
    return;
  }
  const bm = verb.match(/^(request|response)-body-replace-regex$/);
  if (bm) {
    out.push({ kind: "body", direction: bm[1] as Direction, pattern, regex: args[0] ?? "", replacement: args.slice(1).join(" ") });
    return;
  }
  const jq = verb.match(/^(request|response)-body-json-jq$/);
  if (jq) {
    out.push({ kind: "jq", direction: jq[1] as Direction, pattern, expr: argStr });
    return;
  }
  if (verb === "mock-response-body") {
    const params = parseSpaceKv(argStr);
    out.push({
      kind: "mock",
      pattern,
      dataType: (params["data-type"] as "text" | "json" | "base64" | "file") || "text",
      data: params["data"] !== undefined ? unquote(params["data"]) : params["data-path"],
      statusCode: params["status-code"] ? Number(params["status-code"]) : undefined,
    });
    return;
  }
  warnings.push(`[Rewrite] Loon 指令 "${verb}" 无跨端等价物，已跳过: ${line}`);
}

/** 解析空格分隔的 key=value（value 可带引号） */
function parseSpaceKv(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w-]+)=("[^"]*"|\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out[m[1].toLowerCase()] = unquote(m[2]);
  return out;
}

function parseLoonScript(line: string, out: Script[], warnings: string[]): void {
  const parts = splitParams(line);
  const head = parts[0];
  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const pair = kv(p);
    if (pair) params[pair[0]] = pair[1];
  }
  const common = {
    timeout: params["timeout"] ? Number(params["timeout"]) : undefined,
    tag: params["tag"],
    argument: params["argument"],
  };
  const path = params["script-path"] ?? "";

  const hm = head.match(/^(http-request|http-response)\s+(\S+)(.*)$/);
  if (hm) {
    // pattern 之后可能直接跟 script-path=（head 内含首个参数）
    const inline = kv(hm[3].trim());
    if (inline) params[inline[0]] = inline[1];
    out.push({
      type: hm[1] as "http-request" | "http-response",
      pattern: hm[2],
      path: params["script-path"] ?? path,
      requiresBody: boolOf(params["requires-body"]),
      binaryBodyMode: boolOf(params["binary-body-mode"]),
      timeout: common.timeout,
      tag: params["tag"],
      argument: params["argument"],
    });
    return;
  }
  const cm = head.match(/^cron\s+("[^"]+"|\S+)(.*)$/);
  if (cm) {
    const inline = kv(cm[2].trim());
    if (inline) params[inline[0]] = inline[1];
    out.push({ type: "cron", cronexp: unquote(cm[1]), path: params["script-path"] ?? path, ...common, imgUrl: params["img-url"] });
    return;
  }
  if (head.startsWith("generic")) {
    const inline = kv(head.replace(/^generic\s*/, ""));
    if (inline) params[inline[0]] = inline[1];
    out.push({ type: "generic", path: params["script-path"] ?? path, ...common, imgUrl: params["img-url"] });
    return;
  }
  if (head.startsWith("network-changed")) {
    const inline = kv(head.replace(/^network-changed\s*/, ""));
    if (inline) params[inline[0]] = inline[1];
    out.push({ type: "network-changed", path: params["script-path"] ?? path, ...common });
    return;
  }
  warnings.push(`[Script] 无法识别的 Loon 脚本行: ${line}`);
}

function parseLoonArgument(line: string, out: Arg[], warnings: string[]): void {
  const eq = line.indexOf("=");
  if (eq <= 0) {
    warnings.push(`[Argument] 无法解析: ${line}`);
    return;
  }
  const name = line.slice(0, eq).trim();
  const parts = splitParams(line.slice(eq + 1));
  const type = parts[0] as Arg["type"];
  if (type !== "input" && type !== "select" && type !== "switch") {
    warnings.push(`[Argument] 未知参数类型 "${parts[0]}": ${line}`);
    return;
  }
  const values: string[] = [];
  let tag: string | undefined;
  let desc: string | undefined;
  for (const p of parts.slice(1)) {
    const pair = kv(p);
    if (pair && (pair[0] === "tag" || pair[0] === "desc")) {
      if (pair[0] === "tag") tag = unquote(pair[1]);
      else desc = unquote(pair[1]);
    } else {
      values.push(unquote(p));
    }
  }
  out.push({
    name,
    type,
    defaultValue: values[0] ?? (type === "switch" ? "false" : ""),
    options: type === "select" ? values : undefined,
    tag,
    desc,
  });
}

/** 分流规则：Loon/Surge 大写风格 */
const RULE_TYPES = new Set([
  "DOMAIN", "DOMAIN-SUFFIX", "DOMAIN-KEYWORD", "URL-REGEX", "USER-AGENT",
  "IP-CIDR", "IP-CIDR6", "IP6-CIDR", "GEOIP", "IP-ASN", "FINAL",
]);

function parseUpperRule(line: string, out: Rule[], warnings: string[]): void {
  const parts = splitParams(line).map((p) => p.trim());
  const type = parts[0].toUpperCase();
  if (!RULE_TYPES.has(type)) {
    warnings.push(`[Rule] 规则类型 "${parts[0]}" 不在通用集合内，已跳过: ${line}`);
    return;
  }
  if (type === "FINAL") {
    out.push({ type: "FINAL", policy: parts[1] ?? "DIRECT" });
    return;
  }
  const noResolve = parts.some((p) => p.toLowerCase() === "no-resolve");
  out.push({
    type: type === "IP6-CIDR" ? "IP-CIDR6" : type,
    value: parts[1],
    policy: parts[2] ?? "REJECT",
    noResolve,
  });
}

function parseMitmHostnames(lines: string[]): string[] {
  const hosts: string[] = [];
  for (const l of lines) {
    const m = l.match(/^hostname\s*=\s*(.*)$/i);
    if (!m) continue;
    const v = m[1].replace(/%(APPEND|INSERT)%/gi, "");
    for (const h of v.split(",")) {
      const t = h.trim();
      if (t) hosts.push(t);
    }
  }
  return hosts;
}

export function parseLoon(text: string): Profile {
  const { meta, sections } = splitSections(text);
  const warnings: string[] = [];
  const rewrites: Rewrite[] = [];
  const scripts: Script[] = [];
  const args: Arg[] = [];
  const rules: Rule[] = [];

  for (const l of sections.get("argument") ?? []) parseLoonArgument(l, args, warnings);
  for (const l of sections.get("rewrite") ?? []) parseLoonRewrite(l, rewrites, warnings);
  for (const l of sections.get("script") ?? []) parseLoonScript(l, scripts, warnings);
  for (const l of sections.get("rule") ?? []) parseUpperRule(l, rules, warnings);
  if (sections.has("general")) warnings.push("[General] Loon 插件全局设置无法跨端转换，已跳过");
  if (sections.has("host")) warnings.push("[Host] 段无法跨端转换，已跳过");
  warnUnknownSections(sections, new Set(["argument", "rewrite", "script", "rule", "mitm", "general", "host"]), warnings, "Loon");

  return {
    source: "loon",
    meta: pickMeta(meta),
    args,
    rules,
    rewrites,
    scripts,
    mitmHostnames: parseMitmHostnames(sections.get("mitm") ?? []),
    warnings,
  };
}

/* ---------------------------------- Surge 解析 ---------------------------------- */

function parseSurgeArguments(meta: Record<string, string>): Arg[] {
  const raw = meta["arguments"];
  if (!raw) return [];
  const descRaw = meta["arguments-desc"] ?? "";
  const args: Arg[] = [];
  for (const item of splitParams(raw)) {
    // 官方格式 name:default；兼容 name=default
    const m = item.match(/^([\w.-]+)\s*[:=]\s*(.*)$/);
    if (!m) continue;
    const def = unquote(m[2].trim());
    // arguments-desc 常见写法 "name: 说明; name2: 说明2"，按参数名拆分
    const own = descRaw.match(new RegExp(`(?:^|;)\\s*${m[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:：]\\s*([^;]+)`));
    args.push({
      name: m[1],
      type: def === "true" || def === "false" ? "switch" : "input",
      defaultValue: def,
      desc: (own?.[1] ?? descRaw).trim() || undefined,
    });
  }
  return args;
}

function parseSurgeScript(line: string, out: Script[], warnings: string[]): void {
  const eq = line.indexOf("=");
  if (eq <= 0) {
    warnings.push(`[Script] 无法解析的 Surge 脚本行: ${line}`);
    return;
  }
  const name = line.slice(0, eq).trim();
  const params: Record<string, string> = {};
  for (const p of splitParams(line.slice(eq + 1))) {
    const pair = kv(p);
    if (pair) params[pair[0]] = pair[1];
  }
  const type = params["type"];
  const common = {
    timeout: params["timeout"] ? Number(params["timeout"]) : undefined,
    tag: name,
    argument: params["argument"],
  };
  const path = params["script-path"] ?? "";
  if (type === "http-request" || type === "http-response") {
    out.push({
      type,
      pattern: params["pattern"] ?? "",
      path,
      requiresBody: boolOf(params["requires-body"]),
      binaryBodyMode: boolOf(params["binary-body-mode"]),
      maxSize: params["max-size"] ? Number(params["max-size"]) : undefined,
      ...common,
    });
    return;
  }
  if (type === "cron") {
    out.push({ type: "cron", cronexp: unquote(params["cronexp"] ?? ""), path, ...common });
    return;
  }
  if (type === "generic") {
    out.push({ type: "generic", path, ...common });
    return;
  }
  if (type === "event") {
    if ((params["event-name"] ?? "") === "network-changed") {
      out.push({ type: "network-changed", path, ...common });
    } else {
      warnings.push(`[Script] Surge event "${params["event-name"]}" 无跨端等价物，已跳过: ${name}`);
    }
    return;
  }
  warnings.push(`[Script] Surge 脚本类型 "${type}" 无跨端等价物（dns/rule 等为 Surge 专属），已跳过: ${name}`);
}

function parseSurgeUrlRewrite(line: string, out: Rewrite[], warnings: string[]): void {
  const parts = line.split(/\s+/);
  if (parts.length < 3) {
    warnings.push(`[URL Rewrite] 无法解析: ${line}`);
    return;
  }
  const mode = parts[parts.length - 1];
  const pattern = parts[0];
  const replacement = parts.slice(1, -1).join(" ");
  if (mode === "302") out.push({ kind: "redirect", pattern, location: replacement, status: 302 });
  else if (mode === "header") out.push({ kind: "transparent", pattern, replacement });
  else if (mode === "reject") out.push({ kind: "reject", pattern, variant: "reject" });
  else warnings.push(`[URL Rewrite] 未知模式 "${mode}": ${line}`);
}

function parseSurgeHeaderRewrite(line: string, out: Rewrite[], warnings: string[]): void {
  const parts = line.split(/\s+/);
  let direction: Direction = "request";
  let i = 0;
  if (parts[0] === "http-request" || parts[0] === "http-response") {
    direction = parts[0] === "http-response" ? "response" : "request";
    i = 1;
  }
  const pattern = parts[i];
  const action = parts[i + 1];
  const field = parts[i + 2];
  const m = action?.match(/^header-(add|del|replace|replace-regex)$/);
  if (!m || !pattern || !field) {
    warnings.push(`[Header Rewrite] 无法解析: ${line}`);
    return;
  }
  const op = m[1] as "add" | "del" | "replace" | "replace-regex";
  if (op === "replace-regex") {
    out.push({ kind: "header", direction, pattern, op, field, regex: parts[i + 3] ?? "", value: parts.slice(i + 4).join(" ") });
  } else {
    out.push({ kind: "header", direction, pattern, op, field, value: parts.slice(i + 3).join(" ") });
  }
}

function parseSurgeBodyRewrite(line: string, out: Rewrite[], warnings: string[]): void {
  const jq = line.match(/^http-(request|response)-jq\s+(\S+)\s+(.+)$/);
  if (jq) {
    out.push({ kind: "jq", direction: jq[1] as Direction, pattern: jq[2], expr: jq[3].trim() });
    return;
  }
  const m = line.match(/^http-(request|response)\s+(\S+)\s+(.+)$/);
  if (!m) {
    warnings.push(`[Body Rewrite] 无法解析: ${line}`);
    return;
  }
  const direction = m[1] as Direction;
  const pattern = m[2];
  const rest = m[3].split(/\s+/);
  // 支持一行多组 regex replacement
  for (let i = 0; i + 1 < rest.length; i += 2) {
    out.push({ kind: "body", direction, pattern, regex: rest[i], replacement: rest[i + 1] });
  }
  if (rest.length % 2 !== 0) warnings.push(`[Body Rewrite] 替换对数量为奇数，最后一项被忽略: ${line}`);
}

function parseSurgeMapLocal(line: string, out: Rewrite[], warnings: string[]): void {
  const sp = line.indexOf(" ");
  if (sp < 0) {
    warnings.push(`[Map Local] 无法解析: ${line}`);
    return;
  }
  const pattern = line.slice(0, sp);
  const params = parseSpaceKv(line.slice(sp + 1));
  const dt = (params["data-type"] as "text" | "tiny-gif" | "base64" | "file") || "text";
  out.push({
    kind: "mock",
    pattern,
    dataType: dt,
    data: params["data"],
    statusCode: params["status-code"] ? Number(params["status-code"]) : undefined,
    contentType: params["header"]?.match(/content-type:([^|]+)/i)?.[1]?.trim(),
  });
}

export function parseSurge(text: string): Profile {
  const { meta, sections } = splitSections(text);
  const warnings: string[] = [];
  const rewrites: Rewrite[] = [];
  const scripts: Script[] = [];
  const rules: Rule[] = [];

  for (const l of sections.get("url rewrite") ?? []) parseSurgeUrlRewrite(l, rewrites, warnings);
  for (const l of sections.get("header rewrite") ?? []) parseSurgeHeaderRewrite(l, rewrites, warnings);
  for (const l of sections.get("body rewrite") ?? []) parseSurgeBodyRewrite(l, rewrites, warnings);
  for (const l of sections.get("map local") ?? []) parseSurgeMapLocal(l, rewrites, warnings);
  for (const l of sections.get("script") ?? []) parseSurgeScript(l, scripts, warnings);
  for (const l of sections.get("rule") ?? []) parseUpperRule(l, rules, warnings);
  if (sections.has("general")) warnings.push("[General] Surge 模块全局设置无法跨端转换，已跳过");
  warnUnknownSections(sections, new Set(["url rewrite", "header rewrite", "body rewrite", "map local", "script", "rule", "mitm", "general", "host"]), warnings, "Surge");

  return {
    source: "surge",
    meta: pickMeta(meta),
    args: parseSurgeArguments(meta),
    rules,
    rewrites,
    scripts,
    mitmHostnames: parseMitmHostnames(sections.get("mitm") ?? []),
    warnings,
  };
}

/* ---------------------------------- QX 解析 ---------------------------------- */

/** QX 头部整段正则改写 → 尝试还原为 key 级操作 */
function qxHeaderToIR(direction: Direction, pattern: string, regex: string, replacement: string): Rewrite | null {
  // 形如 (\r\n)User-Agent:.+(\r\n) → $1User-Agent: X$2 或 \r\nUser-Agent:[^\r\n]* → \r\nUser-Agent: X
  const rm = regex.match(/^(?:\(\\r\\n\)|\\r\\n)([\w-]+):.*$/);
  const vm = replacement.match(/^(?:\$1|\\r\\n)([\w-]+):\s*(.*?)(?:\$2)?$/);
  if (rm && vm && rm[1].toLowerCase() === vm[1].toLowerCase()) {
    return { kind: "header", direction, pattern, op: "replace", field: rm[1], value: vm[2] };
  }
  return null;
}

const QX_SCRIPT_ACTIONS: Record<string, { type: "http-request" | "http-response"; requiresBody: boolean }> = {
  "script-request-header": { type: "http-request", requiresBody: false },
  "script-request-body": { type: "http-request", requiresBody: true },
  "script-response-header": { type: "http-response", requiresBody: false },
  "script-response-body": { type: "http-response", requiresBody: true },
  "script-echo-response": { type: "http-request", requiresBody: false },
  "script-analyze-echo-response": { type: "http-request", requiresBody: true },
};

function parseQxRewrite(line: string, rewrites: Rewrite[], scripts: Script[], warnings: string[]): void {
  if (/\surl-and-header\s/.test(line)) {
    warnings.push(`[rewrite] QX url-and-header 匹配无跨端等价物，已跳过: ${line}`);
    return;
  }
  const m = line.match(/^(\S+)\s+url\s+(.+)$/);
  if (!m) {
    warnings.push(`[rewrite] 无法解析的 QX 重写行: ${line}`);
    return;
  }
  const pattern = m[1];
  const rest = m[2].trim();
  const [action, ...tail] = rest.split(/\s+/);

  if (REJECTS.has(action)) {
    rewrites.push({ kind: "reject", pattern, variant: action as RejectVariant });
    return;
  }
  if (action === "302" || action === "307") {
    rewrites.push({ kind: "redirect", pattern, location: tail[0] ?? "", status: action === "302" ? 302 : 307 });
    return;
  }
  const scriptAction = QX_SCRIPT_ACTIONS[action];
  if (scriptAction) {
    if (action === "script-echo-response" || action === "script-analyze-echo-response") {
      warnings.push(`[rewrite] QX ${action} 转为 http-request 脚本（Loon/Surge 需脚本内 $done 返回自定义响应）: ${line}`);
    }
    scripts.push({ ...scriptAction, pattern, path: tail[0] ?? "" });
    return;
  }
  const hb = action.match(/^(request|response)-(header|body)$/);
  if (hb) {
    const direction = hb[1] as Direction;
    // 格式: <regex> <同名关键字> <replacement>
    const sepIdx = rest.indexOf(` ${action} `, action.length);
    if (sepIdx < 0) {
      warnings.push(`[rewrite] QX ${action} 缺少替换段: ${line}`);
      return;
    }
    const regex = rest.slice(action.length + 1, sepIdx).trim();
    const replacement = rest.slice(sepIdx + action.length + 2).trim();
    if (hb[2] === "body") {
      rewrites.push({ kind: "body", direction, pattern, regex, replacement });
      return;
    }
    const recovered = qxHeaderToIR(direction, pattern, regex, replacement);
    if (recovered) rewrites.push(recovered);
    else warnings.push(`[rewrite] QX 整段头部正则无法还原为 key 级操作，已跳过: ${line}`);
    return;
  }
  if (action === "echo-response") {
    // echo-response <content-type[\r\n headers]> [echo-response <file>]
    const sepIdx = rest.indexOf(" echo-response ", action.length);
    const ct = (sepIdx >= 0 ? rest.slice(action.length + 1, sepIdx) : tail[0] ?? "").split("\\r\\n")[0];
    const file = sepIdx >= 0 ? rest.slice(sepIdx + " echo-response ".length).trim() : tail.slice(1).join(" ");
    rewrites.push({ kind: "mock", pattern, dataType: "file", data: file || undefined, contentType: ct || undefined });
    return;
  }
  warnings.push(`[rewrite] 未知 QX 动作 "${action}": ${line}`);
}

function parseQxTask(line: string, scripts: Script[], warnings: string[]): void {
  const parts = splitParams(line);
  const head = parts[0];
  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const pair = kv(p);
    if (pair) params[pair[0]] = pair[1];
  }
  const common = { tag: params["tag"], imgUrl: params["img-url"] };
  const ev = head.match(/^event-(network|interaction)\s+(\S+)/);
  if (ev) {
    if (ev[1] === "network") scripts.push({ type: "network-changed", path: ev[2], tag: common.tag });
    else scripts.push({ type: "generic", path: ev[2], ...common });
    return;
  }
  // cron：5 或 6 段时间表达式 + 脚本路径
  const cm = head.match(/^((?:\S+\s+){4,5}\S+)\s+(\S+)$/);
  if (cm && /^[\d*\/,\-]+$/.test(cm[1].split(/\s+/)[0])) {
    scripts.push({ type: "cron", cronexp: cm[1], path: cm[2], ...common });
    return;
  }
  warnings.push(`[task_local] 无法解析: ${line}`);
}

/** QX filter_local 小写规则 → 统一大写 IR */
const QX_RULE_MAP: Record<string, string> = {
  "host": "DOMAIN",
  "host-suffix": "DOMAIN-SUFFIX",
  "host-keyword": "DOMAIN-KEYWORD",
  "url-regex": "URL-REGEX",
  "user-agent": "USER-AGENT",
  "ip-cidr": "IP-CIDR",
  "ip6-cidr": "IP-CIDR6",
  "geoip": "GEOIP",
  "ip-asn": "IP-ASN",
  "final": "FINAL",
};

function parseQxFilter(line: string, out: Rule[], warnings: string[]): void {
  const parts = splitParams(line).map((p) => p.trim());
  const type = QX_RULE_MAP[parts[0].toLowerCase()];
  if (!type) {
    warnings.push(`[filter_local] 规则类型 "${parts[0]}" 不在通用集合内，已跳过: ${line}`);
    return;
  }
  if (type === "FINAL") {
    out.push({ type, policy: (parts[1] ?? "direct").toUpperCase() });
    return;
  }
  out.push({
    type,
    value: parts[1],
    policy: (parts[2] ?? "reject").toUpperCase(),
    noResolve: parts.some((p) => p.toLowerCase() === "no-resolve"),
  });
}

export function parseQx(text: string): Profile {
  const { meta, sections } = splitSections(text);
  const warnings: string[] = [];
  const rewrites: Rewrite[] = [];
  const scripts: Script[] = [];
  const rules: Rule[] = [];
  const mitmLines: string[] = [...(sections.get("mitm") ?? [])];

  const rewriteLines = [...(sections.get("rewrite_local") ?? [])];
  // 裸 snippet：无段名的行按内容分流
  for (const l of sections.get("") ?? []) {
    if (/^hostname\s*=/i.test(l)) mitmLines.push(l);
    else rewriteLines.push(l);
  }
  for (const l of rewriteLines) parseQxRewrite(l, rewrites, scripts, warnings);
  for (const l of sections.get("task_local") ?? []) parseQxTask(l, scripts, warnings);
  for (const l of sections.get("filter_local") ?? []) parseQxFilter(l, rules, warnings);
  if (sections.has("rewrite_remote")) warnings.push("[rewrite_remote] 远程引用无法内联转换，请分别转换各远程文件");
  warnUnknownSections(sections, new Set(["", "rewrite_local", "rewrite_remote", "task_local", "filter_local", "mitm"]), warnings, "Quantumult X");

  return {
    source: "qx",
    meta: pickMeta(meta),
    args: [],
    rules,
    rewrites,
    scripts,
    mitmHostnames: parseMitmHostnames(mitmLines),
    warnings,
  };
}

/* ---------------------------------- 入口 ---------------------------------- */

export function parse(text: string, from: Fmt): Profile {
  if (from === "loon") return parseLoon(text);
  if (from === "surge") return parseSurge(text);
  return parseQx(text);
}
