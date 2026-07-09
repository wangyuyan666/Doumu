// 统一规则模型 + 三客户端序列化
//
// 类型支持依据官方文档核实（2026-07）：
// - Loon:  https://nsloon.app/docs/Rule/domain_rule | ip_rule | http_rule | port_rule | protocol_rule
// - Surge: https://manual.nssurge.com/rule/domain-based.html | ip-based.html | http.html | misc-rule.html
// - Quantumult X: https://github.com/crossutility/Quantumult-X (sample.conf / filter.snippet)
//
// 输出形态：
// - Surge / Loon：远程规则集（RULE-SET / 远程规则），行内不带策略，策略由引用方指定
// - Quantumult X：filter_remote 资源，行内必须带策略（可被 force-policy 覆盖）

export type ClientName = "loon" | "surge" | "qx";

export interface Rule {
  id: string;
  type: string;
  value: string;
  /** 仅 Quantumult X 输出使用（如 proxy / direct / reject 或策略组名） */
  policy: string;
  /** 仅 IP 类规则有效；QX 不支持该参数，输出时忽略 */
  noResolve?: boolean;
  remark?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TypeSpec {
  /** 各客户端是否支持；qx 值为其对应的类型名 */
  loon: boolean;
  surge: boolean;
  qx: string | null;
  /** IP 类规则允许 no-resolve */
  allowNoResolve?: boolean;
  validate: (value: string) => string | null; // 返回错误信息，null 表示通过
}

const IPV4_CIDR = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
const PORT_EXPR = /^(\d{1,5}(-\d{1,5})?|[<>]=?\d{1,5})$/;
// Loon 3.1.7+ 支持 HTTP/HTTPS/TCP/QUIC/STUN/UDP；Surge 另支持 DOH/DOH3/DOQ
const PROTOCOLS = ["HTTP", "HTTPS", "TCP", "UDP", "QUIC", "STUN", "DOH", "DOH3", "DOQ"];

function domainValidator(value: string): string | null {
  if (!value) return "值不能为空";
  if (/[\s,]/.test(value)) return "域名不能包含空格或逗号";
  return null;
}

function nonEmptyNoComma(value: string): string | null {
  if (!value) return "值不能为空";
  if (value.includes(",")) return "值不能包含逗号（会破坏规则行格式）";
  return null;
}

export const RULE_TYPES: Record<string, TypeSpec> = {
  "DOMAIN": { loon: true, surge: true, qx: "host", validate: domainValidator },
  "DOMAIN-SUFFIX": { loon: true, surge: true, qx: "host-suffix", validate: domainValidator },
  "DOMAIN-KEYWORD": { loon: true, surge: true, qx: "host-keyword", validate: nonEmptyNoComma },
  // 仅 QX 支持通配域名（host-wildcard，支持 * 和 ?）
  "DOMAIN-WILDCARD": { loon: false, surge: false, qx: "host-wildcard", validate: nonEmptyNoComma },
  "IP-CIDR": {
    loon: true, surge: true, qx: "ip-cidr", allowNoResolve: true,
    validate: (v) => (IPV4_CIDR.test(v) ? null : "IP-CIDR 格式无效，例：192.168.0.0/16"),
  },
  "IP-CIDR6": {
    loon: true, surge: true, qx: "ip6-cidr", allowNoResolve: true,
    validate: (v) => (/^[0-9a-fA-F:]+(\/\d{1,3})?$/.test(v) && v.includes(":") ? null : "IP-CIDR6 格式无效"),
  },
  "GEOIP": {
    loon: true, surge: true, qx: "geoip", allowNoResolve: true,
    validate: (v) => (/^[a-zA-Z]{2}$/.test(v) ? null : "GEOIP 需要两位国家/地区代码，例：CN"),
  },
  "IP-ASN": {
    loon: true, surge: true, qx: "ip-asn", allowNoResolve: true,
    validate: (v) => (/^\d+$/.test(v) ? null : "IP-ASN 需要纯数字 ASN 号"),
  },
  "URL-REGEX": {
    loon: true, surge: true, qx: null, // QX filter 不支持 URL 正则（仅 rewrite 支持）
    validate: (v) => {
      if (!v) return "值不能为空";
      if (v.includes(",")) return "正则不能包含逗号（会破坏规则行格式）";
      try { new RegExp(v); } catch { return "正则表达式无效"; }
      return null;
    },
  },
  "USER-AGENT": { loon: true, surge: true, qx: "user-agent", validate: nonEmptyNoComma },
  "DEST-PORT": {
    loon: true, surge: true, qx: null,
    validate: (v) => (PORT_EXPR.test(v) ? null : "端口格式无效，例：443 / 80-443 / >=1000"),
  },
  "SRC-PORT": {
    loon: true, surge: true, qx: null,
    validate: (v) => (PORT_EXPR.test(v) ? null : "端口格式无效，例：443 / 80-443 / >=1000"),
  },
  // Surge misc-rule 文档明确支持；Loon 手册未列出
  "SRC-IP": {
    loon: false, surge: true, qx: null,
    validate: (v) => (IPV4_CIDR.test(v) ? null : "SRC-IP 需要 IPv4 地址或 CIDR"),
  },
  "PROTOCOL": {
    loon: true, surge: true, qx: null,
    validate: (v) => (PROTOCOLS.includes(v.toUpperCase()) ? null : `协议需为：${PROTOCOLS.join("/")}`),
  },
};

export function validateRuleInput(input: {
  type?: unknown; value?: unknown; policy?: unknown; noResolve?: unknown;
}): string | null {
  const type = typeof input.type === "string" ? input.type.toUpperCase() : "";
  const spec = RULE_TYPES[type];
  if (!spec) return `不支持的规则类型：${String(input.type)}，可用：${Object.keys(RULE_TYPES).join(", ")}`;
  if (typeof input.value !== "string") return "value 必须是字符串";
  const err = spec.validate(input.value.trim());
  if (err) return err;
  if (typeof input.policy !== "string" || !input.policy.trim()) return "policy 不能为空（QX 输出需要，例：proxy / direct / reject）";
  if (input.policy.includes(",")) return "policy 不能包含逗号";
  if (input.noResolve && !spec.allowNoResolve) return `${type} 不支持 no-resolve 参数`;
  return null;
}

function serializeLine(rule: Rule, client: ClientName): string | null {
  const spec = RULE_TYPES[rule.type];
  if (!spec) return null;
  if (client === "qx") {
    if (!spec.qx) return null;
    // QX 不支持 no-resolve；行内必须带策略
    return `${spec.qx}, ${rule.value}, ${rule.policy}`;
  }
  if (!spec[client]) return null;
  // Surge / Loon 规则集行：类型,值[,no-resolve]，不带策略
  const noResolve = rule.noResolve && spec.allowNoResolve ? ",no-resolve" : "";
  return `${rule.type},${rule.value}${noResolve}`;
}

const CLIENT_LABEL: Record<ClientName, string> = {
  loon: "Loon (远程规则 / Rule Set)",
  surge: "Surge (RULE-SET)",
  qx: "Quantumult X (filter_remote)",
};

/** rules 需已按 policy 过滤；policy 仅用于输出头部标注 */
export function renderRuleset(rules: Rule[], client: ClientName, policy: string): string {
  const active = rules.filter((r) => r.enabled);
  const lines: string[] = [];
  let ruleCount = 0;
  let skipped = 0;
  for (const rule of active) {
    const line = serializeLine(rule, client);
    if (line === null) { skipped++; continue; }
    // 行尾注释在各客户端解析行为不一致，备注独立成行
    if (rule.remark) lines.push(`# ${rule.remark}`);
    lines.push(line);
    ruleCount++;
  }
  const header = [
    `# ${CLIENT_LABEL[client]}`,
    `# 策略：${policy}`,
    `# 规则数：${ruleCount}${skipped ? `（${skipped} 条类型不受此客户端支持，已跳过）` : ""}`,
    `# 更新时间：${new Date().toISOString()}`,
    "",
  ];
  return header.concat(lines).join("\n") + "\n";
}
