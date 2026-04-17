// ============================================================
// PlugBridge — Loon Plugin ↔ Surge Module Converter
// Cloudflare Worker
// Based on official Loon docs: https://nsloon.bid/document/
// Based on official Surge docs: https://manual.nssurge.com/
// ============================================================

// ============================================================
// MAIN PAGE HTML
// ============================================================
const HTML_MAIN = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PlugBridge</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Syne:wght@400;700;800&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0a0a0f; --surface: #111118; --border: #1e1e2e;
    --border-active: #3d3d5c; --accent: #7c6af7; --accent2: #f76a8a;
    --text: #e8e8f0; --muted: #6b6b8a; --success: #6af7a8;
    --warn: #f7c86a; --code-bg: #0d0d16; --glow: rgba(124,106,247,0.15);
  }
  html, body { background: var(--bg); color: var(--text); font-family: 'Syne', sans-serif; overflow-x: hidden; }
  body::before {
    content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 0; opacity: 0.6;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
  }
  .container { position: relative; z-index: 1; max-width: 900px; margin: 0 auto; padding: 48px 24px 80px; }
  header { margin-bottom: 52px; animation: fadeDown 0.6s ease both; }
  .header-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .header-left {}
  .badge { display: inline-flex; align-items: center; gap: 6px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--accent); background: rgba(124,106,247,0.08); border: 1px solid rgba(124,106,247,0.2); border-radius: 100px; padding: 4px 12px; margin-bottom: 20px; letter-spacing: 0.05em; }
  .badge::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: pulse 2s infinite; }
  h1 { font-size: clamp(32px, 5vw, 52px); font-weight: 800; letter-spacing: -0.03em; line-height: 1.05; background: linear-gradient(135deg, var(--text) 30%, var(--muted) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 12px; }
  .subtitle { color: var(--muted); font-size: 15px; font-family: 'JetBrains Mono', monospace; }
  /* JS Check entry button */
  .jscheck-entry {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 10px 18px; border-radius: 10px; border: 1px solid var(--border);
    background: var(--surface); color: var(--muted);
    font-family: 'JetBrains Mono', monospace; font-size: 12px;
    text-decoration: none; transition: all 0.2s; white-space: nowrap;
    margin-top: 8px;
  }
  .jscheck-entry:hover { border-color: var(--accent); color: var(--accent); background: var(--glow); }
  .jscheck-entry .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--warn); flex-shrink: 0; }
  /* Direction */
  .direction-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 36px; animation: fadeUp 0.6s 0.1s ease both; }
  .dir-label { font-size: 12px; color: var(--muted); font-family: 'JetBrains Mono', monospace; letter-spacing: 0.08em; text-transform: uppercase; }
  .toggle-group { display: flex; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 3px; gap: 3px; }
  .toggle-btn { padding: 8px 18px; border-radius: 7px; border: none; background: transparent; color: var(--muted); font-family: 'JetBrains Mono', monospace; font-size: 12px; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
  .toggle-btn.active { background: var(--accent); color: white; box-shadow: 0 0 20px rgba(124,106,247,0.4); }
  /* Card */
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 28px; margin-bottom: 16px; transition: border-color 0.3s; animation: fadeUp 0.6s 0.2s ease both; }
  .card:hover { border-color: var(--border-active); }
  .card-title { font-size: 11px; font-family: 'JetBrains Mono', monospace; color: var(--muted); letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 20px; display: flex; align-items: center; gap: 8px; }
  .card-title::before { content: ''; width: 3px; height: 14px; background: var(--accent); border-radius: 2px; }
  /* Tabs */
  .input-tabs { display: flex; margin-bottom: 20px; border-bottom: 1px solid var(--border); }
  .input-tab { padding: 8px 20px; font-size: 13px; font-family: 'JetBrains Mono', monospace; color: var(--muted); background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; transition: all 0.2s; margin-bottom: -1px; }
  .input-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .input-pane { display: none; }
  .input-pane.active { display: block; }
  /* Inputs */
  .url-row { display: flex; gap: 10px; }
  input[type="text"] { flex: 1; background: var(--code-bg); border: 1px solid var(--border); border-radius: 10px; padding: 12px 16px; color: var(--text); font-family: 'JetBrains Mono', monospace; font-size: 13px; outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
  input[type="text"]:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--glow); }
  input[type="text"]::placeholder { color: var(--muted); }
  /* Dropzone */
  .dropzone { border: 2px dashed var(--border); border-radius: 12px; padding: 40px 24px; text-align: center; cursor: pointer; transition: all 0.3s; position: relative; }
  .dropzone:hover, .dropzone.drag-over { border-color: var(--accent); background: var(--glow); }
  .dropzone input[type="file"] { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
  .drop-icon { font-size: 32px; margin-bottom: 10px; display: block; }
  .drop-text { color: var(--muted); font-size: 13px; font-family: 'JetBrains Mono', monospace; }
  .drop-text span { color: var(--accent); }
  .file-name { margin-top: 10px; font-size: 12px; font-family: 'JetBrains Mono', monospace; color: var(--success); display: none; }
  /* Buttons */
  .btn { display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px; border-radius: 10px; border: none; font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s; }
  .btn-primary { background: var(--accent); color: white; box-shadow: 0 4px 20px rgba(124,106,247,0.3); }
  .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 28px rgba(124,106,247,0.45); }
  .btn-primary:active { transform: translateY(0); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
  .btn-ghost { background: var(--surface); color: var(--muted); border: 1px solid var(--border); }
  .btn-ghost:hover { border-color: var(--border-active); color: var(--text); }
  .btn-success { background: rgba(106,247,168,0.1); color: var(--success); border: 1px solid rgba(106,247,168,0.2); }
  .btn-success:hover { background: rgba(106,247,168,0.15); }
  .action-row { display: flex; justify-content: flex-end; margin-top: 20px; }
  /* Output */
  .output-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; margin-top: 16px; display: none; animation: fadeUp 0.4s ease both; }
  .output-card.visible { display: block; }
  .output-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; border-bottom: 1px solid var(--border); background: rgba(255,255,255,0.02); }
  .output-title { font-size: 11px; font-family: 'JetBrains Mono', monospace; color: var(--muted); letter-spacing: 0.1em; text-transform: uppercase; display: flex; align-items: center; gap: 8px; }
  .output-title::before { content: ''; width: 3px; height: 14px; background: var(--success); border-radius: 2px; }
  .output-actions { display: flex; gap: 8px; }
  .output-area { font-family: 'JetBrains Mono', monospace; font-size: 12px; line-height: 1.7; color: #b8b8d0; background: var(--code-bg); padding: 24px; overflow-x: auto; white-space: pre; max-height: 480px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
  /* Syntax */
  .line-section { color: #7c6af7; font-weight: 600; }
  .line-comment { color: #3d3d5c; font-style: italic; }
  .line-key { color: #f76a8a; }
  .line-value { color: #6af7c8; }
  .line-meta { color: #f7a86a; }
  /* Misc */
  .warn-box { display: none; background: rgba(247,168,106,0.08); border: 1px solid rgba(247,168,106,0.25); border-radius: 10px; padding: 14px 18px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--warn); margin-top: 12px; line-height: 1.7; }
  .warn-box.visible { display: block; }
  .error-msg { display: none; background: rgba(247,106,138,0.08); border: 1px solid rgba(247,106,138,0.2); border-radius: 10px; padding: 14px 18px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--accent2); margin-top: 12px; }
  .error-msg.visible { display: block; }
  .stats-bar { display: flex; flex-wrap: wrap; gap: 20px; padding: 12px 24px; border-bottom: 1px solid var(--border); background: rgba(255,255,255,0.01); }
  .stat { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--muted); }
  .stat strong { color: var(--success); font-weight: 600; }
  .spinner { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.2); border-top-color: white; border-radius: 50%; animation: spin 0.7s linear infinite; display: none; }
  .btn-primary.loading .spinner { display: block; }
  .btn-primary.loading .btn-label { display: none; }
  @keyframes fadeDown { from { opacity: 0; transform: translateY(-16px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  @media (max-width: 600px) { .container { padding: 32px 16px 60px; } .url-row { flex-direction: column; } .output-actions { flex-wrap: wrap; } .header-row { flex-direction: column; } }
</style>
</head>
<body>
<div class="container">
  <header>
    <div class="header-row">
      <div class="header-left">
        <div class="badge">PlugBridge · CF Workers</div>
        <h1>PlugBridge</h1>
        <p class="subtitle">// Loon .plugin  ↔  Surge .sgmodule</p>
      </div>
      <a href="/jscheck" class="jscheck-entry">
        <span class="dot"></span>
        JS 兼容性检测
      </a>
    </div>
  </header>

  <div class="direction-bar">
    <span class="dir-label">方向</span>
    <div class="toggle-group">
      <button class="toggle-btn active" data-dir="loon2surge">Loon → Surge</button>
      <button class="toggle-btn" data-dir="surge2loon">Surge → Loon</button>
    </div>
  </div>

  <div class="card">
    <div class="card-title">输入源</div>
    <div class="input-tabs">
      <button class="input-tab active" data-tab="url">远程 URL</button>
      <button class="input-tab" data-tab="file">本地文件</button>
    </div>
    <div class="input-pane active" id="pane-url">
      <div class="url-row">
        <input type="text" id="plugin-url" placeholder="https://raw.githubusercontent.com/.../xxx.plugin" />
        <button class="btn btn-primary" id="btn-convert-url"><div class="spinner"></div><span class="btn-label">转换</span></button>
      </div>
    </div>
    <div class="input-pane" id="pane-file">
      <div class="dropzone" id="dropzone">
        <input type="file" id="file-input" accept=".plugin,.sgmodule,.conf,.txt" />
        <span class="drop-icon">⬆</span>
        <div class="drop-text">拖放文件到此处，或 <span>点击选择</span></div>
        <div class="drop-text" style="margin-top:6px;font-size:11px;">支持 .plugin / .sgmodule</div>
        <div class="file-name" id="file-name"></div>
      </div>
      <div class="action-row">
        <button class="btn btn-primary" id="btn-convert-file" disabled><div class="spinner"></div><span class="btn-label">转换文件</span></button>
      </div>
    </div>
    <div class="error-msg" id="error-msg"></div>
  </div>

  <div class="warn-box" id="warn-box"></div>

  <div class="output-card" id="output-card">
    <div class="output-header">
      <div class="output-title">转换结果</div>
      <div class="output-actions">
        <button class="btn btn-ghost" id="btn-copy" style="padding:8px 16px;font-size:12px;">复制</button>
        <button class="btn btn-success" id="btn-download" style="padding:8px 16px;font-size:12px;">↓ 下载</button>
      </div>
    </div>
    <div class="stats-bar" id="stats-bar"></div>
    <div class="output-area" id="output-area"></div>
  </div>
</div>
<script>
let direction='loon2surge',fileContent=null,fileName=null,lastResult=''
document.querySelectorAll('.toggle-btn').forEach(btn=>{btn.addEventListener('click',()=>{document.querySelectorAll('.toggle-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');direction=btn.dataset.dir;hideOutput();hideError()})})
document.querySelectorAll('.input-tab').forEach(tab=>{tab.addEventListener('click',()=>{document.querySelectorAll('.input-tab').forEach(t=>t.classList.remove('active'));document.querySelectorAll('.input-pane').forEach(p=>p.classList.remove('active'));tab.classList.add('active');document.getElementById('pane-'+tab.dataset.tab).classList.add('active');hideOutput();hideError()})})
const dropzone=document.getElementById('dropzone'),fileInput=document.getElementById('file-input')
dropzone.addEventListener('dragover',e=>{e.preventDefault();dropzone.classList.add('drag-over')})
dropzone.addEventListener('dragleave',()=>dropzone.classList.remove('drag-over'))
dropzone.addEventListener('drop',e=>{e.preventDefault();dropzone.classList.remove('drag-over');handleFile(e.dataTransfer.files[0])})
fileInput.addEventListener('change',()=>handleFile(fileInput.files[0]))
function handleFile(file){if(!file)return;fileName=file.name;document.getElementById('file-name').textContent='✓ '+file.name;document.getElementById('file-name').style.display='block';const r=new FileReader();r.onload=e=>{fileContent=e.target.result;document.getElementById('btn-convert-file').disabled=false};r.readAsText(file,'utf-8')}
document.getElementById('btn-convert-url').addEventListener('click',async()=>{const url=document.getElementById('plugin-url').value.trim();if(!url)return showError('请输入有效的 URL');const btn=document.getElementById('btn-convert-url');setLoading(btn,true);hideError();try{const res=await fetch('/convert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,direction})});const data=await res.json();if(!res.ok)throw new Error(data.error||'转换失败');showResult(data.result,data.stats,data.warnings,guessOutputName(url))}catch(e){showError(e.message)}finally{setLoading(btn,false)}})
document.getElementById('btn-convert-file').addEventListener('click',async()=>{if(!fileContent)return;const btn=document.getElementById('btn-convert-file');setLoading(btn,true);hideError();try{const res=await fetch('/convert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:fileContent,direction})});const data=await res.json();if(!res.ok)throw new Error(data.error||'转换失败');showResult(data.result,data.stats,data.warnings,guessOutputName(fileName))}catch(e){showError(e.message)}finally{setLoading(btn,false)}})
function showResult(text,stats,warnings,outName){lastResult=text;document.getElementById('output-area').innerHTML=highlight(text);document.getElementById('stats-bar').innerHTML=Object.entries(stats).map(([k,v])=>'<span class="stat">'+k+': <strong>'+v+'</strong></span>').join('');document.getElementById('output-card').classList.add('visible');const wb=document.getElementById('warn-box');if(warnings&&warnings.length>0){wb.innerHTML='⚠ 转换注意：<br>'+warnings.map(w=>'· '+w).join('<br>');wb.classList.add('visible')}else{wb.classList.remove('visible')};document.getElementById('btn-download').onclick=()=>{const blob=new Blob([text],{type:'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=outName;a.click()}}
function guessOutputName(src){if(!src)return direction==='loon2surge'?'output.sgmodule':'output.plugin';const base=(src.split('/').pop()||'output').replace(/\\?.*$/,'');const stem=base.replace(/\\.(plugin|sgmodule|conf|txt)$/i,'');return direction==='loon2surge'?stem+'.sgmodule':stem+'.plugin'}
function hideOutput(){document.getElementById('output-card').classList.remove('visible');document.getElementById('warn-box').classList.remove('visible')}
document.getElementById('btn-copy').addEventListener('click',async()=>{await navigator.clipboard.writeText(lastResult);const btn=document.getElementById('btn-copy');btn.textContent='已复制 ✓';setTimeout(()=>btn.textContent='复制',1500)})
function showError(msg){const el=document.getElementById('error-msg');el.textContent='⚠ '+msg;el.classList.add('visible')}
function hideError(){document.getElementById('error-msg').classList.remove('visible')}
function setLoading(btn,on){btn.classList.toggle('loading',on);btn.disabled=on}
function highlight(text){return text.split('\\n').map(line=>{const esc=line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');if(/^\\s*#!/.test(line))return '<span class="line-meta">'+esc+'</span>';if(/^\\s*#/.test(line))return '<span class="line-comment">'+esc+'</span>';if(/^\\s*\\[/.test(line))return '<span class="line-section">'+esc+'</span>';if(/^\\s*\\w.*=/.test(line)){const idx=esc.indexOf('=');return '<span class="line-key">'+esc.slice(0,idx+1)+'</span><span class="line-value">'+esc.slice(idx+1)+'</span>'}return esc}).join('\\n')}
</script>
</body>
</html>`;

// ============================================================
// JS CHECK PAGE HTML
// ============================================================
const HTML_JSCHECK = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>JS 兼容性检测 · PlugBridge</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Syne:wght@400;700;800&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0a0a0f; --surface: #111118; --border: #1e1e2e;
    --border-active: #3d3d5c; --accent: #7c6af7; --accent2: #f76a8a;
    --text: #e8e8f0; --muted: #6b6b8a; --success: #6af7a8;
    --warn: #f7c86a; --code-bg: #0d0d16; --glow: rgba(124,106,247,0.15);
  }
  html, body { background: var(--bg); color: var(--text); font-family: 'Syne', sans-serif; overflow-x: hidden; }
  body::before {
    content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 0; opacity: 0.6;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
  }
  .container { position: relative; z-index: 1; max-width: 900px; margin: 0 auto; padding: 48px 24px 80px; }
  header { margin-bottom: 48px; animation: fadeDown 0.6s ease both; }
  .back-link { display: inline-flex; align-items: center; gap: 6px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--muted); text-decoration: none; margin-bottom: 24px; transition: color 0.2s; }
  .back-link:hover { color: var(--accent); }
  .badge { display: inline-flex; align-items: center; gap: 6px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--warn); background: rgba(247,200,106,0.08); border: 1px solid rgba(247,200,106,0.2); border-radius: 100px; padding: 4px 12px; margin-bottom: 20px; letter-spacing: 0.05em; }
  .badge::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--warn); }
  h1 { font-size: clamp(28px, 4vw, 44px); font-weight: 800; letter-spacing: -0.03em; line-height: 1.05; background: linear-gradient(135deg, var(--text) 30%, var(--muted) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 12px; }
  .subtitle { color: var(--muted); font-size: 14px; font-family: 'JetBrains Mono', monospace; }
  /* Direction toggle */
  .direction-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; animation: fadeUp 0.6s 0.1s ease both; }
  .dir-label { font-size: 12px; color: var(--muted); font-family: 'JetBrains Mono', monospace; letter-spacing: 0.08em; text-transform: uppercase; }
  .toggle-group { display: flex; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 3px; gap: 3px; }
  .toggle-btn { padding: 8px 18px; border-radius: 7px; border: none; background: transparent; color: var(--muted); font-family: 'JetBrains Mono', monospace; font-size: 12px; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
  .toggle-btn.active { background: var(--warn); color: #1a1200; box-shadow: 0 0 20px rgba(247,200,106,0.3); }
  /* Card */
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 28px; margin-bottom: 16px; transition: border-color 0.3s; animation: fadeUp 0.6s 0.2s ease both; }
  .card:hover { border-color: var(--border-active); }
  .card-title { font-size: 11px; font-family: 'JetBrains Mono', monospace; color: var(--muted); letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 20px; display: flex; align-items: center; gap: 8px; }
  .card-title::before { content: ''; width: 3px; height: 14px; background: var(--warn); border-radius: 2px; }
  /* Tabs */
  .input-tabs { display: flex; margin-bottom: 20px; border-bottom: 1px solid var(--border); }
  .input-tab { padding: 8px 20px; font-size: 13px; font-family: 'JetBrains Mono', monospace; color: var(--muted); background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; transition: all 0.2s; margin-bottom: -1px; }
  .input-tab.active { color: var(--warn); border-bottom-color: var(--warn); }
  .input-pane { display: none; }
  .input-pane.active { display: block; }
  /* Inputs */
  .url-row { display: flex; gap: 10px; }
  input[type="text"] { flex: 1; background: var(--code-bg); border: 1px solid var(--border); border-radius: 10px; padding: 12px 16px; color: var(--text); font-family: 'JetBrains Mono', monospace; font-size: 13px; outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
  input[type="text"]:focus { border-color: var(--warn); box-shadow: 0 0 0 3px rgba(247,200,106,0.12); }
  input[type="text"]::placeholder { color: var(--muted); }
  .dropzone { border: 2px dashed var(--border); border-radius: 12px; padding: 40px 24px; text-align: center; cursor: pointer; transition: all 0.3s; position: relative; }
  .dropzone:hover, .dropzone.drag-over { border-color: var(--warn); background: rgba(247,200,106,0.05); }
  .dropzone input[type="file"] { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
  .drop-icon { font-size: 32px; margin-bottom: 10px; display: block; }
  .drop-text { color: var(--muted); font-size: 13px; font-family: 'JetBrains Mono', monospace; }
  .drop-text span { color: var(--warn); }
  .file-name { margin-top: 10px; font-size: 12px; font-family: 'JetBrains Mono', monospace; color: var(--success); display: none; }
  /* Buttons */
  .btn { display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px; border-radius: 10px; border: none; font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s; }
  .btn-warn { background: var(--warn); color: #1a1200; box-shadow: 0 4px 20px rgba(247,200,106,0.25); }
  .btn-warn:hover { transform: translateY(-1px); box-shadow: 0 6px 28px rgba(247,200,106,0.4); }
  .btn-warn:active { transform: translateY(0); }
  .btn-warn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
  .btn-ghost { background: var(--surface); color: var(--muted); border: 1px solid var(--border); }
  .btn-ghost:hover { border-color: var(--border-active); color: var(--text); }
  .btn-dl { background: rgba(106,247,168,0.1); color: var(--success); border: 1px solid rgba(106,247,168,0.2); }
  .btn-dl:hover { background: rgba(106,247,168,0.15); }
  .btn-cross { background: rgba(124,106,247,0.1); color: var(--accent); border: 1px solid rgba(124,106,247,0.25); }
  .btn-cross:hover { background: rgba(124,106,247,0.18); }
  .btn-dl-cross { background: rgba(124,106,247,0.1); color: var(--accent); border: 1px solid rgba(124,106,247,0.25); }
  .btn-dl-cross:hover { background: rgba(124,106,247,0.18); }
  .action-row { display: flex; justify-content: flex-end; margin-top: 20px; }
  /* Results */
  .results-section { margin-top: 8px; }
  .result-block { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; margin-top: 16px; animation: fadeUp 0.4s ease both; }
  .result-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); background: rgba(255,255,255,0.02); gap: 12px; flex-wrap: wrap; }
  .result-file { font-family: 'JetBrains Mono', monospace; font-size: 13px; color: var(--text); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .result-url { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--muted); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .status-badge { font-family: 'JetBrains Mono', monospace; font-size: 11px; padding: 3px 10px; border-radius: 100px; white-space: nowrap; flex-shrink: 0; }
  .status-ok   { background: rgba(106,247,168,0.1); color: var(--success); border: 1px solid rgba(106,247,168,0.2); }
  .status-warn { background: rgba(247,200,106,0.1); color: var(--warn);    border: 1px solid rgba(247,200,106,0.2); }
  .status-err  { background: rgba(247,106,138,0.1); color: var(--accent2); border: 1px solid rgba(247,106,138,0.2); }
  .issues-list { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px; }
  .issue-row { display: flex; gap: 10px; font-family: 'JetBrains Mono', monospace; font-size: 12px; line-height: 1.6; }
  .issue-tag { flex-shrink: 0; font-size: 10px; padding: 2px 8px; border-radius: 4px; margin-top: 1px; }
  .tag-auto   { background: rgba(106,247,168,0.12); color: var(--success); }
  .tag-manual { background: rgba(247,200,106,0.12); color: var(--warn); }
  .tag-err    { background: rgba(247,106,138,0.12); color: var(--accent2); }
  .issue-text { color: var(--text); }
  .issue-line { color: var(--muted); margin-left: 4px; }
  .result-actions { padding: 12px 20px; display: flex; gap: 8px; justify-content: flex-end; }
  /* Fixed JS preview */
  .fixed-preview { font-family: 'JetBrains Mono', monospace; font-size: 12px; line-height: 1.7; color: #b8b8d0; background: var(--code-bg); padding: 20px; overflow-x: auto; white-space: pre; max-height: 360px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--border) transparent; border-top: 1px solid var(--border); display: none; }
  .fixed-preview.visible { display: block; }
  /* Error */
  .error-msg { display: none; background: rgba(247,106,138,0.08); border: 1px solid rgba(247,106,138,0.2); border-radius: 10px; padding: 14px 18px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--accent2); margin-top: 12px; }
  .error-msg.visible { display: block; }
  /* Spinner */
  .spinner { width: 14px; height: 14px; border: 2px solid rgba(26,18,0,0.3); border-top-color: #1a1200; border-radius: 50%; animation: spin 0.7s linear infinite; display: none; }
  .btn-warn.loading .spinner { display: block; }
  .btn-warn.loading .btn-label { display: none; }
  @keyframes fadeDown { from { opacity: 0; transform: translateY(-16px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes spin { to { transform: rotate(360deg); } }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  @media (max-width: 600px) { .container { padding: 32px 16px 60px; } .url-row { flex-direction: column; } }
</style>
</head>
<body>
<div class="container">
  <header>
    <a href="/" class="back-link">← 返回转换工具</a>
    <div class="badge">JS 兼容性检测</div>
    <h1>JS Check</h1>
    <p class="subtitle">// 检测脚本在 Loon / Surge 之间的兼容性问题</p>
  </header>

  <div class="direction-bar">
    <span class="dir-label">检测目标</span>
    <div class="toggle-group">
      <button class="toggle-btn active" data-dir="loon2surge">检测是否适用于 Surge</button>
      <button class="toggle-btn" data-dir="surge2loon">检测是否适用于 Loon</button>
    </div>
  </div>

  <div class="card">
    <div class="card-title">JS 来源</div>
    <div class="input-tabs">
      <button class="input-tab active" data-tab="url">远程 URL</button>
      <button class="input-tab" data-tab="file">本地文件</button>
    </div>
    <div class="input-pane active" id="pane-url">
      <div class="url-row">
        <input type="text" id="js-url" placeholder="https://raw.githubusercontent.com/.../script.js" />
        <button class="btn btn-warn" id="btn-check-url"><div class="spinner"></div><span class="btn-label">检测</span></button>
      </div>
    </div>
    <div class="input-pane" id="pane-file">
      <div class="dropzone" id="dropzone">
        <input type="file" id="file-input" accept=".js" />
        <span class="drop-icon">⬆</span>
        <div class="drop-text">拖放 .js 文件到此处，或 <span>点击选择</span></div>
        <div class="file-name" id="file-name"></div>
      </div>
      <div class="action-row">
        <button class="btn btn-warn" id="btn-check-file" disabled><div class="spinner"></div><span class="btn-label">检测文件</span></button>
      </div>
    </div>
    <div class="error-msg" id="error-msg"></div>
  </div>

  <div id="results-section" class="results-section" style="display:none;"></div>
</div>

<script>
let direction = 'loon2surge'
let fileContent = null, fileName = null

document.querySelectorAll('.toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    direction = btn.dataset.dir
    clearResults(); hideError()
  })
})

document.querySelectorAll('.input-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.input-tab').forEach(t => t.classList.remove('active'))
    document.querySelectorAll('.input-pane').forEach(p => p.classList.remove('active'))
    tab.classList.add('active')
    document.getElementById('pane-' + tab.dataset.tab).classList.add('active')
    clearResults(); hideError()
  })
})

const dropzone = document.getElementById('dropzone')
const fileInput = document.getElementById('file-input')
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over') })
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'))
dropzone.addEventListener('drop', e => { e.preventDefault(); dropzone.classList.remove('drag-over'); handleFile(e.dataTransfer.files[0]) })
fileInput.addEventListener('change', () => handleFile(fileInput.files[0]))
function handleFile(file) {
  if (!file) return
  fileName = file.name
  document.getElementById('file-name').textContent = '✓ ' + file.name
  document.getElementById('file-name').style.display = 'block'
  const r = new FileReader()
  r.onload = e => { fileContent = e.target.result; document.getElementById('btn-check-file').disabled = false }
  r.readAsText(file, 'utf-8')
}

document.getElementById('btn-check-url').addEventListener('click', async () => {
  const url = document.getElementById('js-url').value.trim()
  if (!url) return showError('请输入有效的 JS URL')
  const btn = document.getElementById('btn-check-url')
  setLoading(btn, true); hideError(); clearResults()
  try {
    const res = await fetch('/jscheck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, direction })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '检测失败')
    renderResult(data, url.split('/').pop(), url)
  } catch(e) { showError(e.message) }
  finally { setLoading(btn, false) }
})

document.getElementById('btn-check-file').addEventListener('click', async () => {
  if (!fileContent) return
  const btn = document.getElementById('btn-check-file')
  setLoading(btn, true); hideError(); clearResults()
  try {
    const res = await fetch('/jscheck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: fileContent, fileName, direction })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '检测失败')
    renderResult(data, fileName, null)
  } catch(e) { showError(e.message) }
  finally { setLoading(btn, false) }
})

function renderResult(data, name, url) {
  const section = document.getElementById('results-section')
  section.style.display = 'block'
  const { issues, fixedJs, crossJs, fetchError } = data

  let statusBadge = ''
  if (fetchError) {
    statusBadge = '<span class="status-badge status-err">无法访问</span>'
  } else if (!issues || issues.length === 0) {
    statusBadge = '<span class="status-badge status-ok">✓ 兼容</span>'
  } else if (issues.some(i => i.type === 'manual' || i.type === 'fetch')) {
    statusBadge = '<span class="status-badge status-warn">⚠ 需手动检查</span>'
  } else {
    statusBadge = '<span class="status-badge status-warn">已自动修正</span>'
  }

  const issuesHtml = (issues && issues.length > 0)
    ? '<div class="issues-list">' + issues.map(issue => {
        const tagCls = issue.type === 'auto' ? 'tag-auto' : issue.type === 'fetch' ? 'tag-err' : 'tag-manual'
        const tagLabel = issue.type === 'auto' ? '自动修正' : issue.type === 'fetch' ? '错误' : '手动处理'
        const lineHtml = issue.line ? '<span class="issue-line">[第 ' + issue.line + ' 行]</span>' : ''
        return '<div class="issue-row"><span class="issue-tag ' + tagCls + '">' + tagLabel + '</span><span class="issue-text">' + esc(issue.msg) + lineHtml + '</span></div>'
      }).join('') + '</div>'
    : ''

  // Actions: fixed version + cross-platform version (always available unless fetch error)
  let actionsHtml = ''
  if (!fetchError) {
    actionsHtml = '<div class="result-actions">'
    if (fixedJs) {
      actionsHtml += '<button class="btn btn-ghost" id="btn-toggle-fixed" style="padding:8px 16px;font-size:12px;">预览修正版</button>'
      actionsHtml += '<button class="btn btn-dl" id="btn-dl-fixed" style="padding:8px 16px;font-size:12px;">↓ 修正版</button>'
    }
    actionsHtml += '<button class="btn btn-cross" id="btn-toggle-cross" style="padding:8px 16px;font-size:12px;">预览双平台版</button>'
    actionsHtml += '<button class="btn btn-dl-cross" id="btn-dl-cross" style="padding:8px 16px;font-size:12px;">↓ 双平台版</button>'
    actionsHtml += '</div>'
  }

  // Two preview panes
  const fixedPreviewHtml = fixedJs
    ? '<div class="fixed-preview" id="fixed-preview">' + esc(fixedJs) + '</div>'
    : ''
  const crossPreviewHtml = crossJs
    ? '<div class="fixed-preview" id="cross-preview">' + esc(crossJs) + '</div>'
    : ''

  const urlLine = url ? '<div class="result-url">' + esc(url) + '</div>' : ''

  section.innerHTML = '<div class="result-block">' +
    '<div class="result-header">' +
      '<div><div class="result-file">' + esc(name || 'script.js') + '</div>' + urlLine + '</div>' +
      statusBadge +
    '</div>' +
    issuesHtml +
    actionsHtml +
    fixedPreviewHtml +
    crossPreviewHtml +
  '</div>'

  // Bind: fixed version
  if (fixedJs) {
    document.getElementById('btn-toggle-fixed').onclick = () => {
      const preview = document.getElementById('fixed-preview')
      // Close cross-preview if open
      const crossPreview = document.getElementById('cross-preview')
      if (crossPreview) { crossPreview.classList.remove('visible'); document.getElementById('btn-toggle-cross').textContent = '预览双平台版' }
      const isVisible = preview.classList.toggle('visible')
      document.getElementById('btn-toggle-fixed').textContent = isVisible ? '隐藏修正版' : '预览修正版'
    }
    document.getElementById('btn-dl-fixed').onclick = () => {
      download(fixedJs, (name || 'script').replace(/\\.js$/i, '') + '.fixed.js')
    }
  }

  // Bind: cross-platform version
  if (crossJs && !fetchError) {
    document.getElementById('btn-toggle-cross').onclick = () => {
      const preview = document.getElementById('cross-preview')
      // Close fixed-preview if open
      const fixedPreview = document.getElementById('fixed-preview')
      if (fixedPreview) { fixedPreview.classList.remove('visible'); const fb = document.getElementById('btn-toggle-fixed'); if(fb) fb.textContent = '预览修正版' }
      const isVisible = preview.classList.toggle('visible')
      document.getElementById('btn-toggle-cross').textContent = isVisible ? '隐藏双平台版' : '预览双平台版'
    }
    document.getElementById('btn-dl-cross').onclick = () => {
      download(crossJs, (name || 'script').replace(/\\.js$/i, '') + '.cross.js')
    }
  }
}

function download(content, filename) {
  const blob = new Blob([content], { type: 'text/javascript' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
}

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
function clearResults() { const s = document.getElementById('results-section'); s.style.display = 'none'; s.innerHTML = '' }
function showError(msg) { const el = document.getElementById('error-msg'); el.textContent = '⚠ ' + msg; el.classList.add('visible') }
function hideError() { document.getElementById('error-msg').classList.remove('visible') }
function setLoading(btn, on) { btn.classList.toggle('loading', on); btn.disabled = on }
</script>
</body>
</html>`;

// ============================================================
// JS COMPATIBILITY CHECKER LOGIC
// ============================================================

/**
 * Check and auto-fix a JS file for Loon ↔ Surge compatibility.
 *
 * Auto-fix (loon2surge):
 *   1. status "HTTP/1.x NNN ..." string → number NNN
 *   2. console.log(...) → $log(...)
 *
 * Warn only (loon2surge):
 *   3. $loon usage → warn + line number
 *   4. $response.status compared to string → warn + line number
 *
 * Warn only (surge2loon):
 *   5. $surge usage → warn + line number
 *
 * Cross-platform compatible version (both directions):
 *   - Injects a platform adapter header at top of file
 *   - Replaces all platform-specific usages with adapter calls
 */
function checkAndFixJs(jsContent, direction) {
  const issues = []
  let fixed = jsContent
  const lines = jsContent.split('\n')

  if (direction === 'loon2surge') {
    // Auto-fix 1: status HTTP string → number
    if (/["']HTTP\/1\.\d\s+(\d{3})[^"']*["']/.test(fixed)) {
      fixed = fixed.replace(/["']HTTP\/1\.\d\s+(\d{3})[^"']*["']/g, (_, code) => code)
      issues.push({
        type: 'auto',
        msg: 'status 使用了 HTTP 字符串格式（如 "HTTP/1.1 200 OK"），Surge 要求纯数字，已自动修正'
      })
    }

    // Auto-fix 2: console.log → $log
    if (/console\.log\s*\(/.test(fixed)) {
      fixed = fixed.replace(/console\.log\s*\(/g, '$log(')
      issues.push({
        type: 'auto',
        msg: 'console.log 在 Surge 中不输出日志，已自动替换为 $log'
      })
    }

    // Warn: $loon usage
    lines.forEach((line, i) => {
      if (/\$loon\b/.test(line) && !line.trim().startsWith('//')) {
        issues.push({
          type: 'manual',
          msg: '$loon 是 Loon 专有对象，在 Surge 中为 undefined，需手动处理',
          line: i + 1
        })
      }
    })

    // Warn: $response.status string comparison
    lines.forEach((line, i) => {
      if (/\$response\.status\s*[=!]=+\s*["']/.test(line) && !line.trim().startsWith('//')) {
        issues.push({
          type: 'manual',
          msg: '$response.status 在 Surge 中为数字，与字符串比较会失效，请改为数字比较（如 === 200）',
          line: i + 1
        })
      }
    })
  }

  if (direction === 'surge2loon') {
    // Warn: $surge usage
    lines.forEach((line, i) => {
      if (/\$surge\b/.test(line) && !line.trim().startsWith('//')) {
        issues.push({
          type: 'manual',
          msg: '$surge 是 Surge 专有对象，在 Loon 中不可用，需手动处理',
          line: i + 1
        })
      }
    })
  }

  const hasAutoFix = issues.some(i => i.type === 'auto')
  return {
    issues,
    fixedJs: hasAutoFix ? fixed : null,
    crossJs: makeCrossPlatform(jsContent),
    fetchError: false
  }
}

/**
 * Generate a cross-platform compatible version of the JS file.
 *
 * Injects a platform adapter at the top, then rewrites:
 *   - status HTTP string        → __STATUS(200)    resolves per platform
 *   - console.log(...)          → __LOG(...)        resolves per platform
 *   - $response.status == "200" → __STATUS_EQ($response.status, 200)
 *   - $loon                     → __LOON           (undefined-safe accessor)
 *   - $surge                    → __SURGE          (undefined-safe accessor)
 *
 * The adapter header defines all __XXX helpers using $environment detection.
 */
function makeCrossPlatform(jsContent) {
  const ADAPTER = `// ── PlugBridge Cross-Platform Adapter ──────────────────────
// Auto-generated: supports Loon & Surge in a single script
const __IS_SURGE = typeof $environment !== 'undefined' && !!$environment.surge;
const __IS_LOON  = typeof $environment !== 'undefined' && !!$environment.loon;

// status: Surge requires number, Loon accepts both
const __STATUS = (code) => __IS_SURGE ? Number(code) : \`HTTP/1.1 \${code} OK\`;

// Logging: Surge uses $log, Loon uses console.log
const __LOG = (...args) => {
  if (__IS_SURGE) { $log(...args); } else { console.log(...args); }
};

// $response.status: Surge returns number, Loon returns string
// Usage: __STATUS_EQ($response.status, 200)
const __STATUS_EQ = (status, code) => Number(status) === Number(code);

// Platform-specific objects (safely undefined on other platforms)
const __LOON  = typeof $loon  !== 'undefined' ? $loon  : undefined;
const __SURGE = typeof $surge !== 'undefined' ? $surge : undefined;
// ────────────────────────────────────────────────────────────

`

  let out = jsContent

  // 1. status HTTP string → __STATUS(NNN)
  out = out.replace(/["']HTTP\/1\.\d\s+(\d{3})[^"']*["']/g, (_, code) => `__STATUS(${code})`)

  // 2. console.log → __LOG
  out = out.replace(/console\.log\s*\(/g, '__LOG(')

  // 3. $log( → __LOG(  (in case script already uses $log for Surge)
  out = out.replace(/\$log\s*\(/g, '__LOG(')

  // 4. $response.status compared to string → __STATUS_EQ(...)
  //    e.g. $response.status === "200"  →  __STATUS_EQ($response.status, 200)
  //    e.g. $response.status !== "404"  →  !__STATUS_EQ($response.status, 404)
  out = out.replace(
    /\$response\.status\s*([=!]=+)\s*["'](\d+)["']/g,
    (_, op, code) => op.startsWith('!')
      ? `!__STATUS_EQ($response.status, ${code})`
      : `__STATUS_EQ($response.status, ${code})`
  )
  // Also handle reversed: "200" === $response.status
  out = out.replace(
    /["'](\d+)["']\s*([=!]=+)\s*\$response\.status/g,
    (_, code, op) => op.startsWith('!')
      ? `!__STATUS_EQ($response.status, ${code})`
      : `__STATUS_EQ($response.status, ${code})`
  )

  // 5. $loon → __LOON
  out = out.replace(/\$loon\b/g, '__LOON')

  // 6. $surge → __SURGE
  out = out.replace(/\$surge\b/g, '__SURGE')

  return ADAPTER + out
}

// ============================================================
// CONVERTER CORE
// ============================================================

function parseFile(text) {
  const lines = text.split('\n'), meta = [], sections = {}
  let current = null
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (/^#!/.test(line)) { meta.push(line); continue }
    const secMatch = line.match(/^\[(.+)\]$/)
    if (secMatch) { current = secMatch[1].trim(); if (!sections[current]) sections[current] = []; continue }
    if (current !== null) sections[current].push(line)
  }
  return { meta, sections }
}

function parseKV(str) {
  const kv = {}, parts = str.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
  for (const part of parts) {
    const idx = part.indexOf('='); if (idx === -1) continue
    const k = part.slice(0, idx).trim(), v = part.slice(idx + 1).trim().replace(/^"|"$/g, '')
    if (k) kv[k] = v
  }
  return kv
}

function convertLoonRewriteToSurge(line, warnings) {
  if (!line.trim() || line.trim().startsWith('#')) return { section: 'URL Rewrite', line }
  const headerOpMatch = line.match(/^(\S+)\s+(header-add|header-del|header-replace)\s+(.*)/i)
  if (headerOpMatch) {
    const [, pattern, op, rest] = headerOpMatch, surgeOp = op.toLowerCase()
    if (surgeOp === 'header-add') {
      const sp = rest.indexOf(' ')
      return { section: 'Header Rewrite', line: `${pattern} header-add ${sp===-1?rest:rest.slice(0,sp).trim()}: ${sp===-1?'':rest.slice(sp+1).trim()}` }
    }
    if (surgeOp === 'header-del') return { section: 'Header Rewrite', line: `${pattern} header-del ${rest.trim()}` }
    if (surgeOp === 'header-replace') {
      const sp = rest.indexOf(' ')
      return { section: 'Header Rewrite', line: `${pattern} header-replace ${sp===-1?rest:rest.slice(0,sp).trim()} ${sp===-1?'':rest.slice(sp+1).trim()}` }
    }
  }
  const urlMatch = line.match(/^(\S+)\s+(header|302|307|reject(?:-200|-img|-dict|-array)?)\s*(\S+)?/i)
  if (urlMatch) {
    const [, pattern, type, target] = urlMatch, t = type.toLowerCase()
    if (t === 'header') return { section: 'URL Rewrite', line: `${pattern} ${target||''} header` }
    if (t === '302')    return { section: 'URL Rewrite', line: `${pattern} ${target||''} 302` }
    if (t === '307')    { warnings.push('"307" — Surge 不支持，已降级为 302'); return { section: 'URL Rewrite', line: `${pattern} ${target||''} 302` } }
    if (t === 'reject') return { section: 'URL Rewrite', line: `${pattern} - reject` }
    if (t === 'reject-200' || t === 'reject-img' || t === 'reject-dict' || t === 'reject-array') {
      warnings.push(`"${t}" — Surge 无精确对应，已转为 reject`)
      return { section: 'URL Rewrite', line: `${pattern} - reject` }
    }
  }
  warnings.push(`无法识别的 Rewrite 行（原样保留）：${line.trim()}`)
  return { section: 'URL Rewrite', line }
}

function convertLoonScriptToSurge(line, warnings) {
  if (!line.trim() || line.trim().startsWith('#')) return line
  const cronM = line.match(/^cron\s+"([^"]+)"\s+(.*)/i)
  const httpM = line.match(/^(http-request|http-response)\s+(\S+)\s+(.*)/i)
  const netM  = line.match(/^network-changed\s+(.*)/i)
  const genM  = line.match(/^generic\s+(.*)/i)
  if (cronM) {
    const kv = parseKV(cronM[2])
    return `${kv.tag||'cron_task'} = type=cron, cronexp="${cronM[1]}", script-path=${kv['script-path']||''}${kv.timeout?`, timeout=${kv.timeout}`:''}${kv.argument?`, argument=${kv.argument}`:''}`
  }
  if (httpM) {
    const kv = parseKV(httpM[3]), name = kv.tag||`${httpM[1]}_script`
    return `${name} = type=${httpM[1]}, pattern=${httpM[2]}, script-path=${kv['script-path']||''}${kv['requires-body']==='true'?', requires-body=1':''}${kv['binary-body-mode']==='true'?', binary-body-mode=1':''}${kv.timeout?`, timeout=${kv.timeout}`:''}${kv.argument?`, argument=${kv.argument}`:''}`
  }
  if (netM) {
    const kv = parseKV(netM[1])
    warnings.push('"network-changed" 已转为 Surge type=event，行为可能有细微差异')
    return `${kv.tag||'network_changed'} = type=event, event-name=network-changed, script-path=${kv['script-path']||''}${kv.timeout?`, timeout=${kv.timeout}`:''}`
  }
  if (genM) { warnings.push('"generic" 脚本类型 Surge 无对应，已注释'); return `# [需手动处理] ${line}` }
  warnings.push(`无法识别的 Script 行（原样保留）：${line.trim()}`)
  return line
}

function convertArguments(meta, sections) {
  const newMeta = meta.map(line => {
    if (!line.startsWith('#!arguments=')) return line
    const raw = line.slice('#!arguments='.length), pairs = []
    const re = /(\w+):"([^"]*)"/g; let m
    while ((m = re.exec(raw)) !== null) pairs.push(`${m[1]}=${m[2]}`)
    if (pairs.length === 0) for (const part of raw.split(',')) { const ci = part.indexOf(':'); if (ci!==-1) pairs.push(`${part.slice(0,ci).trim()}=${part.slice(ci+1).trim().replace(/^"|"$/g,'')}`) }
    return `#!arguments=${pairs.join('&')}`
  })
  const fn = str => str.replace(/\{\{\{(\w+)\}\}\}/g, (_,k) => `%${k}%`)
  const newSections = {}; for (const [s,l] of Object.entries(sections)) newSections[s]=l.map(fn)
  return { meta: newMeta, sections: newSections }
}

function convertLoonToSurge(text) {
  let { meta, sections } = parseFile(text)
  const warnings = [], stats = { scripts: 0, rewrites: 0, mitm: 0, rules: 0 }
  ;({ meta, sections } = convertArguments(meta, sections))
  const out = []; for (const m of meta) out.push(m)
  const scriptSrc = sections['Script'] || sections['script'] || []
  if (scriptSrc.length > 0) {
    out.push('', '[Script]')
    for (const line of scriptSrc) { if (!line.trim()||line.trim().startsWith('#')){out.push(line);continue} const c=convertLoonScriptToSurge(line,warnings);out.push(c);if(!c.startsWith('#'))stats.scripts++ }
  }
  const rwSrc = sections['Rewrite']||sections['rewrite']||[], urlRw=[], hdrRw=[]
  for (const line of rwSrc) { if(!line.trim()||line.trim().startsWith('#')){urlRw.push(line);continue} const {section,line:c}=convertLoonRewriteToSurge(line,warnings); if(section==='Header Rewrite')hdrRw.push(c); else{urlRw.push(c);stats.rewrites++} }
  if(urlRw.length>0){out.push('','[URL Rewrite]');for(const l of urlRw)out.push(l)}
  if(hdrRw.length>0){out.push('','[Header Rewrite]');for(const l of hdrRw)out.push(l)}
  const ruleSrc=sections['Rule']||sections['rule']||sections['Filter']||sections['filter']||[]
  if(ruleSrc.length>0){out.push('','[Rule]');for(const line of ruleSrc){out.push(line);if(line.trim()&&!line.trim().startsWith('#'))stats.rules++}}
  const mitmSrc=sections['MITM']||sections['MitM']||sections['Mitm']||[]
  if(mitmSrc.length>0){out.push('','[MITM]');for(const line of mitmSrc){if(!line.trim()||line.trim().startsWith('#')){out.push(line);continue}if(/^hostname\s*=/i.test(line)){out.push(`hostname = %APPEND% ${line.replace(/^hostname\s*=\s*/i,'').trim()}`);stats.mitm++}else out.push(line)}}
  const handled=new Set(['Script','script','Rewrite','rewrite','Rule','rule','Filter','filter','MITM','MitM','Mitm'])
  for(const [sec,secLines] of Object.entries(sections)){if(handled.has(sec))continue;out.push('',`[${sec}]`);for(const l of secLines)out.push(l)}
  return { result: out.join('\n').trimStart(), stats, warnings }
}

function convertSurgeRewriteToLoon(line, warnings) {
  if (!line.trim()||line.trim().startsWith('#')) return line
  const m = line.match(/^(\S+)\s+(\S+)\s+(header|302|307|reject.*)$/i)
  if (m) {
    const [,pattern,target,type]=m,t=type.toLowerCase()
    if(t==='header')return `${pattern} header ${target}`
    if(t==='302')return `${pattern} 302 ${target}`
    if(t==='reject')return `${pattern} reject`
  }
  warnings.push(`无法识别的 URL Rewrite 行（原样保留）：${line.trim()}`)
  return line
}

function convertSurgeHeaderRewriteToLoon(line) {
  if (!line.trim()||line.trim().startsWith('#')) return line
  const m=line.match(/^(\S+)\s+(header-add|header-del|header-replace)\s+(.*)/i)
  if(m)return `${m[1]} ${m[2].toLowerCase()} ${m[3].replace(/^(\S+):\s*/,'$1 ').trim()}`
  return line
}

function convertSurgeScriptToLoon(line, warnings) {
  if (!line.trim()||line.trim().startsWith('#')) return line
  const am=line.match(/^([^=]+)=(.+)/)
  if(!am){warnings.push(`无法识别的 Script 行：${line.trim()}`);return line}
  const name=am[1].trim(),kv=parseKV(am[2]),type=(kv.type||'').toLowerCase()
  const sp=kv['script-path']||'',to=kv.timeout?`, timeout=${kv.timeout}`:'',arg=kv.argument?`, argument="${kv.argument}"`:''
  if(type==='cron')return `cron "${kv.cronexp||kv['cron-expression']||'*/5 * * * *'}" script-path=${sp}${to}, tag=${name}${arg}`
  if(type==='http-request'||type==='http-response'){const rb=kv['requires-body']==='1'?', requires-body=true':'',bm=kv['binary-body-mode']==='1'?', binary-body-mode=true':'';return `${type} ${kv.pattern||''} script-path=${sp}${rb}${bm}${to}, tag=${name}${arg}, enable=true`}
  if(type==='event'){warnings.push('type=event 已转为 Loon network-changed，行为可能有细微差异');return `network-changed script-path=${sp}${to}, tag=${name}`}
  warnings.push(`未知 Script 类型 "${type}"（原样保留）`); return line
}

function convertArgumentsReverse(meta, sections) {
  const newMeta=meta.map(line=>{if(!line.startsWith('#!arguments='))return line;const raw=line.slice('#!arguments='.length);const pairs=raw.split('&').map(p=>{const ei=p.indexOf('=');return ei===-1?p:`${p.slice(0,ei).trim()}:"${p.slice(ei+1).trim()}"`});return `#!arguments=${pairs.join(',')}`})
  const fn=str=>str.replace(/%(\w+)%/g,(_,k)=>`{{{${k}}}}`)
  const ns={};for(const [s,l] of Object.entries(sections))ns[s]=l.map(fn)
  return {meta:newMeta,sections:ns}
}

function convertSurgeToLoon(text) {
  let { meta, sections } = parseFile(text)
  const warnings=[], stats={scripts:0,rewrites:0,mitm:0,rules:0}
  ;({meta,sections}=convertArgumentsReverse(meta,sections))
  const out=[]; for(const m of meta)out.push(m)
  const scriptSrc=sections['Script']||[]
  if(scriptSrc.length>0){out.push('','[Script]');for(const line of scriptSrc){if(!line.trim()||line.trim().startsWith('#')){out.push(line);continue}const c=convertSurgeScriptToLoon(line,warnings);out.push(c);if(!c.startsWith('#'))stats.scripts++}}
  const urlRwSrc=sections['URL Rewrite']||[],hdrRwSrc=sections['Header Rewrite']||[]
  if(urlRwSrc.length>0||hdrRwSrc.length>0){out.push('','[Rewrite]');for(const line of urlRwSrc){if(!line.trim()||line.trim().startsWith('#')){out.push(line);continue}out.push(convertSurgeRewriteToLoon(line,warnings));stats.rewrites++};for(const line of hdrRwSrc){if(!line.trim()||line.trim().startsWith('#')){out.push(line);continue}out.push(convertSurgeHeaderRewriteToLoon(line));stats.rewrites++}}
  if(sections['Rule']){out.push('','[Rule]');for(const line of sections['Rule']){out.push(line);if(line.trim()&&!line.trim().startsWith('#'))stats.rules++}}
  if(sections['MITM']){out.push('','[MITM]');for(const line of sections['MITM']){if(!line.trim()||line.trim().startsWith('#')){out.push(line);continue}if(/^hostname\s*=/i.test(line)){out.push(`hostname = ${line.replace(/^hostname\s*=\s*/i,'').replace(/%APPEND%\s*|%INSERT%\s*/gi,'').trim()}`);stats.mitm++}else out.push(line)}}
  const handled=new Set(['Script','URL Rewrite','Header Rewrite','Rule','MITM'])
  for(const [sec,secLines] of Object.entries(sections)){if(handled.has(sec))continue;out.push('',`[${sec}]`);for(const l of secLines)out.push(l)}
  return { result: out.join('\n').trimStart(), stats, warnings }
}

// ============================================================
// WORKER ENTRY
// ============================================================

export default {
  async fetch(request) {
    const url = new URL(request.url)

    // ── GET / → main page ──────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(HTML_MAIN, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    }

    // ── GET /jscheck → JS check page ──────────────────────
    if (request.method === 'GET' && url.pathname === '/jscheck') {
      return new Response(HTML_JSCHECK, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    }

    // ── POST /convert → plugin/module conversion ───────────
    if (request.method === 'POST' && url.pathname === '/convert') {
      let body
      try { body = await request.json() } catch { return jsonError('Invalid JSON body', 400) }
      const { direction, content, url: remoteUrl } = body
      if (!direction || !['loon2surge','surge2loon'].includes(direction))
        return jsonError('direction must be loon2surge or surge2loon', 400)
      let raw = content
      if (!raw && remoteUrl) {
        try {
          const res = await fetch(remoteUrl, { headers: { 'User-Agent': 'PlugBridge/1.0' }, cf: { cacheTtl: 0 } })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          raw = await res.text()
        } catch (e) { return jsonError(`无法获取远程文件: ${e.message}`, 502) }
      }
      if (!raw) return jsonError('请提供 content 或 url', 400)
      try {
        const { result, stats, warnings } = direction === 'loon2surge'
          ? convertLoonToSurge(raw) : convertSurgeToLoon(raw)
        return new Response(JSON.stringify({ result, stats, warnings }), {
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        })
      } catch (e) { return jsonError(`转换出错: ${e.message}`, 500) }
    }

    // ── POST /jscheck → JS compatibility check ─────────────
    if (request.method === 'POST' && url.pathname === '/jscheck') {
      let body
      try { body = await request.json() } catch { return jsonError('Invalid JSON body', 400) }
      const { direction, content, url: remoteUrl } = body
      if (!direction || !['loon2surge','surge2loon'].includes(direction))
        return jsonError('direction must be loon2surge or surge2loon', 400)
      let jsText = content
      if (!jsText && remoteUrl) {
        try {
          const res = await fetch(remoteUrl, { headers: { 'User-Agent': 'PlugBridge/1.0' }, cf: { cacheTtl: 0 } })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          jsText = await res.text()
        } catch (e) {
          return new Response(JSON.stringify({
            issues: [{ type: 'fetch', msg: `无法访问该文件（${e.message}）` }],
            fixedJs: null,
            fetchError: true
          }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
        }
      }
      if (!jsText) return jsonError('请提供 content 或 url', 400)
      const result = checkAndFixJs(jsText, direction)
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      })
    }

    return new Response('Not Found', { status: 404 })
  }
}

function jsonError(msg, status) {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8' }
  })
}
