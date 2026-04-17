/**
 * Proxy Rules Manager — Cloudflare Worker
 *
 * KV Namespace binding : RULES_KV
 * Secret variable      : ADMIN_TOKEN
 *
 * 数据结构（KV 存储）:
 *   { policies: [{ id, name, color }], rules: [{ id, raw, policyId, enabled }] }
 *
 * 端点:
 *   GET  /                        → 管理页面 (?token=xxx)
 *   GET  /rules/:name.list        → 按 policy 名称输出规则（纯条件，无 policy 字段）
 *   GET  /api/data                → 获取全量数据
 *   POST /api/data                → 保存全量数据 (需要 token)
 *
 * Surge / Loon 示例:
 *   RULE-SET,https://xxx.workers.dev/rules/PROXY.list,PROXY
 *   RULE-SET,https://xxx.workers.dev/rules/%F0%9F%9A%80%E8%8A%82%E7%82%B9%E9%80%89%E6%8B%A9.list,🚀节点选择
 */

const DATA_KEY = "proxy_data_v2";

const DEFAULT_DATA = {
  policies: [
    { id: "p-proxy",  name: "PROXY",  color: "#5b8df8" },
    { id: "p-direct", name: "DIRECT", color: "#4ade80" },
    { id: "p-reject", name: "REJECT", color: "#f87171" },
  ],
  rules: [],
};

function isAuthed(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || request.headers.get("X-Admin-Token");
  return token === env.ADMIN_TOKEN;
}
function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
async function getData(env) {
  const raw = await env.RULES_KV.get(DATA_KEY);
  return raw ? JSON.parse(raw) : DEFAULT_DATA;
}

async function serveList(env, policyName) {
  const { policies, rules } = await getData(env);
  const policy = policies.find(p => p.name === policyName);
  if (!policy) {
    return new Response(`# Policy "${policyName}" not found\n`, {
      status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
  const policyPat = /,([^,\s]+)\s*$/;
  const matched = rules.filter(r => r.enabled && r.policyId === policy.id);
  const lines = [
    `# Policy: ${policyName}`,
    `# Updated: ${new Date().toISOString()}`,
    `# Total: ${matched.length} rules`,
    ``,
    ...matched.map(r => r.raw.trim().replace(policyPat, "")),
  ];
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
  });
}

async function apiGet(env) { return jsonRes(await getData(env)); }
async function apiPost(request, env) {
  if (!isAuthed(request, env)) return jsonRes({ error: "Unauthorized" }, 401);
  const body = await request.json();
  const serialized = JSON.stringify(body);
  await env.RULES_KV.put(DATA_KEY, serialized);
  return jsonRes({ ok: true });
}

/* ════════════════════════════════════════
   Admin Page HTML
════════════════════════════════════════ */
function adminPage(token, base) {
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<title>Rules Manager</title>
<style>
:root{
  --bg:#0e0f11;--surface:#16181c;--surface2:#1c1e24;
  --border:#2a2d35;--border2:#373b46;
  --text:#e8eaf0;--muted:#6b7280;
  --accent:#5b8df8;--accent-dim:#1e2a4a;
  --mono:'SF Mono','Fira Code',monospace;
  --r:10px;
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,'PingFang SC',sans-serif;background:var(--bg);color:var(--text);min-height:100dvh;padding-bottom:90px}

.hdr{position:sticky;top:0;z-index:20;background:var(--surface);border-bottom:1px solid var(--border);padding:13px 16px;display:flex;align-items:center;gap:10px}
.hdr h1{font-size:17px;font-weight:600;flex:1}
.mgmt-btn{display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid var(--border);background:var(--surface2);color:var(--text);white-space:nowrap;transition:border-color .15s}
.mgmt-btn:active{background:var(--border)}

.tabs{display:flex;background:var(--surface);border-bottom:1px solid var(--border);padding:0 16px;overflow-x:auto;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tab{padding:10px 14px;font-size:14px;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap;user-select:none;transition:color .15s,border-color .15s}
.tab.active{color:var(--accent);border-color:var(--accent)}

.add-bar{padding:12px 16px;display:flex;flex-direction:column;gap:8px}
.add-bar-row{display:flex;gap:8px}
.add-bar-row input{flex:1;min-width:0;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);color:var(--text);font-family:var(--mono);font-size:13px;padding:10px 12px;outline:none;transition:border-color .15s}
.add-bar-row input:focus{border-color:var(--accent)}
.add-bar-row input::placeholder{color:var(--muted)}
.add-bar-selects{display:flex;gap:8px}
.add-bar-selects .sel{flex:1;font-family:var(--mono);font-size:12px}

.search-wrap{padding:0 16px 10px}
.search-wrap input{width:100%;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);color:var(--text);font-size:14px;padding:9px 12px;outline:none}
.search-wrap input:focus{border-color:var(--accent)}
.search-wrap input::placeholder{color:var(--muted)}

.rlist{padding:0 16px;display:flex;flex-direction:column;gap:7px}
.ritem{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:11px 12px;display:flex;align-items:center;gap:9px}
.ritem.off{opacity:.35}
.tog{width:20px;height:20px;min-width:20px;border-radius:50%;border:1.5px solid var(--border2);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s}
.tog.on{background:var(--accent);border-color:var(--accent)}
.tog.on::after{content:'';width:6px;height:6px;border-radius:50%;background:#fff}
.rraw{flex:1;min-width:0;font-family:var(--mono);font-size:13px;word-break:break-all;line-height:1.4}
.ptag{font-size:10px;font-weight:700;padding:2px 7px;border-radius:5px;white-space:nowrap;border:1px solid currentColor;opacity:.85;flex-shrink:0}
.xbtn{background:transparent;border:none;color:var(--muted);font-size:15px;cursor:pointer;padding:3px 5px;border-radius:6px;line-height:1}
.xbtn:active{color:#f87171;background:#2a1212}
.empty{text-align:center;padding:48px 0;color:var(--muted);font-size:14px}

.btn{background:var(--accent);color:#fff;border:none;border-radius:var(--r);font-size:14px;font-weight:600;padding:10px 16px;cursor:pointer;white-space:nowrap}
.btn:active{opacity:.7}
.btn.ghost{background:var(--accent-dim);color:var(--accent)}
.btn.danger{background:#2a1010;color:#f87171}
.btn.sm{padding:7px 12px;font-size:13px}

.bulk-area{padding:12px 16px}
.bulk-area textarea{width:100%;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);color:var(--text);font-family:var(--mono);font-size:13px;padding:12px;resize:vertical;min-height:220px;outline:none;line-height:1.7}
.bulk-area textarea:focus{border-color:var(--accent)}
.bulk-top{display:flex;gap:8px;margin-bottom:8px;align-items:center;flex-wrap:wrap}
.bulk-top label{font-size:13px;color:var(--muted)}
.sel{background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;padding:7px 10px;outline:none;cursor:pointer}
.bulk-actions{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}

.sub-wrap{padding:16px;display:flex;flex-direction:column;gap:10px}
.sub-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:14px}
.sub-head{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.sub-head .dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
.sub-head strong{font-size:13px;font-weight:600;flex:1}
.sub-head .cnt{font-size:12px;color:var(--muted)}
.url-row{display:flex;gap:8px;align-items:flex-start}
.url-row code{font-family:var(--mono);font-size:12px;color:var(--text);flex:1;word-break:break-all;line-height:1.5}
.cpbtn{font-size:11px;font-weight:600;background:var(--accent);color:#fff;border:none;border-radius:6px;padding:5px 10px;cursor:pointer;white-space:nowrap;flex-shrink:0}
.cfg-block{background:#0a0a0d;border:1px solid var(--border);border-radius:var(--r);padding:12px;font-family:var(--mono);font-size:12px;line-height:2;color:var(--muted);word-break:break-all}

/* modals */
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:50;display:flex;align-items:flex-end;justify-content:center;opacity:0;pointer-events:none;transition:opacity .2s}
.overlay.show{opacity:1;pointer-events:all}
.modal{background:var(--surface);border-radius:20px 20px 0 0;width:100%;max-width:540px;padding:20px 16px 32px;max-height:82dvh;overflow-y:auto;transform:translateY(24px);transition:transform .2s}
.overlay.show .modal{transform:none}
.modal h2{font-size:16px;font-weight:600;margin-bottom:16px}
.mrow{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)}
.mrow:last-child{border:none}
.swatch{width:26px;height:26px;border-radius:7px;flex-shrink:0;cursor:pointer;border:2px solid rgba(255,255,255,.12)}
.mname-inp{flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;padding:7px 10px;outline:none}
.mname-inp:focus{border-color:var(--accent)}
.new-mrow{display:flex;gap:8px;margin-top:16px;align-items:center}
.new-mrow input[type=text]{flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r);color:var(--text);font-size:14px;padding:10px 12px;outline:none}
.new-mrow input[type=text]:focus{border-color:var(--accent)}
.color-pick{width:42px;height:42px;border-radius:8px;border:1px solid var(--border);cursor:pointer;background:transparent;padding:3px;flex-shrink:0}

.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a2d1a;color:#4ade80;border:1px solid #2a4a2a;border-radius:20px;padding:8px 20px;font-size:14px;opacity:0;pointer-events:none;transition:opacity .25s;white-space:nowrap;z-index:99}
.toast.show{opacity:1}
.fab{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--accent);color:#fff;border:none;border-radius:16px;padding:14px 28px;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 20px rgba(91,141,248,.35);display:flex;align-items:center;justify-content:center;z-index:30}
.fab:active{transform:translateX(-50%) scale(.96)}
.ddot{position:absolute;top:8px;right:8px;width:8px;height:8px;border-radius:50%;background:#fff;opacity:0;transition:opacity .2s}
.ddot.show{opacity:1}
.ddot{width:8px;height:8px;border-radius:50%;background:#fff;opacity:0;transition:opacity .2s}
.ddot.show{opacity:1}
</style>
</head>
<body>

<div class="hdr">
  <h1>⚡ Rules Manager</h1>
  <button class="mgmt-btn" onclick="openTypeModal()">类型</button>
  <button class="mgmt-btn" onclick="openPolicyModal()">策略</button>
</div>

<div class="tabs">
  <div class="tab active" data-tab="list">规则列表</div>
  <div class="tab" data-tab="bulk">批量编辑</div>
  <div class="tab" data-tab="sub">订阅地址</div>
</div>

<!-- LIST -->
<div id="tab-list">
  <div class="add-bar">
    <div class="add-bar-selects">
      <select id="new-type" class="sel"></select>
      <select id="new-policy-sel" class="sel"></select>
    </div>
    <div class="add-bar-row">
      <input id="new-rule" type="text" placeholder="example.com"/>
      <button class="btn" onclick="addRule()">+</button>
    </div>
  </div>
  <div class="search-wrap">
    <input id="search" type="search" placeholder="搜索规则…" oninput="renderList()"/>
  </div>
  <div class="rlist" id="rule-list"></div>
</div>

<!-- BULK -->
<div id="tab-bulk" style="display:none">
  <div class="bulk-area">
    <div class="bulk-top">
      <label>批量导入到：</label>
      <select id="bulk-policy" class="sel"></select>
    </div>
    <textarea id="bulk-text" placeholder="每行一条规则条件（不含 policy）&#10;DOMAIN-SUFFIX,google.com&#10;DOMAIN-KEYWORD,youtube"></textarea>
    <div class="bulk-actions">
      <button class="btn ghost sm" onclick="loadBulk()">↓ 加载该 policy 规则</button>
      <button class="btn sm" onclick="applyBulk()">✓ 应用</button>
    </div>
  </div>
</div>

<!-- SUB -->
<div id="tab-sub" style="display:none">
  <div class="sub-wrap" id="sub-wrap"></div>
</div>

<!-- Type Modal -->
<div class="overlay" id="overlay-type" onclick="maybeClose(event,'overlay-type')">
  <div class="modal">
    <h2>类型管理</h2>
    <div id="type-modal-list"></div>
    <div class="new-mrow">
      <input type="text" id="new-type-name" placeholder="新类型，如 PROCESS-NAME"/>
      <button class="btn sm" onclick="addType()">添加</button>
    </div>
  </div>
</div>

<!-- Policy Modal -->
<div class="overlay" id="overlay-policy" onclick="maybeClose(event,'overlay-policy')">
  <div class="modal">
    <h2>策略管理</h2>
    <div id="policy-modal-list"></div>
    <div class="new-mrow">
      <input type="color" class="color-pick" id="new-color" value="#a78bfa"/>
      <input type="text" id="new-pname" placeholder="新策略，如 🇭🇰 香港"/>
      <button class="btn sm" onclick="addPolicy()">添加</button>
    </div>
  </div>
</div>

<button class="fab" onclick="saveData()"><span class="ddot" id="ddot"></span>保存</button>
<div class="toast" id="toast"></div>

<script>
const TOKEN = "${token}";
const BASE  = "${base}";
const RULE_PAT = /,([^,\\s]+)\\s*$/;

const DEFAULT_TYPES = ['DOMAIN','DOMAIN-SUFFIX','DOMAIN-KEYWORD','IP-CIDR','IP-CIDR6'];

let data = { policies:[], rules:[], types:[] };
let dirty = false;

function setDirty(v){ dirty=v; document.getElementById('ddot').classList.toggle('show',v); }

async function loadData(){
  data = await (await fetch('/api/data')).json();
  if(!data.types) data.types = [...DEFAULT_TYPES];
  redrawAll();
}

function redrawAll(){
  renderList();
  renderSubTab();
  renderBulkSel();
  renderAddSelects();
  renderTypeModalList();
  renderPolicyModalList();
}

/* ── rule list ── */
function renderList(){
  const q = document.getElementById('search').value.toLowerCase();
  const el = document.getElementById('rule-list');
  const pm = Object.fromEntries(data.policies.map(p=>[p.id,p]));
  const rows = data.rules.filter(r=> !q || r.raw.toLowerCase().includes(q));
  if(!rows.length){ el.innerHTML='<div class="empty">暂无规则</div>'; return; }
  el.innerHTML = rows.map(r=>{
    const idx = data.rules.indexOf(r);
    const p = pm[r.policyId];
    const color = p?p.color:'var(--muted)';
    const pname = p?p.name:'?';
    return \`<div class="ritem \${r.enabled?'':'off'}">
      <div class="tog \${r.enabled?'on':''}" onclick="toggleRule(\${idx})"></div>
      <div class="rraw">\${r.raw}</div>
      <span class="ptag" style="color:\${color};border-color:\${color}">\${pname}</span>
      <button class="xbtn" onclick="deleteRule(\${idx})">✕</button>
    </div>\`;
  }).join('');
}

function addRule(){
  const val=document.getElementById('new-rule').value.trim(); if(!val) return;
  if(!data.policies.length){ toast('请先在「策略」里添加策略'); return; }
  const type=document.getElementById('new-type').value;
  const raw=type+','+val;
  const policyId=document.getElementById('new-policy-sel').value || data.policies[0].id;
  data.rules.unshift({id:'r'+Date.now(), raw, policyId, enabled:true});
  document.getElementById('new-rule').value=''; renderList(); setDirty(true);
}
function toggleRule(i){ data.rules[i].enabled=!data.rules[i].enabled; renderList(); setDirty(true); }
function deleteRule(i){ data.rules.splice(i,1); renderList(); setDirty(true); }

/* ── add-bar selects ── */
function renderAddSelects(){
  const ts=document.getElementById('new-type');
  const prev=ts.value;
  ts.innerHTML=(data.types||[]).map(t=>\`<option>\${t}</option>\`).join('');
  if(prev && (data.types||[]).includes(prev)) ts.value=prev;

  const ps=document.getElementById('new-policy-sel');
  const prevP=ps.value;
  ps.innerHTML=data.policies.map(p=>\`<option value="\${p.id}">\${p.name}</option>\`).join('');
  if(prevP && data.policies.find(p=>p.id===prevP)) ps.value=prevP;
}

/* ── bulk ── */
function renderBulkSel(){
  const s=document.getElementById('bulk-policy');
  s.innerHTML=data.policies.map(p=>\`<option value="\${p.id}">\${p.name}</option>\`).join('');
}
function loadBulk(){
  const pid=document.getElementById('bulk-policy').value;
  document.getElementById('bulk-text').value=data.rules.filter(r=>r.policyId===pid).map(r=>r.raw).join('\\n');
}
function applyBulk(){
  const pid=document.getElementById('bulk-policy').value;
  const lines=document.getElementById('bulk-text').value.split('\\n').map(l=>l.trim()).filter(l=>l);
  data.rules=[
    ...lines.map(raw=>({id:'r'+Date.now()+Math.random(), raw:raw.replace(RULE_PAT,''), policyId:pid, enabled:true})),
    ...data.rules.filter(r=>r.policyId!==pid)
  ];
  renderList(); setDirty(true);
  toast('已应用，记得保存');
}

/* ── sub tab ── */
function renderSubTab(){
  const wrap=document.getElementById('sub-wrap');
  if(!data.policies.length){ wrap.innerHTML='<div class="empty">暂无 Policy</div>'; return; }
  const cards = data.policies.map(p=>{
    const url=\`\${BASE}/rules/\${encodeURIComponent(p.name)}.list\`;
    const cnt=data.rules.filter(r=>r.enabled&&r.policyId===p.id).length;
    return \`<div class="sub-card">
      <div class="sub-head">
        <div class="dot" style="background:\${p.color}"></div>
        <strong>\${p.name}</strong>
        <span class="cnt">\${cnt} 条</span>
      </div>
      <div class="url-row">
        <code>\${url}</code>
        <button class="cpbtn" onclick="cp('\${url}')">复制</button>
      </div>
    </div>\`;
  }).join('');

  const cfgLines = data.policies.map(p=>{
    const url=\`\${BASE}/rules/\${encodeURIComponent(p.name)}.list\`;
    return \`<span style="color:\${p.color}">RULE-SET,\${url},\${p.name}</span>\`;
  }).join('<br>');

  wrap.innerHTML = cards +
    \`<div>
      <p style="font-size:13px;color:var(--text);font-weight:500;margin-bottom:8px">Surge / Loon 配置片段</p>
      <div class="cfg-block">\${cfgLines}</div>
      <p style="font-size:12px;color:var(--muted);margin-top:10px;line-height:1.6">
        将以上内容加入配置文件的 [Rule] 段。规则文件无需 Token 即可访问。
      </p>
    </div>\`;
}

/* ── type modal ── */
function openTypeModal(){ renderTypeModalList(); document.getElementById('overlay-type').classList.add('show'); }
function renderTypeModalList(){
  const el=document.getElementById('type-modal-list');
  const types=data.types||[];
  if(!types.length){ el.innerHTML='<div class="empty" style="padding:16px 0">暂无类型</div>'; return; }
  el.innerHTML=types.map((t,i)=>\`
    <div class="mrow">
      <span style="flex:1;font-family:var(--mono);font-size:14px">\${t}</span>
      <button class="btn danger sm" onclick="delType(\${i})">删除</button>
    </div>
  \`).join('');
}
function addType(){
  const v=document.getElementById('new-type-name').value.trim().toUpperCase();
  if(!v){ toast('请输入类型名'); return; }
  if(!data.types) data.types=[];
  if(data.types.includes(v)){ toast('已存在'); return; }
  data.types.push(v);
  document.getElementById('new-type-name').value='';
  renderTypeModalList(); renderAddSelects(); setDirty(true); toast('已添加 '+v);
}
function delType(i){
  data.types.splice(i,1);
  renderTypeModalList(); renderAddSelects(); setDirty(true);
}

/* ── policy modal ── */
function openPolicyModal(){ renderPolicyModalList(); document.getElementById('overlay-policy').classList.add('show'); }
function maybeClose(e,id){ if(e.target===document.getElementById(id)) document.getElementById(id).classList.remove('show'); }
function renderPolicyModalList(){
  const el=document.getElementById('policy-modal-list');
  if(!data.policies.length){ el.innerHTML='<div class="empty" style="padding:16px 0">暂无策略，从下方添加</div>'; return; }
  el.innerHTML=data.policies.map((p,i)=>\`
    <div class="mrow">
      <div class="swatch" style="background:\${p.color}" onclick="document.getElementById('cp\${i}').click()"></div>
      <input type="color" id="cp\${i}" style="display:none" value="\${p.color}" oninput="onColorChange(\${i},this.value)"/>
      <input class="mname-inp" type="text" value="\${p.name}" onchange="onNameChange(\${i},this.value)"/>
      <button class="btn danger sm" onclick="delPolicy('\${p.id}')">删除</button>
    </div>
  \`).join('');
}
function onColorChange(i,c){ data.policies[i].color=c; renderSubTab(); renderPolicyModalList(); setDirty(true); }
function onNameChange(i,v){ v=v.trim(); if(!v) return; data.policies[i].name=v; renderSubTab(); renderAddSelects(); setDirty(true); }
function delPolicy(id){
  const inUse=data.rules.some(r=>r.policyId===id);
  if(inUse&&!confirm('该策略下有规则，删除后一并移除，确认？')) return;
  data.policies=data.policies.filter(p=>p.id!==id);
  data.rules=data.rules.filter(r=>r.policyId!==id);
  redrawAll(); setDirty(true);
}
function addPolicy(){
  const name=document.getElementById('new-pname').value.trim();
  if(!name){ toast('请输入名称'); return; }
  if(data.policies.some(p=>p.name===name)){ toast('名称已存在'); return; }
  const color=document.getElementById('new-color').value;
  data.policies.push({id:'p'+Date.now(), name, color});
  document.getElementById('new-pname').value='';
  redrawAll(); setDirty(true); toast('已添加 '+name);
}

/* ── save ── */
async function saveData(){
  try{
    const r=await fetch('/api/data?token='+TOKEN,{
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)
    });
    const d=await r.json();
    if(d.ok){ toast('✓ 已保存'); setDirty(false); renderSubTab(); }
    else toast('保存失败：'+d.error);
  } catch(e){ toast('网络错误'); }
}

function cp(t){ navigator.clipboard.writeText(t).then(()=>toast('已复制')); }
function toast(msg){
  const el=document.getElementById('toast');
  el.textContent=msg; el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),2200);
}

document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  ['list','bulk','sub'].forEach(id=>
    document.getElementById('tab-'+id).style.display=id===t.dataset.tab?'':'none'
  );
  if(t.dataset.tab==='sub') renderSubTab();
  if(t.dataset.tab==='bulk') renderBulkSel();
}));

document.getElementById('new-rule').addEventListener('keydown',e=>{ if(e.key==='Enter') addRule(); });
document.getElementById('new-pname').addEventListener('keydown',e=>{ if(e.key==='Enter') addPolicy(); });

loadData();
</script>
</body>
</html>`;
}

/* ════════════════════════════════════════
   Router
════════════════════════════════════════ */
export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname;

    // OPTIONS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST",
        "Access-Control-Allow-Headers": "Content-Type,X-Admin-Token",
      }});
    }

    // /rules/:name.list
    const listMatch = path.match(/^\/rules\/(.+)\.list$/);
    if (listMatch) return serveList(env, decodeURIComponent(listMatch[1]));

    // API
    if (path === "/api/data") {
      if (request.method === "GET")  return apiGet(env);
      if (request.method === "POST") return apiPost(request, env);
    }

    // Admin page
    if (path === "/" || path === "") {
      if (!isAuthed(request, env)) {
        return new Response("请在 URL 末尾加上 ?token=你的密码", {
          status: 401,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      return new Response(adminPage(url.searchParams.get("token"), url.origin), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};
