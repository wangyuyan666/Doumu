import { detectFormat, parse } from "./parse";
import { generate, FILE_EXT } from "./generate";
import { checkProfileScripts, renderJsReport, scriptBasename, type JsCheckResult } from "./jscheck";
import { wrapScript } from "./shim";
import { UI_HTML } from "./ui";
import type { Fmt } from "./types";

export interface Env {
  /** wrangler secret put TOKEN，所有端点均需携带 ?token=<TOKEN> */
  TOKEN: string;
}

const CONFIG_FETCH_TIMEOUT_MS = 10_000;
const CONFIG_MAX_BYTES = 3 * 1024 * 1024;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function text(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache", ...headers },
  });
}

/** 访问鉴权：?token=<TOKEN>（恒时比较，避免时序侧信道） */
function tokenValid(url: URL, env: Env): boolean {
  const token = url.searchParams.get("token") ?? "";
  if (!env.TOKEN || !token) return false;
  const a = new TextEncoder().encode(token);
  const b = new TextEncoder().encode(env.TOKEN);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function parseFmt(s: string | null): Fmt | null {
  if (s === "loon" || s === "surge") return s;
  if (s === "qx" || s === "quanx" || s === "quantumultx") return "qx";
  return null;
}

interface ResolvedInput {
  content: string;
  sourceUrl?: string;
  /** 附带上传的本地 JS 脚本：文件名 -> 源码 */
  attachedScripts: Map<string, string>;
}

/** 取输入内容：GET ?src= 远程拉取；POST 支持 multipart 文件 / 表单 content / 原始 body */
async function resolveInput(request: Request, url: URL): Promise<ResolvedInput | Response> {
  const src = url.searchParams.get("src");
  if (src) {
    if (!/^https?:\/\//i.test(src)) return text("400 src 必须是 http(s) URL\n", 400);
    let res: Response;
    try {
      res = await fetch(src, {
        signal: AbortSignal.timeout(CONFIG_FETCH_TIMEOUT_MS),
        headers: { "user-agent": "config-converter/1.0" },
      });
    } catch (e) {
      return text(`502 拉取远程文件失败: ${(e as Error).message}\n`, 502);
    }
    if (!res.ok) return text(`502 远程文件返回 HTTP ${res.status}\n`, 502);
    const body = await res.text();
    if (body.length > CONFIG_MAX_BYTES) return text("413 远程文件超过 3MB\n", 413);
    return { content: body, sourceUrl: src, attachedScripts: new Map() };
  }

  if (request.method !== "POST") {
    return text("400 缺少输入：GET 需携带 ?src=<远程URL>，或改用 POST 上传内容\n", 400);
  }
  const ct = request.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const form = await request.formData();
    // 附带的本地 JS 脚本（可多个），按文件名与 script-path 的 basename 匹配
    const attachedScripts = new Map<string, string>();
    for (const entry of form.getAll("script")) {
      const f = entry as unknown as File | string;
      if (typeof f === "string" || !f.name) continue;
      if (f.size > CONFIG_MAX_BYTES) return text(`413 附带脚本 ${f.name} 超过 3MB\n`, 413);
      attachedScripts.set(f.name, await f.text());
    }
    const file = form.get("file") as unknown as File | string | null;
    if (file && typeof file !== "string") {
      if (file.size > CONFIG_MAX_BYTES) return text("413 上传文件超过 3MB\n", 413);
      return { content: await file.text(), attachedScripts };
    }
    const content = form.get("content");
    if (typeof content === "string" && content.trim()) return { content, attachedScripts };
    return text("400 表单需包含 file（文件）或 content（文本）字段\n", 400);
  }
  const body = await request.text();
  if (body.length > CONFIG_MAX_BYTES) return text("413 请求体超过 3MB\n", 413);
  if (ct.includes("application/x-www-form-urlencoded")) {
    // 表单 content 字段优先；curl --data-binary 默认也是该 content-type，无 content 字段时按原始文本处理
    const params = new URLSearchParams(body);
    const content = params.get("content");
    if (content?.trim() && /^content=/.test(body)) return { content, attachedScripts: new Map() };
  }
  if (!body.trim()) return text("400 请求体为空\n", 400);
  return { content: body, attachedScripts: new Map() };
}

/** 对不兼容且可 shim 的远程脚本，把 script-path 改写为本服务 /script 代理地址 */
function rewriteScriptPaths(output: string, results: JsCheckResult[], target: Fmt, origin: string, token: string): { output: string; notes: string[] } {
  const notes: string[] = [];
  let out = output;
  for (const r of results) {
    if (r.status !== "incompatible" || !r.shimmable) continue;
    if (!/^https?:\/\//i.test(r.path)) continue;
    if (/\{\{\{|\{[\w-]+\}/.test(r.path)) {
      notes.push(`# ⚠ ${r.path} 含参数占位符，无法代理转换，保留原地址`);
      continue;
    }
    const proxied = `${origin}/script?token=${encodeURIComponent(token)}&target=${target}&src=${encodeURIComponent(r.path)}`;
    out = out.split(r.path).join(proxied);
    notes.push(`# ✓ 脚本已代理转换: ${r.path}`);
  }
  return { output: out, notes };
}

const USAGE = `配置互转服务 — Loon 插件 / Surge 模块 / Quantumult X 重写

端点（均需 ?token=<TOKEN>）:

  GET  /?token=<T>            Web 管理页（表单转换、结果复制/下载）
  GET  /help?token=<T>        本用法说明

  GET  /convert?token=<T>&target=loon|surge|qx&src=<远程URL>
       [&from=loon|surge|qx]   来源格式，默认自动识别
       [&check=0]              关闭 JS 兼容性检查（默认开启）
       [&jsconvert=1]          对不兼容脚本注入兼容层（经 /script 代理）
       [&report=1]             以 JSON 返回转换结果与告警

  POST /convert?token=<T>&target=...
       三种输入任选:
       - 原始文本 body（Content-Type 任意）
       - multipart 表单字段 file（本地文件上传）
       - 表单字段 content（文本粘贴）
       multipart 可额外附带多个 script 字段（本地 JS 文件，
       文件名需与 script-path 的文件名一致）：一并做兼容性检查，
       jsconvert=1 时转换结果经 report=1 的 convertedScripts 返回

  GET  /script?token=<T>&target=loon|surge|qx&src=<脚本URL>
       返回注入兼容层后的脚本（jsconvert=1 时自动使用）
  POST /script?token=<T>&target=loon|surge|qx
       body 为 JS 内容（或 multipart file 字段），返回注入兼容层后的脚本
       —— 本地脚本单独转换用这个

示例:
  curl "https://<worker>/convert?token=T&target=surge&src=https://example.com/x.plugin"
  curl -X POST --data-binary @x.sgmodule "https://<worker>/convert?token=T&target=qx"
  curl -F file=@x.plugin "https://<worker>/convert?token=T&target=surge&report=1"
`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (!tokenValid(url, env)) {
      return text("401 无效的 token，请使用 ?token=<密钥> 访问\n", 401);
    }

    if (pathname === "/" && request.method === "GET") {
      return new Response(UI_HTML, {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
      });
    }

    if (pathname === "/help" && request.method === "GET") {
      return text(USAGE);
    }

    // 脚本转换：POST 直接提交 JS 内容（本地脚本场景），返回注入兼容层后的脚本
    if (pathname === "/script" && request.method === "POST") {
      const target = parseFmt(url.searchParams.get("target"));
      if (!target) return text("400 缺少或非法的 target（loon|surge|qx）\n", 400);
      let source: string;
      const ct = request.headers.get("content-type") ?? "";
      if (ct.includes("multipart/form-data")) {
        const form = await request.formData();
        const f = (form.get("file") ?? form.get("script")) as unknown as File | string | null;
        if (!f || typeof f === "string") return text("400 表单需包含 file 或 script 文件字段\n", 400);
        source = await f.text();
      } else {
        source = await request.text();
      }
      if (!source.trim()) return text("400 脚本内容为空\n", 400);
      if (source.length > CONFIG_MAX_BYTES) return text("413 脚本超过 3MB\n", 413);
      return new Response(wrapScript(source, target), {
        headers: { "content-type": "application/javascript; charset=utf-8" },
      });
    }

    // 脚本代理：拉取远程 JS 并注入目标端兼容层
    if (pathname === "/script" && request.method === "GET") {
      const target = parseFmt(url.searchParams.get("target"));
      const src = url.searchParams.get("src");
      if (!target) return text("400 缺少或非法的 target（loon|surge|qx）\n", 400);
      if (!src || !/^https?:\/\//i.test(src)) return text("400 src 必须是 http(s) URL\n", 400);
      let res: Response;
      try {
        res = await fetch(src, {
          signal: AbortSignal.timeout(CONFIG_FETCH_TIMEOUT_MS),
          headers: { "user-agent": "config-converter/1.0" },
        });
      } catch (e) {
        return text(`502 拉取脚本失败: ${(e as Error).message}\n`, 502);
      }
      if (!res.ok) return text(`502 脚本源返回 HTTP ${res.status}\n`, 502);
      const source = await res.text();
      if (source.length > CONFIG_MAX_BYTES) return text("413 脚本超过 3MB\n", 413);
      return new Response(wrapScript(source, target), {
        headers: {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "public, max-age=900",
        },
      });
    }

    if (pathname === "/convert" && (request.method === "GET" || request.method === "POST")) {
      const target = parseFmt(url.searchParams.get("target"));
      if (!target) return text("400 缺少或非法的 target（loon|surge|qx）\n", 400);

      const input = await resolveInput(request, url);
      if (input instanceof Response) return input;

      const fromParam = url.searchParams.get("from");
      const from = fromParam && fromParam !== "auto" ? parseFmt(fromParam) : detectFormat(input.content);
      if (!from) {
        return text("400 无法识别来源格式，请显式指定 &from=loon|surge|qx\n", 400);
      }
      if (fromParam && fromParam !== "auto" && !parseFmt(fromParam)) {
        return text("400 非法的 from（loon|surge|qx）\n", 400);
      }

      const profile = parse(input.content, from);
      const gen = generate(profile, target);
      const warnings = [...profile.warnings, ...gen.warnings];

      // JS 兼容性检查（默认开启；同端转换也检查，便于自查）
      const check = url.searchParams.get("check") !== "0";
      const jsconvert = url.searchParams.get("jsconvert") === "1";
      let jsResults: JsCheckResult[] = [];
      let output = gen.output;
      const notes: string[] = [];
      // 附带上传的本地脚本：不兼容且可补齐时，注入兼容层后随响应返回（路径保持本地不变）
      const convertedScripts: { name: string; content: string }[] = [];
      if (check && profile.scripts.length) {
        jsResults = await checkProfileScripts(profile, target, input.attachedScripts);
        if (jsconvert) {
          const token = url.searchParams.get("token") ?? "";
          const r = rewriteScriptPaths(output, jsResults, target, url.origin, token);
          output = r.output;
          notes.push(...r.notes);
          for (const jr of jsResults) {
            if (jr.status !== "incompatible" || !jr.shimmable || /^https?:\/\//i.test(jr.path)) continue;
            const src = input.attachedScripts.get(scriptBasename(jr.path));
            if (src === undefined) continue;
            convertedScripts.push({ name: scriptBasename(jr.path), content: wrapScript(src, target) });
            notes.push(`# ✓ 本地脚本已注入兼容层: ${scriptBasename(jr.path)}（见响应 convertedScripts，下载后替换原文件）`);
          }
        }
      }

      if (url.searchParams.get("report") === "1") {
        return json({
          from,
          target,
          source: input.sourceUrl ?? "(inline)",
          warnings,
          jsCompatibility: jsResults.map(({ path, status, offendingApis, shimmable, error }) => ({
            path, status, offendingApis, shimmable, ...(error ? { error } : {}),
          })),
          convertedScripts,
          output,
        });
      }

      const header: string[] = [];
      if (convertedScripts.length) {
        header.push(`# ⚠ 有 ${convertedScripts.length} 个本地脚本已生成兼容层版本，纯文本模式无法携带，请加 &report=1 或使用管理页下载`);
      }
      const jsReport = renderJsReport(jsResults, target, jsconvert);
      if (warnings.length || jsReport.length || notes.length) {
        header.push(`# ===== 转换报告 (${from} -> ${target}) =====`);
        for (const w of warnings) header.push(`# ⚠ ${w}`);
        header.push(...jsReport, ...notes);
        header.push("# =====================================", "");
      }
      const name = (profile.meta.name ?? "converted").replace(/[^\w一-龥.-]+/g, "_");
      return text(header.join("\n") + output, 200, {
        "content-disposition": `inline; filename="${name}.${FILE_EXT[target]}"`,
      });
    }

    return text("404 未知端点，访问 /?token=<密钥> 查看用法\n", 404);
  },
};
