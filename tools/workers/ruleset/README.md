# Ruleset Worker

部署在 Cloudflare Workers 上的分流规则管理服务：维护一份统一规则，输出 Loon / Surge / Quantumult X 三种客户端格式，支持增删改查。

## 端点

| 路径 | 方法 | 鉴权 | 说明 |
|---|---|---|---|
| `/?token=<密钥>` | GET | URL 参数 | Web 管理页，无 token 返回 403 |
| `/loon?token=<密钥>` | GET | URL 参数 | Loon 远程规则（行内不带策略） |
| `/surge?token=<密钥>` | GET | URL 参数 | Surge RULE-SET（行内不带策略） |
| `/qx?token=<密钥>`（别名 `/quanx`） | GET | URL 参数 | Quantumult X filter_remote（行内带策略） |
| `/api/types` | GET | 否 | 规则类型及各客户端支持情况 |
| `/api/rules` | GET | 否 | 规则列表，支持 `?type=` `?q=` 过滤 |
| `/api/rules` | POST | 否 | 新增规则 |
| `/api/rules/:id` | PUT | 否 | 修改规则（部分字段） |
| `/api/rules/:id` | DELETE | 否 | 删除规则 |

> 注意：API 接口无鉴权，任何知道 Worker 地址的人都可读取和修改规则，仅建议个人自用且不公开地址。

## 规则类型支持矩阵

依据官方文档核实（Loon 手册 nsloon.app / Surge 手册 manual.nssurge.com / Quantumult X 官方 sample.conf）：

| 类型 | Loon | Surge | Quantumult X |
|---|---|---|---|
| DOMAIN | ✓ | ✓ | `host` |
| DOMAIN-SUFFIX | ✓ | ✓ | `host-suffix` |
| DOMAIN-KEYWORD | ✓ | ✓ | `host-keyword` |
| DOMAIN-WILDCARD | ✗ | ✗ | `host-wildcard` |
| IP-CIDR | ✓ | ✓ | `ip-cidr` |
| IP-CIDR6 | ✓ | ✓ | `ip6-cidr` |
| GEOIP | ✓ | ✓ | `geoip` |
| IP-ASN | ✓ | ✓ | `ip-asn` |
| URL-REGEX | ✓ | ✓ | ✗ |
| USER-AGENT | ✓ | ✓ | `user-agent` |
| DEST-PORT / SRC-PORT | ✓ | ✓ | ✗ |
| SRC-IP | ✗ | ✓ | ✗ |
| PROTOCOL | ✓ | ✓ | ✗ |

- `no-resolve` 参数：仅 IP 类规则（IP-CIDR / IP-CIDR6 / GEOIP / IP-ASN），QX 不支持、输出时忽略。
- 目标客户端不支持的类型在该客户端输出中自动跳过，头部注释会标明跳过数量。

## 部署

```sh
npm install

# 1. 创建 KV namespace，把返回的 id 填入 wrangler.jsonc
npx wrangler kv namespace create RULES_KV

# 2. 设置访问密钥（管理页与订阅共用）
npx wrangler secret put TOKEN

# 3. 部署
npm run deploy
```

## API 示例

```sh
BASE=https://ruleset.<your-subdomain>.workers.dev

# 新增
curl -X POST $BASE/api/rules \
  -H "Content-Type: application/json" \
  -d '{"type":"DOMAIN-SUFFIX","value":"example.com","policy":"proxy","remark":"示例"}'

# 修改（部分字段）
curl -X PUT $BASE/api/rules/<id> \
  -H "Content-Type: application/json" \
  -d '{"enabled":false}'

# 删除
curl -X DELETE $BASE/api/rules/<id>
```

## 客户端引用

订阅地址均需携带 `?token=<TOKEN>`：

- **Loon**：配置 → 远程规则 → 添加，URL 填 `$BASE/loon?token=<密钥>`，选择策略
- **Surge**：`RULE-SET,$BASE/surge?token=<密钥>,PROXY`
- **Quantumult X**：`[filter_remote]` 中 `$BASE/qx?token=<密钥>, tag=ruleset, force-policy=你的策略, enabled=true`
