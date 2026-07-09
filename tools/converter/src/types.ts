/** 三端目标格式 */
export type Fmt = "loon" | "surge" | "qx";

/** 插件/模块元信息（#!key） */
export interface Meta {
  name?: string;
  desc?: string;
  author?: string;
  homepage?: string;
  icon?: string;
  category?: string;
  system?: string;
  version?: string;
  tag?: string;
}

/** 用户可配置参数（Loon [Argument] / Surge #!arguments） */
export interface Arg {
  name: string;
  type: "input" | "select" | "switch";
  defaultValue: string;
  options?: string[];
  tag?: string;
  desc?: string;
}

export type Direction = "request" | "response";

export type RejectVariant =
  | "reject"
  | "reject-200"
  | "reject-img"
  | "reject-dict"
  | "reject-array"
  | "reject-drop";

/** 重写规则的中间表示 */
export type Rewrite =
  | { kind: "redirect"; pattern: string; location: string; status: 302 | 307 }
  /** 透明重写（Loon/Surge header 型），客户端无感知改写 URL */
  | { kind: "transparent"; pattern: string; replacement: string }
  | { kind: "reject"; pattern: string; variant: RejectVariant }
  | {
      kind: "header";
      direction: Direction;
      pattern: string;
      op: "add" | "del" | "replace" | "replace-regex";
      field: string;
      value?: string;
      regex?: string;
    }
  | { kind: "body"; direction: Direction; pattern: string; regex: string; replacement: string }
  /** jq 表达式改写 JSON body（Loon *-json-jq / Surge http-*-jq） */
  | { kind: "jq"; direction: Direction; pattern: string; expr: string }
  | {
      kind: "mock";
      pattern: string;
      dataType: "text" | "json" | "tiny-gif" | "base64" | "file";
      data?: string;
      statusCode?: number;
      contentType?: string;
    };

/** 脚本规则的中间表示 */
export type Script =
  | {
      type: "http-request" | "http-response";
      pattern: string;
      path: string;
      requiresBody?: boolean;
      binaryBodyMode?: boolean;
      maxSize?: number;
      timeout?: number;
      tag?: string;
      argument?: string;
    }
  | { type: "cron"; cronexp: string; path: string; timeout?: number; tag?: string; argument?: string; imgUrl?: string }
  | { type: "generic"; path: string; timeout?: number; tag?: string; argument?: string; imgUrl?: string }
  | { type: "network-changed"; path: string; timeout?: number; tag?: string; argument?: string };

/** 分流规则（统一为 Loon/Surge 风格大写存储） */
export interface Rule {
  type: string;
  value?: string;
  policy: string;
  noResolve?: boolean;
}

/** 解析后的统一中间表示 */
export interface Profile {
  source: Fmt;
  meta: Meta;
  args: Arg[];
  rules: Rule[];
  rewrites: Rewrite[];
  scripts: Script[];
  mitmHostnames: string[];
  /** 解析阶段产生的告警（无法识别/丢弃的行） */
  warnings: string[];
}

/** 单个脚本文件的 JS 兼容性结论 */
export interface JsVerdict {
  path: string;
  /** universal: 脚本自带多端适配层 */
  status: "compatible" | "incompatible" | "universal" | "unknown";
  /** 目标端不支持的 API 列表 */
  offendingApis: string[];
  /** 检查失败原因（拉取超时等） */
  error?: string;
}
