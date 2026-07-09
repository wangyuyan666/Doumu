# converter — Loon / Surge / Quantumult X 配置互转

Cloudflare Worker：Loon 插件（.plugin）、Surge 模块（.sgmodule）、Quantumult X 重写（.snippet）三端互转，附带引用脚本的 JS 兼容性检查与自动兼容层注入。

语法依据官方手册实现：

- Loon: [插件](https://nsloon.app/docs/Plugin/)、[Rewrite](https://nsloon.app/docs/Rewrite/)、[Script](https://nsloon.app/docs/Script/)、[Script API](https://nsloon.app/docs/Script/script_api/)
- Surge: [Module](https://manual.nssurge.com/others/module.html)、[URL Rewrite](https://manual.nssurge.com/http-processing/url-rewrite.html)、[Header Rewrite](https://manual.nssurge.com/http-processing/header-rewrite.html)、[Body Rewrite](https://manual.nssurge.com/http-processing/body-rewrite.html)、[Map Local](https://manual.nssurge.com/http-processing/mock.html)、[Scripting](https://manual.nssurge.com/scripting/common.html)
- Quantumult X: [官方 sample.conf 与示例脚本](https://github.com/crossutility/Quantumult-X)

## 部署

```bash
cd tools/workers/converter
npm install
npx wrangler secret put TOKEN     # 设置访问密钥
npm run deploy
```

本地开发：`npm run dev`（密钥在 `.dev.vars`，默认 `dev-token`）。

## 端点

所有端点均需 `?token=<TOKEN>` 鉴权，失败返回 401。

### GET `/`

Web 管理页：三种输入方式（远程 URL / 文件上传拖拽 / 粘贴文本）、来源与目标格式选择、JS 兼容性检查开关、结果一键复制/下载。自适应深浅色。`/help` 返回纯文本用法。

### GET/POST `/convert`

| 参数 | 说明 |
|------|------|
| `target` | 必填，`loon` \| `surge` \| `qx` |
| `src` | 远程配置 URL（GET 输入方式） |
| `from` | 来源格式，缺省自动识别 |
| `check` | `0` 关闭 JS 兼容性检查（默认开启） |
| `jsconvert` | `1` 对不兼容且可补齐的脚本注入兼容层（改写 script-path 经 `/script` 代理） |
| `report` | `1` 返回 JSON（含告警与兼容性明细），缺省返回纯文本配置 |

三种输入方式：

```bash
# 1. 远程文件
curl "https://<worker>/convert?token=T&target=surge&src=https://example.com/x.plugin"

# 2. 本地文件上传（multipart）
curl -F file=@x.plugin "https://<worker>/convert?token=T&target=qx"

# 3. 内容直接输入（原始 body 或表单 content 字段）
curl -X POST --data-binary @x.sgmodule "https://<worker>/convert?token=T&target=loon"
```

### GET `/script?token=T&target=<fmt>&src=<js-url>`

拉取远程脚本并在头部注入兼容层后返回。`jsconvert=1` 时输出配置中的 script-path 自动指向此端点。

### POST `/script?token=T&target=<fmt>`

body 为 JS 内容（或 multipart `file` 字段），返回注入兼容层后的脚本——本地脚本单独转换用这个。

### 本地脚本（script-path 非 http）

配置引用本地 JS 时 Worker 拉不到文件，处理方式：

- `/convert` multipart 请求可附带多个 `script` 字段（文件名需与 script-path 的文件名一致）→ 一并做兼容性检查；`jsconvert=1` 时转换后的脚本经 `report=1` 响应的 `convertedScripts` 返回，下载后替换本地原文件（输出配置中路径保持不变）
- 管理页「上传文件 / 粘贴内容」方式下有「附带 JS 脚本（可多选）」区域，不兼容脚本直接给下载按钮
- 未附带时兼容性标 unknown 并提示

兼容层映射（带 `typeof` 守卫，可重复注入）：

- 目标 QX：`$httpClient` / `$persistentStore` / `$notification` → 基于 `$task.fetch` / `$prefs` / `$notify` 实现
- 目标 Surge/Loon：`$task.fetch` / `$prefs` / `$notify` → 基于 `$httpClient` / `$persistentStore` / `$notification.post` 实现

## JS 兼容性检查

静态扫描脚本引用的 API，按支持矩阵判定：

| API | Loon | Surge | QX |
|-----|------|-------|-----|
| `$httpClient` `$persistentStore` `$notification` `$utils` `$argument` | ✓ | ✓ | ✗（可 shim） |
| `$task.fetch` `$prefs` `$notify()` | ✗（可 shim） | ✗（可 shim） | ✓ |
| `$httpAPI` | ✗ | ✓ | ✗ |
| `$config.*` `$loon` | ✓ | ✗ | ✗ |
| `require()` `process.env` | ✗ | ✗ | ✗ |

检测到 `new Env(`、`typeof $task` 等多端适配层特征时判定为 universal，跳过转换。检查结果以 `#` 注释块置于输出头部；`report=1` 时以 JSON 字段返回。

## 已知降级与限制（输出头部会告警）

- Surge 无 307 重定向 → 降级 302
- QX 无透明重写（header 型）→ 降级 307 重定向
- QX 无内联 mock → 近似为 `reject-200/dict/array/img`，无法近似则跳过
- QX 不支持 jq body 改写、参数占位符（代入默认值）、重写脚本 argument/timeout
- Loon `*-body-json-add/replace/del`、QX `url-and-header` 等专属指令无跨端等价物 → 跳过并告警
- QX `[task_local]` 无法被 `rewrite_remote` 远程引用，需手动粘贴
- 本地路径脚本（非 http）无法做远程兼容性检查
