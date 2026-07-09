// 内嵌单页管理界面：无外部依赖，token 取自页面 URL 参数
export const ADMIN_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>规则集管理</title>
<style>
  :root { color-scheme: light dark; --border:#8884; --accent:#3b82f6; --danger:#ef4444; }
  * { box-sizing: border-box; }
  body { font: 14px/1.6 system-ui, sans-serif; max-width: 1080px; margin: 0 auto; padding: 16px; }
  h1 { font-size: 20px; }
  fieldset { border: 1px solid var(--border); border-radius: 8px; margin-bottom: 16px; }
  legend { padding: 0 6px; font-weight: 600; }
  input, select, button { font: inherit; padding: 5px 8px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: inherit; }
  button { cursor: pointer; }
  button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  button.danger { color: var(--danger); border-color: var(--danger); }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); }
  tr.disabled td { opacity: .45; }
  .badge { display: inline-block; font-size: 11px; padding: 0 5px; border: 1px solid var(--border); border-radius: 4px; margin-right: 2px; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px; }
  .sub { font-size: 12px; opacity: .7; }
  code { background: #8882; padding: 1px 5px; border-radius: 4px; }
  .sub-row { display: flex; align-items: center; gap: 8px; padding: 5px 10px; }
  .policy-group { padding: 4px 0 8px; }
  .policy-group + .policy-group { border-top: 1px solid var(--border); }
  .policy-name { font-weight: 600; padding: 6px 10px 2px; }
  .policy-name .badge { font-weight: 400; }
  tr.group td { font-weight: 600; background: #8881; }
  .client { flex: 0 0 52px; font-weight: 600; font-size: 13px; }
  .url { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
  .sub-row .sub { flex: 0 0 auto; }
  .sub-row button { flex: 0 0 auto; font-size: 12px; padding: 3px 10px; }
  #msg { min-height: 1.4em; }
  #msg.err { color: var(--danger); }
  #msg.ok { color: #16a34a; }
</style>
</head>
<body>
<h1>规则集管理</h1>

<fieldset>
  <legend>订阅地址（按策略分组）</legend>
  <div id="subs"><div class="sub" style="padding:10px">加载中…</div></div>
</fieldset>

<fieldset>
  <legend id="form-legend">新增规则</legend>
  <div class="row">
    <select id="f-type"></select>
    <input id="f-value" placeholder="值，如 example.com" size="28">
    <input id="f-policy" placeholder="策略，如 proxy / direct" size="14" value="proxy" list="policy-list">
    <datalist id="policy-list"></datalist>
    <label><input id="f-noresolve" type="checkbox"> no-resolve</label>
    <input id="f-remark" placeholder="备注（可选）" size="18">
    <button class="primary" onclick="submitRule()" id="f-submit">添加</button>
    <button onclick="resetForm()" id="f-cancel" hidden>取消编辑</button>
  </div>
  <div class="row sub" id="f-support"></div>
</fieldset>

<div class="row" style="padding:0 0 8px">
  <select id="filter-policy"><option value="">全部策略</option></select>
  <select id="filter-type"><option value="">全部类型</option></select>
  <input id="filter-q" placeholder="搜索值/备注" oninput="render()">
  <span id="msg"></span>
</div>

<table>
  <thead><tr><th>类型</th><th>值</th><th>支持</th><th>备注</th><th>操作</th></tr></thead>
  <tbody id="tbody"></tbody>
</table>

<script>
let TYPES = [], RULES = [], editingId = null;
const $ = (id) => document.getElementById(id);
const base = location.origin;

// token 直接取自当前页面 URL（进入管理页时已通过 ?token= 鉴权）
const TOKEN = new URLSearchParams(location.search).get("token") || "";
const CLIENTS = [
  { path: "loon", label: "Loon", sub: "远程规则" },
  { path: "surge", label: "Surge", sub: "RULE-SET" },
  { path: "qx", label: "QX", sub: "filter_remote" },
];
const subUrl = (c, policy) =>
  base + "/" + c + "?token=" + encodeURIComponent(TOKEN) + "&policy=" + encodeURIComponent(policy);

function policiesOf(rules) {
  return [...new Set(rules.map(r => r.policy))].sort();
}

function renderSubs() {
  const policies = policiesOf(RULES);
  if (!policies.length) {
    $("subs").innerHTML = "<div class='sub' style='padding:10px'>暂无规则，添加规则后按策略生成订阅地址</div>";
    return;
  }
  $("subs").innerHTML = policies.map(p => {
    const count = RULES.filter(r => r.policy === p).length;
    return "<div class='policy-group'>"
      + "<div class='policy-name'>" + esc(p) + " <span class='badge'>" + count + " 条</span></div>"
      + CLIENTS.map(c => {
          const u = subUrl(c.path, p);
          return "<div class='sub-row'>"
            + "<span class='client'>" + c.label + "</span>"
            + "<code class='url' title='" + esc(u) + "'>" + esc(u) + "</code>"
            + "<button data-client='" + c.path + "' data-policy='" + esc(p) + "'>复制</button>"
            + "<span class='sub'>" + c.sub + "</span>"
            + "</div>";
        }).join("")
      + "</div>";
  }).join("");
}

// 复制按钮事件委托，避免 onclick 内嵌策略名引发的引号转义问题
$("subs").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-client]");
  if (!btn) return;
  try {
    await navigator.clipboard.writeText(subUrl(btn.dataset.client, btn.dataset.policy));
    msg("已复制 " + btn.dataset.client.toUpperCase() + " / " + btn.dataset.policy + " 订阅地址", false);
  } catch {
    msg("复制失败，请手动选择", true);
  }
});
function msg(textContent, isErr) {
  const el = $("msg");
  el.textContent = textContent;
  el.className = isErr ? "err" : "ok";
  if (textContent) setTimeout(() => { el.textContent = ""; }, 4000);
}
function authHeaders() {
  return { "content-type": "application/json" };
}

async function init() {
  TYPES = await fetch("/api/types").then(r => r.json());
  for (const sel of [$("f-type"), $("filter-type")]) {
    for (const t of TYPES) {
      const opt = document.createElement("option");
      opt.value = t.name; opt.textContent = t.name;
      sel.appendChild(opt);
    }
  }
  $("f-type").onchange = updateSupport;
  $("filter-type").onchange = render;
  $("filter-policy").onchange = render;
  updateSupport();
  await reload();
}

function supportBadges(t) {
  return (t.loon ? "<span class='badge'>Loon</span>" : "")
    + (t.surge ? "<span class='badge'>Surge</span>" : "")
    + (t.qx ? "<span class='badge'>QX</span>" : "");
}
function updateSupport() {
  const t = TYPES.find(x => x.name === $("f-type").value);
  if (!t) return;
  $("f-support").innerHTML = "客户端支持：" + supportBadges(t)
    + (t.allowNoResolve ? "" : "（此类型不支持 no-resolve）");
  $("f-noresolve").disabled = !t.allowNoResolve;
  if (!t.allowNoResolve) $("f-noresolve").checked = false;
}

async function reload() {
  RULES = await fetch("/api/rules").then(r => r.json());
  refreshPolicyOptions();
  renderSubs();
  render();
}

function refreshPolicyOptions() {
  const policies = policiesOf(RULES);
  const sel = $("filter-policy");
  const kept = sel.value;
  sel.length = 1; // 保留“全部策略”
  $("policy-list").innerHTML = "";
  for (const p of policies) {
    const opt = document.createElement("option");
    opt.value = p; opt.textContent = p;
    sel.appendChild(opt);
    $("policy-list").appendChild(opt.cloneNode(true));
  }
  if (policies.includes(kept)) sel.value = kept;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function ruleRow(r) {
  const t = TYPES.find(x => x.name === r.type) || {};
  return "<tr class='" + (r.enabled ? "" : "disabled") + "'>"
    + "<td>" + esc(r.type) + "</td>"
    + "<td>" + esc(r.value) + (r.noResolve ? " <span class='badge'>no-resolve</span>" : "") + "</td>"
    + "<td>" + supportBadges(t) + "</td>"
    + "<td>" + esc(r.remark || "") + "</td>"
    + "<td>"
    + "<button onclick=\\"startEdit('" + r.id + "')\\">编辑</button> "
    + "<button onclick=\\"toggleRule('" + r.id + "')\\">" + (r.enabled ? "停用" : "启用") + "</button> "
    + "<button class='danger' onclick=\\"removeRule('" + r.id + "')\\">删除</button>"
    + "</td></tr>";
}

function render() {
  const fp = $("filter-policy").value, ft = $("filter-type").value, q = $("filter-q").value.toLowerCase();
  const rows = RULES.filter(r =>
    (!fp || r.policy === fp) &&
    (!ft || r.type === ft) &&
    (!q || r.value.toLowerCase().includes(q) || (r.remark || "").toLowerCase().includes(q)));
  // 按策略分组渲染，组头行显示策略名与条数
  const html = policiesOf(rows).map(p => {
    const group = rows.filter(r => r.policy === p);
    return "<tr class='group'><td colspan='5'>" + esc(p) + "（" + group.length + " 条）</td></tr>"
      + group.map(ruleRow).join("");
  }).join("");
  $("tbody").innerHTML = html || "<tr><td colspan='5' class='sub'>暂无规则</td></tr>";
}

function startEdit(id) {
  const r = RULES.find(x => x.id === id);
  if (!r) return;
  editingId = id;
  $("f-type").value = r.type;
  $("f-value").value = r.value;
  $("f-policy").value = r.policy;
  $("f-noresolve").checked = Boolean(r.noResolve);
  $("f-remark").value = r.remark || "";
  $("form-legend").textContent = "编辑规则";
  $("f-submit").textContent = "保存";
  $("f-cancel").hidden = false;
  updateSupport();
}
function resetForm() {
  editingId = null;
  $("f-value").value = ""; $("f-remark").value = ""; $("f-noresolve").checked = false;
  $("form-legend").textContent = "新增规则";
  $("f-submit").textContent = "添加";
  $("f-cancel").hidden = true;
}

async function submitRule() {
  const body = {
    type: $("f-type").value,
    value: $("f-value").value.trim(),
    policy: $("f-policy").value.trim(),
    noResolve: $("f-noresolve").checked,
    remark: $("f-remark").value.trim(),
  };
  const res = editingId
    ? await fetch("/api/rules/" + editingId, { method: "PUT", headers: authHeaders(), body: JSON.stringify(body) })
    : await fetch("/api/rules", { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) return msg(data.error || ("HTTP " + res.status), true);
  msg(editingId ? "已保存" : "已添加", false);
  resetForm();
  await reload();
}

async function toggleRule(id) {
  const r = RULES.find(x => x.id === id);
  const res = await fetch("/api/rules/" + id, {
    method: "PUT", headers: authHeaders(), body: JSON.stringify({ enabled: !r.enabled }),
  });
  const data = await res.json();
  if (!res.ok) return msg(data.error || ("HTTP " + res.status), true);
  await reload();
}

async function removeRule(id) {
  const r = RULES.find(x => x.id === id);
  if (!confirm("删除规则 " + r.type + "," + r.value + " ？")) return;
  const res = await fetch("/api/rules/" + id, { method: "DELETE", headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) return msg(data.error || ("HTTP " + res.status), true);
  msg("已删除", false);
  await reload();
}

init();
</script>
</body>
</html>`;
