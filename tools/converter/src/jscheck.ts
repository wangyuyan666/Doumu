import type { Fmt, JsVerdict, Profile } from "./types";

/**
 * 各端脚本 API 支持矩阵（依据官方文档）：
 * - Surge:  manual.nssurge.com/scripting/common.html
 * - Loon:   nsloon.app/docs/Script/script_api/
 * - QX:     github.com/crossutility/Quantumult-X 示例脚本
 */
const API_SUPPORT: Record<string, { re: RegExp; envs: Fmt[] }> = {
  // QX 专属
  "$task.fetch": { re: /\$task\s*\.\s*fetch\b/, envs: ["qx"] },
  "$prefs": { re: /\$prefs\s*\./, envs: ["qx"] },
  "$notify()": { re: /\$notify\s*\(/, envs: ["qx"] },
  "$resource": { re: /\$resource\s*\./, envs: ["qx"] },
  // Surge/Loon 共有
  "$httpClient": { re: /\$httpClient\s*\./, envs: ["surge", "loon"] },
  "$persistentStore": { re: /\$persistentStore\s*\./, envs: ["surge", "loon"] },
  "$notification.post": { re: /\$notification\s*\.\s*post\b/, envs: ["surge", "loon"] },
  "$utils": { re: /\$utils\s*\./, envs: ["surge", "loon"] },
  "$argument": { re: /\$argument\b/, envs: ["surge", "loon"] },
  // Surge 专属
  "$httpAPI": { re: /\$httpAPI\s*\(/, envs: ["surge"] },
  // Loon 专属
  "$config.getConfig": { re: /\$config\s*\.\s*(getConfig|setConfig|getSubPolicies|getSelectedPolicy|setRunningModel)\b/, envs: ["loon"] },
  "$loon": { re: /\$loon\b/, envs: ["loon"] },
  // 任何客户端都不支持
  "require()": { re: /\brequire\s*\(\s*['"]/, envs: [] },
  "process.env": { re: /\bprocess\s*\.\s*env\b/, envs: [] },
};

/** 兼容层 shim 能补齐的 API（见 shim.ts） */
const SHIMMABLE = new Set([
  "$task.fetch", "$prefs", "$notify()",
  "$httpClient", "$persistentStore", "$notification.post",
]);

/** 脚本自带多端适配层的特征（Env.js 等社区通用封装） */
const UNIVERSAL_MARKERS = /\bisQuanX\b|\bisSurge\b|\bisLoon\b|new\s+Env\s*\(|typeof\s+\$task|typeof\s+\$httpClient|typeof\s+\$environment/;

export interface JsCheckResult extends JsVerdict {
  /** 不兼容 API 是否全部可由 shim 补齐 */
  shimmable: boolean;
}

/** 静态扫描脚本源码，判断对目标端的兼容性 */
export function checkScriptSource(path: string, source: string, target: Fmt): JsCheckResult {
  if (UNIVERSAL_MARKERS.test(source)) {
    return { path, status: "universal", offendingApis: [], shimmable: false };
  }
  const offending: string[] = [];
  let shimmable = true;
  for (const [api, { re, envs }] of Object.entries(API_SUPPORT)) {
    if (!re.test(source)) continue;
    if (!envs.includes(target)) {
      offending.push(api);
      if (!SHIMMABLE.has(api)) shimmable = false;
    }
  }
  if (offending.length === 0) {
    return { path, status: "compatible", offendingApis: [], shimmable: false };
  }
  return { path, status: "incompatible", offendingApis: offending, shimmable };
}

const SCRIPT_FETCH_TIMEOUT_MS = 8000;
const SCRIPT_MAX_BYTES = 1024 * 1024;
const SCRIPT_MAX_COUNT = 8;

/** 取脚本路径的文件名（本地路径与附带上传按 basename 匹配） */
export function scriptBasename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/**
 * 检查 profile 引用的所有脚本：
 * - 远程 http(s) 路径拉取后检查
 * - 本地路径若在 attached（用户上传的 JS，按文件名匹配）中则用上传内容检查，否则标 unknown
 */
export async function checkProfileScripts(profile: Profile, target: Fmt, attached: Map<string, string> = new Map()): Promise<JsCheckResult[]> {
  const paths = [...new Set(profile.scripts.map((s) => s.path).filter((p) => /^https?:\/\//i.test(p)))];
  const skipped = paths.length - Math.min(paths.length, SCRIPT_MAX_COUNT);
  const results = await Promise.all(
    paths.slice(0, SCRIPT_MAX_COUNT).map(async (p): Promise<JsCheckResult> => {
      try {
        const res = await fetch(p, {
          signal: AbortSignal.timeout(SCRIPT_FETCH_TIMEOUT_MS),
          headers: { "user-agent": "config-converter/1.0" },
        });
        if (!res.ok) {
          return { path: p, status: "unknown", offendingApis: [], shimmable: false, error: `HTTP ${res.status}` };
        }
        const text = await res.text();
        if (text.length > SCRIPT_MAX_BYTES) {
          return { path: p, status: "unknown", offendingApis: [], shimmable: false, error: "脚本超过 1MB，未检查" };
        }
        return checkScriptSource(p, text, target);
      } catch (e) {
        return { path: p, status: "unknown", offendingApis: [], shimmable: false, error: `拉取失败: ${(e as Error).message}` };
      }
    })
  );
  if (skipped > 0) {
    results.push({ path: "(其余脚本)", status: "unknown", offendingApis: [], shimmable: false, error: `脚本数量超限，${skipped} 个未检查` });
  }
  // 本地路径脚本：优先用附带上传的同名文件检查，否则无法检查
  for (const p of [...new Set(profile.scripts.map((s) => s.path))]) {
    if (/^https?:\/\//i.test(p) || !p) continue;
    const uploaded = attached.get(scriptBasename(p));
    if (uploaded !== undefined) {
      results.push(checkScriptSource(p, uploaded, target));
    } else {
      results.push({ path: p, status: "unknown", offendingApis: [], shimmable: false, error: "本地路径脚本，无法远程检查；可在上传/粘贴方式下附带该 JS 文件一并检查" });
    }
  }
  return results;
}

const FMT_NAME: Record<Fmt, string> = { loon: "Loon", surge: "Surge", qx: "Quantumult X" };

/** 把检查结果渲染为输出文件头部的注释块 */
export function renderJsReport(results: JsCheckResult[], target: Fmt, jsconvert: boolean): string[] {
  const lines: string[] = [];
  for (const r of results) {
    if (r.status === "incompatible") {
      lines.push(`# ⚠ JS 兼容性: ${r.path}`);
      lines.push(`#   使用了 ${FMT_NAME[target]} 不支持的 API: ${r.offendingApis.join(", ")}`);
      if (jsconvert) {
        lines.push(`#   已通过本服务 /script 端点注入兼容层自动转换`);
      } else if (r.shimmable) {
        lines.push(`#   可在转换请求上加 &jsconvert=1，由本服务注入兼容层自动转换`);
      } else {
        lines.push(`#   含无法自动补齐的 API，需手动改写脚本`);
      }
    } else if (r.status === "unknown" && r.error) {
      lines.push(`# ⚠ JS 兼容性: ${r.path} 未能检查（${r.error}）`);
    } else if (r.status === "universal") {
      lines.push(`# ✓ JS 兼容性: ${r.path} 自带多端适配层，无需转换`);
    }
  }
  return lines;
}
