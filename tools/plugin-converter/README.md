# PlugBridge

Loon Plugin ↔ Surge Module 双向转换工具，附带 JS 兼容性检测，部署在 Cloudflare Workers。

---

## 功能

**格式转换**
- Loon `.plugin` → Surge `.sgmodule`
- Surge `.sgmodule` → Loon `.plugin`
- 支持远程 URL 输入 / 本地文件上传
- 页面内语法高亮预览 + 一键下载

**JS 兼容性检测**（独立页面 `/jscheck`）
- 支持远程 URL 输入 / 本地文件上传
- 自动修正可修复的兼容性问题并提供修正版下载
- 不可自动修复的问题标注行号并提示手动处理

---

## 路由

| 路由 | 说明 |
|---|---|
| `GET /` | 主页面（格式转换） |
| `GET /jscheck` | JS 兼容性检测页面 |
| `POST /convert` | 转换接口 |
| `POST /jscheck` | JS 检测接口 |

---

## 部署

### 方式一：Wrangler CLI（推荐）

```bash
# 安装 wrangler
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 部署
wrangler deploy
```

部署成功后输出 Worker URL，例如：

```
https://plugbridge.your-subdomain.workers.dev
```

### 方式二：Dashboard 手动粘贴

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Workers & Pages → Create Application → Create Worker
3. 点击 Edit Code，将 `worker.js` 全部内容粘贴进去
4. 点击 Deploy

---

## 转换覆盖范围

### `[Script]`

| Loon | Surge |
|---|---|
| `http-request ^pattern script-path=x.js, tag=Name` | `Name = type=http-request, pattern=^pattern, script-path=x.js` |
| `http-response ^pattern script-path=x.js, tag=Name` | `Name = type=http-response, pattern=^pattern, script-path=x.js` |
| `cron "0 8 * * *" script-path=x.js, tag=Name` | `Name = type=cron, cronexp="0 8 * * *", script-path=x.js` |
| `network-changed script-path=x.js, tag=Name` | `Name = type=event, event-name=network-changed, script-path=x.js` ⚠️ |
| `requires-body=true` | `requires-body=1` |
| `binary-body-mode=true` | `binary-body-mode=1` |

### `[Rewrite]` / `[URL Rewrite]`

| Loon | Surge |
|---|---|
| `^p header https://new` | `^p https://new header`（关键词移至末尾） |
| `^p 302 https://new` | `^p https://new 302`（顺序调整） |
| `^p reject` | `^p - reject`（补 `-` 占位） |
| `^p reject-img` | `^p - reject` ⚠️ 降级 |
| `^p reject-200 / reject-dict / reject-array` | `^p - reject` ⚠️ 降级 |
| `^p 307 https://new` | `^p https://new 302` ⚠️ 降级 |

### `[Header Rewrite]`

| Loon | Surge |
|---|---|
| `^p header-add Key Value` | `^p header-add Key: Value` |
| `^p header-del Key` | `^p header-del Key` |
| `^p header-replace Key Value` | `^p header-replace Key Value` |

### `[MITM]`

| Loon | Surge |
|---|---|
| `hostname = a.com, b.com` | `hostname = %APPEND% a.com, b.com` |

Surge → Loon 方向会自动去除 `%APPEND%` / `%INSERT%` 前缀。

### `#!arguments` 参数模板

| 项目 | Loon | Surge |
|---|---|---|
| 声明 | `#!arguments=Key:"默认值"` | `#!arguments=Key=默认值` |
| 引用 | `{{{Key}}}` | `%Key%` |

---

## JS 兼容性检测

访问 `/jscheck` 页面，支持检测以下问题：

**Loon → Surge（自动修正）**

| 问题 | 处理 |
|---|---|
| `status = "HTTP/1.1 200 OK"` 字符串格式 | 自动改为数字 `200` |
| `console.log(...)` | 自动替换为 `$log(...)` |

**Loon → Surge（仅告警，标注行号）**

| 问题 | 说明 |
|---|---|
| `$loon` 专有对象 | Surge 中为 undefined，需手动处理 |
| `$response.status` 与字符串比较 | Surge 中 status 为数字，需改为数字比较 |

**Surge → Loon（仅告警，标注行号）**

| 问题 | 说明 |
|---|---|
| `$surge` 专有对象 | Loon 中不可用，需手动处理 |

---

## 注意事项

- Worker 免费版每日请求限额 10 万次，个人使用完全够用
- 不使用任何存储，所有转换均为无状态实时计算
- 拉取远程文件依赖 Cloudflare Workers 出站网络，`raw.githubusercontent.com` 在部分地区可能较慢

---

## 参考文档

- [Loon 官方文档](https://nsloon.bid/document/)
- [Surge 官方文档](https://manual.nssurge.com/)
