import type { Arg, Fmt, Profile, Rewrite, Rule, Script } from "./types";

export interface GenResult {
  output: string;
  /** 转换阶段产生的告警（降级/丢弃） */
  warnings: string[];
}

/* ------------------------------ 参数占位符互转 ------------------------------ */
/** Loon 用 {name}，Surge 用 {{{name}}}，QX 不支持（代入默认值） */
function convertPlaceholders(s: string | undefined, profile: Profile, target: Fmt, warnings: string[]): string | undefined {
  if (!s) return s;
  let out = s;
  for (const a of profile.args) {
    const loonPh = `{${a.name}}`;
    const surgePh = `{{{${a.name}}}}`;
    const has = out.includes(surgePh) || out.includes(loonPh);
    if (!has) continue;
    // 先替换三重括号，避免 {name} 命中 {{{name}}} 内层
    if (target === "surge") {
      out = out.split(surgePh).join(surgePh); // 已是 surge 形式则保留
      out = replaceLoonPh(out, a.name, surgePh);
    } else if (target === "loon") {
      out = out.split(surgePh).join(loonPh);
    } else {
      out = out.split(surgePh).join(a.defaultValue);
      out = replaceLoonPh(out, a.name, a.defaultValue);
      warnings.push(`Quantumult X 不支持参数占位符，"${a.name}" 已代入默认值 "${a.defaultValue}"`);
    }
  }
  return out;
}

/** 替换 {name}，但跳过 {{{name}}}（Surge 占位符内层） */
function replaceLoonPh(s: string, name: string, repl: string): string {
  return s.replace(new RegExp(`(?<!\\{\\{)\\{${escapeRe(name)}\\}(?!\\}\\})`, "g"), repl);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ------------------------------ 分流规则 ------------------------------ */

const QX_RULE_MAP: Record<string, string> = {
  "DOMAIN": "host",
  "DOMAIN-SUFFIX": "host-suffix",
  "DOMAIN-KEYWORD": "host-keyword",
  "URL-REGEX": "url-regex",
  "USER-AGENT": "user-agent",
  "IP-CIDR": "ip-cidr",
  "IP-CIDR6": "ip6-cidr",
  "GEOIP": "geoip",
  "IP-ASN": "ip-asn",
  "FINAL": "final",
};

function genRule(r: Rule, target: Fmt, warnings: string[]): string | null {
  if (target === "qx") {
    const t = QX_RULE_MAP[r.type];
    if (!t) {
      warnings.push(`[Rule] 类型 ${r.type} 无 QX 等价物，已跳过`);
      return null;
    }
    if (r.type === "FINAL") return `${t}, ${r.policy.toLowerCase()}`;
    const extra = r.noResolve ? ", no-resolve" : "";
    return `${t}, ${r.value}, ${r.policy.toLowerCase()}${extra}`;
  }
  if (target === "surge" && !/^(DIRECT|REJECT|REJECT-TINYGIF|REJECT-DROP|REJECT-NO-DROP)$/.test(r.policy)) {
    // Surge 模块规则只能引用内部策略（DIRECT/REJECT 系）
    warnings.push(`[Rule] Surge 模块规则策略仅支持 DIRECT/REJECT 系，"${r.policy}" 可能无法生效`);
  }
  if (r.type === "FINAL") return `FINAL,${r.policy}`;
  const extra = r.noResolve ? ",no-resolve" : "";
  return `${r.type},${r.value},${r.policy}${extra}`;
}

/* ------------------------------ Loon 生成 ------------------------------ */

function genLoonRewrite(rw: Rewrite, warnings: string[]): string | null {
  switch (rw.kind) {
    case "redirect":
      return `${rw.pattern} ${rw.status} ${rw.location}`;
    case "transparent":
      return `${rw.pattern} header ${rw.replacement}`;
    case "reject":
      return `${rw.pattern} ${rw.variant === "reject-drop" ? "reject" : rw.variant}`;
    case "header": {
      const prefix = rw.direction === "response" ? "response-" : "";
      if (rw.op === "replace-regex") return `${rw.pattern} ${prefix}header-replace-regex ${rw.field} ${rw.regex} ${rw.value ?? ""}`.trimEnd();
      if (rw.op === "del") return `${rw.pattern} ${prefix}header-del ${rw.field}`;
      return `${rw.pattern} ${prefix}header-${rw.op} ${rw.field} ${rw.value ?? ""}`.trimEnd();
    }
    case "body":
      return `${rw.pattern} ${rw.direction}-body-replace-regex ${rw.regex} ${rw.replacement}`;
    case "jq":
      return `${rw.pattern} ${rw.direction}-body-json-jq ${rw.expr}`;
    case "mock": {
      if (rw.dataType === "file") {
        warnings.push(`[Rewrite] mock 数据为文件引用（${rw.data ?? "?"}），Loon 需将文件内容内联后手动处理，已跳过 ${rw.pattern}`);
        return null;
      }
      const dt = rw.dataType === "tiny-gif" ? "base64" : rw.dataType;
      const data = rw.dataType === "tiny-gif" ? TINY_GIF_B64 : rw.data ?? "";
      const sc = rw.statusCode ? ` status-code=${rw.statusCode}` : "";
      return `${rw.pattern} mock-response-body data-type=${dt} data="${data}"${sc}`;
    }
  }
}

const TINY_GIF_B64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function genLoonScript(sc: Script, profile: Profile, warnings: string[]): string {
  const arg = convertPlaceholders(sc.argument, profile, "loon", warnings);
  const tail = (extra: string[]) => {
    const parts = [...extra];
    if (sc.timeout) parts.push(`timeout=${sc.timeout}`);
    if (sc.tag) parts.push(`tag=${sc.tag}`);
    if (arg) parts.push(`argument=${arg}`);
    return parts.length ? `, ${parts.join(", ")}` : "";
  };
  switch (sc.type) {
    case "http-request":
    case "http-response": {
      const extra: string[] = [];
      if (sc.requiresBody) extra.push("requires-body=true");
      if (sc.binaryBodyMode) extra.push("binary-body-mode=true");
      return `${sc.type} ${sc.pattern} script-path=${sc.path}${tail(extra)}`;
    }
    case "cron":
      return `cron "${sc.cronexp}" script-path=${sc.path}${tail(sc.imgUrl ? [`img-url=${sc.imgUrl}`] : [])}`;
    case "generic":
      return `generic script-path=${sc.path}${tail(sc.imgUrl ? [`img-url=${sc.imgUrl}`] : [])}`;
    case "network-changed":
      return `network-changed script-path=${sc.path}${tail([])}`;
  }
}

function genLoonArg(a: Arg): string {
  const parts: string[] = [a.type];
  if (a.type === "select" && a.options?.length) parts.push(...a.options.map((o) => `"${o}"`));
  else if (a.type === "switch") parts.push(a.defaultValue || "false");
  else parts.push(`"${a.defaultValue}"`);
  if (a.tag) parts.push(`tag=${a.tag}`);
  if (a.desc) parts.push(`desc=${a.desc}`);
  return `${a.name} = ${parts.join(",")}`;
}

export function genLoon(profile: Profile): GenResult {
  const warnings: string[] = [];
  const L: string[] = [];
  const m = profile.meta;
  L.push(`#!name = ${m.name ?? "Converted Plugin"}`);
  if (m.desc) L.push(`#!desc = ${m.desc}`);
  if (m.author) L.push(`#!author = ${m.author}`);
  if (m.homepage) L.push(`#!homepage = ${m.homepage}`);
  if (m.icon) L.push(`#!icon = ${m.icon}`);
  if (m.tag || m.category) L.push(`#!tag = ${m.tag ?? m.category}`);

  if (profile.args.length) {
    L.push("", "[Argument]");
    for (const a of profile.args) L.push(genLoonArg(a));
  }
  if (profile.rules.length) {
    L.push("", "[Rule]");
    for (const r of profile.rules) {
      const line = genRule(r, "loon", warnings);
      if (line) L.push(line);
    }
  }
  if (profile.rewrites.length) {
    const lines = profile.rewrites.map((rw) => genLoonRewrite(rw, warnings)).filter((x): x is string => x !== null);
    if (lines.length) L.push("", "[Rewrite]", ...lines);
  }
  if (profile.scripts.length) {
    L.push("", "[Script]");
    for (const sc of profile.scripts) L.push(genLoonScript(sc, profile, warnings));
  }
  if (profile.mitmHostnames.length) {
    L.push("", "[MITM]", `hostname = ${profile.mitmHostnames.join(",")}`);
  }
  return { output: L.join("\n") + "\n", warnings };
}

/* ------------------------------ Surge 生成 ------------------------------ */

function genSurgeRewrites(profile: Profile, warnings: string[]): { urlRewrite: string[]; headerRewrite: string[]; bodyRewrite: string[]; mapLocal: string[] } {
  const urlRewrite: string[] = [];
  const headerRewrite: string[] = [];
  const bodyRewrite: string[] = [];
  const mapLocal: string[] = [];

  for (const rw of profile.rewrites) {
    switch (rw.kind) {
      case "redirect":
        if (rw.status === 307) warnings.push(`[URL Rewrite] Surge 不支持 307，已降级为 302: ${rw.pattern}`);
        urlRewrite.push(`${rw.pattern} ${rw.location} 302`);
        break;
      case "transparent":
        urlRewrite.push(`${rw.pattern} ${rw.replacement} header`);
        break;
      case "reject":
        switch (rw.variant) {
          case "reject":
          case "reject-drop":
            urlRewrite.push(`${rw.pattern} _ reject`);
            break;
          case "reject-200":
            mapLocal.push(`${rw.pattern} data-type=text data="" status-code=200`);
            break;
          case "reject-img":
            mapLocal.push(`${rw.pattern} data-type=tiny-gif status-code=200`);
            break;
          case "reject-dict":
            mapLocal.push(`${rw.pattern} data-type=text data="{}" status-code=200 header="Content-Type:application/json"`);
            break;
          case "reject-array":
            mapLocal.push(`${rw.pattern} data-type=text data="[]" status-code=200 header="Content-Type:application/json"`);
            break;
        }
        break;
      case "header": {
        const dir = rw.direction === "response" ? "http-response" : "http-request";
        if (rw.op === "replace-regex") headerRewrite.push(`${dir} ${rw.pattern} header-replace-regex ${rw.field} ${rw.regex} ${rw.value ?? ""}`.trimEnd());
        else if (rw.op === "del") headerRewrite.push(`${dir} ${rw.pattern} header-del ${rw.field}`);
        else headerRewrite.push(`${dir} ${rw.pattern} header-${rw.op} ${rw.field} ${rw.value ?? ""}`.trimEnd());
        break;
      }
      case "body":
        bodyRewrite.push(`http-${rw.direction} ${rw.pattern} ${rw.regex} ${rw.replacement}`);
        break;
      case "jq":
        bodyRewrite.push(`http-${rw.direction}-jq ${rw.pattern} '${rw.expr.replace(/^'|'$/g, "")}'`);
        break;
      case "mock": {
        if (rw.dataType === "file") {
          warnings.push(`[Map Local] mock 数据为文件引用（${rw.data ?? "?"}），无法内联转换，已跳过 ${rw.pattern}`);
          break;
        }
        const dt = rw.dataType === "json" ? "text" : rw.dataType;
        const parts = [`data-type=${dt}`];
        if (rw.data !== undefined && rw.dataType !== "tiny-gif") parts.push(`data="${rw.data}"`);
        parts.push(`status-code=${rw.statusCode ?? 200}`);
        const ct = rw.contentType ?? (rw.dataType === "json" ? "application/json" : undefined);
        if (ct) parts.push(`header="Content-Type:${ct}"`);
        mapLocal.push(`${rw.pattern} ${parts.join(" ")}`);
        break;
      }
    }
  }
  return { urlRewrite, headerRewrite, bodyRewrite, mapLocal };
}

function genSurgeScript(sc: Script, i: number, profile: Profile, warnings: string[]): string {
  const name = (sc.tag ?? `script-${i}`).replace(/\s+/g, "-");
  const arg = convertPlaceholders(sc.argument, profile, "surge", warnings);
  const parts: string[] = [];
  switch (sc.type) {
    case "http-request":
    case "http-response":
      parts.push(`type=${sc.type}`, `pattern=${sc.pattern}`, `script-path=${sc.path}`);
      if (sc.requiresBody) parts.push("requires-body=1");
      if (sc.binaryBodyMode) parts.push("binary-body-mode=1");
      if (sc.maxSize) parts.push(`max-size=${sc.maxSize}`);
      break;
    case "cron":
      parts.push("type=cron", `cronexp="${sc.cronexp}"`, `script-path=${sc.path}`, "wake-system=1");
      break;
    case "generic":
      parts.push("type=generic", `script-path=${sc.path}`);
      break;
    case "network-changed":
      parts.push("type=event", "event-name=network-changed", `script-path=${sc.path}`);
      break;
  }
  if (sc.timeout) parts.push(`timeout=${sc.timeout}`);
  if (arg) parts.push(`argument=${arg}`);
  return `${name} = ${parts.join(",")}`;
}

export function genSurge(profile: Profile): GenResult {
  const warnings: string[] = [];
  const L: string[] = [];
  const m = profile.meta;
  L.push(`#!name=${m.name ?? "Converted Module"}`);
  if (m.desc) L.push(`#!desc=${m.desc}`);
  if (m.author) L.push(`#!author=${m.author}`);
  if (m.homepage) L.push(`#!homepage=${m.homepage}`);
  if (m.category || m.tag) L.push(`#!category=${m.category ?? m.tag}`);
  if (profile.args.length) {
    L.push(`#!arguments=${profile.args.map((a) => `${a.name}:${a.defaultValue}`).join(",")}`);
    const desc = profile.args
      .filter((a) => a.tag || a.desc)
      .map((a) => `${a.name}: ${[a.tag, a.desc].filter(Boolean).join(" - ")}`)
      .join("; ");
    if (desc) L.push(`#!arguments-desc=${desc}`);
  }

  if (profile.rules.length) {
    L.push("", "[Rule]");
    for (const r of profile.rules) {
      const line = genRule(r, "surge", warnings);
      if (line) L.push(line);
    }
  }
  const { urlRewrite, headerRewrite, bodyRewrite, mapLocal } = genSurgeRewrites(profile, warnings);
  if (urlRewrite.length) L.push("", "[URL Rewrite]", ...urlRewrite);
  if (headerRewrite.length) L.push("", "[Header Rewrite]", ...headerRewrite);
  if (bodyRewrite.length) L.push("", "[Body Rewrite]", ...bodyRewrite);
  if (mapLocal.length) L.push("", "[Map Local]", ...mapLocal);
  if (profile.scripts.length) {
    L.push("", "[Script]");
    profile.scripts.forEach((sc, i) => L.push(genSurgeScript(sc, i, profile, warnings)));
  }
  if (profile.mitmHostnames.length) {
    L.push("", "[MITM]", `hostname = %APPEND% ${profile.mitmHostnames.join(", ")}`);
  }
  return { output: L.join("\n") + "\n", warnings };
}

/* ------------------------------ QX 生成 ------------------------------ */

function genQxRewrite(rw: Rewrite, warnings: string[]): string | null {
  switch (rw.kind) {
    case "redirect":
      return `${rw.pattern} url ${rw.status} ${rw.location}`;
    case "transparent":
      warnings.push(`[rewrite_local] QX 无透明重写（header 型），已降级为 307 重定向: ${rw.pattern}`);
      return `${rw.pattern} url 307 ${rw.replacement}`;
    case "reject":
      return `${rw.pattern} url ${rw.variant === "reject-drop" ? "reject" : rw.variant}`;
    case "header": {
      const kw = `${rw.direction}-header`;
      if (rw.op === "replace") {
        return `${rw.pattern} url ${kw} \\r\\n${rw.field}:[^\\r\\n]* ${kw} \\r\\n${rw.field}: ${rw.value ?? ""}`.trimEnd();
      }
      if (rw.op === "del") {
        return `${rw.pattern} url ${kw} \\r\\n${rw.field}:[^\\r\\n]* ${kw} \\r\\n`;
      }
      warnings.push(`[rewrite_local] QX 头部改写为整段正则，header-${rw.op} 无可靠等价物，已跳过: ${rw.pattern} (${rw.field})`);
      return null;
    }
    case "body":
      return `${rw.pattern} url ${rw.direction}-body ${rw.regex} ${rw.direction}-body ${rw.replacement}`;
    case "jq":
      warnings.push(`[rewrite_local] QX 不支持 jq 表达式改写，已跳过: ${rw.pattern}`);
      return null;
    case "mock": {
      // QX 无内联 mock；能近似的用 reject-* 系列（返回固定 200 响应）
      const empty = rw.data === undefined || rw.data === "";
      const sc = rw.statusCode ?? 200;
      if (sc === 200) {
        if (rw.dataType === "tiny-gif") return `${rw.pattern} url reject-img`;
        if (rw.data === "{}") return `${rw.pattern} url reject-dict`;
        if (rw.data === "[]") return `${rw.pattern} url reject-array`;
        if (empty && rw.dataType !== "file") return `${rw.pattern} url reject-200`;
      }
      warnings.push(`[rewrite_local] QX 不支持内联 mock 响应（数据: ${rw.data ?? "文件引用"}），无法近似为 reject-*，已跳过: ${rw.pattern}`);
      return null;
    }
  }
}

function genQxScriptRewrite(sc: Script & { type: "http-request" | "http-response" }, warnings: string[]): string {
  const action =
    sc.type === "http-request"
      ? sc.requiresBody
        ? "script-request-body"
        : "script-request-header"
      : sc.requiresBody
        ? "script-response-body"
        : "script-response-header";
  if (sc.argument) warnings.push(`[rewrite_local] QX 重写脚本不支持 argument，已丢弃（脚本: ${sc.path}）`);
  if (sc.timeout) warnings.push(`[rewrite_local] QX 重写脚本不支持 timeout，已丢弃（脚本: ${sc.path}）`);
  return `${sc.pattern} url ${action} ${sc.path}`;
}

export function genQx(profile: Profile): GenResult {
  const warnings: string[] = [];
  const L: string[] = [];
  const m = profile.meta;
  L.push(`# ${m.name ?? "Converted Rewrite"}`);
  if (m.desc) L.push(`# ${m.desc}`);
  if (m.author) L.push(`# author: ${m.author}`);
  if (m.homepage) L.push(`# homepage: ${m.homepage}`);

  if (profile.rules.length) {
    L.push("", "[filter_local]");
    for (const r of profile.rules) {
      const line = genRule(r, "qx", warnings);
      if (line) L.push(line);
    }
  }

  const rewriteLines: string[] = [];
  for (const rw of profile.rewrites) {
    // QX 不支持占位符 → 已在 convertPlaceholders 处理 argument；pattern 内占位符少见，原样输出
    const line = genQxRewrite(rw, warnings);
    if (line) rewriteLines.push(line);
  }
  const httpScripts = profile.scripts.filter((s): s is Script & { type: "http-request" | "http-response" } => s.type === "http-request" || s.type === "http-response");
  for (const sc of httpScripts) {
    let line = genQxScriptRewrite(sc, warnings);
    line = convertPlaceholders(line, profile, "qx", warnings) ?? line;
    rewriteLines.push(line);
  }
  if (rewriteLines.length) L.push("", "[rewrite_local]", ...rewriteLines);

  const taskLines: string[] = [];
  for (const sc of profile.scripts) {
    if (sc.type === "cron") {
      const extra = [sc.tag ? `tag=${sc.tag}` : null, sc.imgUrl ? `img-url=${sc.imgUrl}` : null, "enabled=true"].filter(Boolean).join(", ");
      taskLines.push(`${sc.cronexp} ${sc.path}, ${extra}`);
    } else if (sc.type === "generic") {
      taskLines.push(`event-interaction ${sc.path}, ${[sc.tag ? `tag=${sc.tag}` : null, "enabled=true"].filter(Boolean).join(", ")}`);
      warnings.push(`[task_local] generic 脚本转为 event-interaction（QX 交互触发），行为略有差异: ${sc.path}`);
    } else if (sc.type === "network-changed") {
      taskLines.push(`event-network ${sc.path}`);
    }
  }
  if (taskLines.length) {
    L.push("", "[task_local]", "# 注意：task_local 无法通过 rewrite_remote 远程引用，需手动粘贴进 QX 配置", ...taskLines);
  }

  if (profile.mitmHostnames.length) {
    L.push("", "[mitm]", `hostname = ${profile.mitmHostnames.join(", ")}`);
  }
  if (profile.args.length) {
    warnings.push(`QX 不支持用户参数（共 ${profile.args.length} 个），占位符均已代入默认值`);
  }
  return { output: L.join("\n") + "\n", warnings };
}

/* ------------------------------ 入口 ------------------------------ */

export function generate(profile: Profile, target: Fmt): GenResult {
  if (target === "loon") return genLoon(profile);
  if (target === "surge") return genSurge(profile);
  return genQx(profile);
}

export const FILE_EXT: Record<Fmt, string> = {
  loon: "plugin",
  surge: "sgmodule",
  qx: "snippet",
};
