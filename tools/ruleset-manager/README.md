# ruleset-manager

基于 Cloudflare Workers + KV 的代理规则管理工具，支持在手机浏览器上随时增删规则，Loon / Surge 通过订阅 URL 自动同步。

## 特性

- **无服务器部署** — 运行在 Cloudflare Workers，免费额度完全够用
- **手机友好** — 管理页面为移动端优化，随时随地增删规则
- **多策略支持** — 自定义任意策略（PROXY、DIRECT、🚀 节点选择等），规则按策略分文件输出
- **自定义类型** — 规则类型可自行增删，预设 DOMAIN / DOMAIN-SUFFIX / DOMAIN-KEYWORD / IP-CIDR / IP-CIDR6
- **双端同步** — Loon 和 Surge 订阅同一份规则源，保存即生效

## 部署

### 1. 创建 KV 命名空间

Cloudflare Dashboard → **Workers & Pages → KV → Create namespace**

名称填 `RULES_KV`。

### 2. 创建 Worker

**Workers & Pages → Create → Create Worker**

将 `worker.js` 的内容粘贴进编辑器，点击 Deploy。

### 3. 绑定 KV

Worker 详情页 → **Settings → Bindings → Add binding**

| 字段 | 值 |
|---|---|
| 类型 | KV Namespace |
| 变量名 | `RULES_KV` |
| 命名空间 | 选择刚才创建的 |

### 4. 设置管理密码

**Settings → Variables → Add variable**

| 字段 | 值 |
|---|---|
| 变量名 | `ADMIN_TOKEN` |
| 值 | 自定义密码（建议随机字符串） |
| 加密 | ✅ 勾选 Encrypt |

## 使用

### 管理页面

浏览器打开：

```
https://<your-worker>.workers.dev/?token=<你的密码>
```

- **类型** 按钮 — 管理规则类型（增删自定义类型）
- **策略** 按钮 — 管理策略（增删改名改色）
- **规则列表** — 添加 / 启用 / 禁用 / 删除规则
- **批量编辑** — 批量粘贴导入规则
- **订阅地址** — 查看各策略的订阅 URL 和配置片段

### 订阅地址格式

```
https://<your-worker>.workers.dev/rules/<策略名>.list
```

规则文件为纯文本，无需 Token 即可访问。

## 客户端配置

### Surge

在配置文件的 `[Rule]` 段添加（根据你创建的策略调整）：

```ini
RULE-SET,https://<your-worker>.workers.dev/rules/PROXY.list,PROXY
RULE-SET,https://<your-worker>.workers.dev/rules/DIRECT.list,DIRECT
RULE-SET,https://<your-worker>.workers.dev/rules/REJECT.list,REJECT
```

### Loon

配置 → 规则 → 远程规则 → 添加，依次填入各策略的订阅 URL。

> 订阅地址中如含 emoji 或中文，客户端会自动处理 URL encoding，无需手动转义。

## 数据结构

规则数据以 JSON 格式存储在 Cloudflare KV 中：

```json
{
  "policies": [
    { "id": "p-proxy", "name": "PROXY", "color": "#5b8df8" }
  ],
  "rules": [
    { "id": "r1234", "raw": "DOMAIN-SUFFIX,google.com", "policyId": "p-proxy", "enabled": true }
  ],
  "types": ["DOMAIN", "DOMAIN-SUFFIX", "DOMAIN-KEYWORD", "IP-CIDR", "IP-CIDR6"]
}
```

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/` | 管理页面（需要 `?token=`） |
| `GET` | `/rules/:name.list` | 输出指定策略的规则文件 |
| `GET` | `/api/data` | 获取全量数据（JSON） |
| `POST` | `/api/data?token=` | 保存全量数据 |

## License

MIT
