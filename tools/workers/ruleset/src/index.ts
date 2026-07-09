import { renderRuleset, validateRuleInput, RULE_TYPES, type ClientName, type Rule } from "./rules";
import { ADMIN_HTML } from "./admin";

export interface Env {
  RULES_KV: KVNamespace;
  /** wrangler secret put TOKEN，管理页与订阅地址均需携带 ?token=<TOKEN> */
  TOKEN: string;
}

const KV_KEY = "rules";

async function loadRules(env: Env): Promise<Rule[]> {
  const raw = await env.RULES_KV.get(KV_KEY);
  return raw ? (JSON.parse(raw) as Rule[]) : [];
}

async function saveRules(env: Env, rules: Rule[]): Promise<void> {
  await env.RULES_KV.put(KV_KEY, JSON.stringify(rules));
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function text(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache" },
  });
}

/** 访问鉴权：?token=<TOKEN>，管理页与订阅共用 */
function tokenValid(url: URL, env: Env): boolean {
  const token = url.searchParams.get("token") ?? "";
  if (!env.TOKEN || !token) return false;
  // 定长比较避免时序侧信道
  const a = new TextEncoder().encode(token);
  const b = new TextEncoder().encode(env.TOKEN);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

interface RuleInput {
  type?: unknown; value?: unknown; policy?: unknown;
  noResolve?: unknown; remark?: unknown; enabled?: unknown;
}

const CLIENT_PATHS: Record<string, ClientName> = {
  "/loon": "loon",
  "/surge": "surge",
  "/qx": "qx",
  "/quanx": "qx",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method.toUpperCase();

    // 管理页：需 ?token=<TOKEN>
    if (method === "GET" && pathname === "/") {
      if (!tokenValid(url, env)) {
        return text("403 拒绝访问：请使用 /?token=<密钥> 访问\n", 403);
      }
      return new Response(ADMIN_HTML, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    // 订阅输出：需 ?token=<TOKEN>
    const client = CLIENT_PATHS[pathname];
    if (client && method === "GET") {
      if (!tokenValid(url, env)) {
        return text("# 403 无效的 token，订阅地址需携带 ?token=<密钥>\n", 403);
      }
      const rules = await loadRules(env);
      return text(renderRuleset(rules, client));
    }

    // 规则类型元数据（管理页下拉用）
    if (method === "GET" && pathname === "/api/types") {
      const types = Object.entries(RULE_TYPES).map(([name, spec]) => ({
        name,
        loon: spec.loon,
        surge: spec.surge,
        qx: spec.qx !== null,
        allowNoResolve: Boolean(spec.allowNoResolve),
      }));
      return json(types);
    }

    // 列表（公开读，支持 ?type= 与 ?q= 过滤）
    if (method === "GET" && pathname === "/api/rules") {
      let rules = await loadRules(env);
      const type = url.searchParams.get("type");
      const q = url.searchParams.get("q")?.toLowerCase();
      if (type) rules = rules.filter((r) => r.type === type.toUpperCase());
      if (q) {
        rules = rules.filter(
          (r) => r.value.toLowerCase().includes(q) || (r.remark ?? "").toLowerCase().includes(q),
        );
      }
      return json(rules);
    }

    // 写操作（无鉴权）
    if (pathname.startsWith("/api/rules") && ["POST", "PUT", "DELETE"].includes(method)) {
      // 新增
      if (method === "POST" && pathname === "/api/rules") {
        const input = (await request.json().catch(() => null)) as RuleInput | null;
        if (!input) return json({ error: "请求体必须是 JSON" }, 400);
        const err = validateRuleInput(input);
        if (err) return json({ error: err }, 400);

        const rules = await loadRules(env);
        const now = new Date().toISOString();
        const rule: Rule = {
          id: crypto.randomUUID(),
          type: String(input.type).toUpperCase(),
          value: String(input.value).trim(),
          policy: String(input.policy).trim(),
          noResolve: Boolean(input.noResolve),
          remark: typeof input.remark === "string" ? input.remark.trim() : undefined,
          enabled: input.enabled === undefined ? true : Boolean(input.enabled),
          createdAt: now,
          updatedAt: now,
        };
        // 去重：同类型同值视为重复
        if (rules.some((r) => r.type === rule.type && r.value === rule.value)) {
          return json({ error: `规则已存在：${rule.type},${rule.value}` }, 409);
        }
        rules.push(rule);
        await saveRules(env, rules);
        return json(rule, 201);
      }

      // 修改 / 删除：/api/rules/:id
      const match = pathname.match(/^\/api\/rules\/([0-9a-f-]{36})$/);
      if (!match) return json({ error: "路径无效" }, 404);
      const id = match[1];
      const rules = await loadRules(env);
      const index = rules.findIndex((r) => r.id === id);
      if (index === -1) return json({ error: "规则不存在" }, 404);

      if (method === "DELETE") {
        const [removed] = rules.splice(index, 1);
        await saveRules(env, rules);
        return json({ deleted: removed });
      }

      if (method === "PUT") {
        const input = (await request.json().catch(() => null)) as RuleInput | null;
        if (!input) return json({ error: "请求体必须是 JSON" }, 400);
        const current = rules[index];
        const merged = {
          type: input.type ?? current.type,
          value: input.value ?? current.value,
          policy: input.policy ?? current.policy,
          noResolve: input.noResolve ?? current.noResolve,
        };
        const err = validateRuleInput(merged);
        if (err) return json({ error: err }, 400);

        const updated: Rule = {
          ...current,
          type: String(merged.type).toUpperCase(),
          value: String(merged.value).trim(),
          policy: String(merged.policy).trim(),
          noResolve: Boolean(merged.noResolve),
          remark: input.remark === undefined
            ? current.remark
            : (typeof input.remark === "string" && input.remark.trim() ? input.remark.trim() : undefined),
          enabled: input.enabled === undefined ? current.enabled : Boolean(input.enabled),
          updatedAt: new Date().toISOString(),
        };
        if (rules.some((r, i) => i !== index && r.type === updated.type && r.value === updated.value)) {
          return json({ error: `规则已存在：${updated.type},${updated.value}` }, 409);
        }
        rules[index] = updated;
        await saveRules(env, rules);
        return json(updated);
      }
    }

    return json({ error: "Not Found" }, 404);
  },
} satisfies ExportedHandler<Env>;
