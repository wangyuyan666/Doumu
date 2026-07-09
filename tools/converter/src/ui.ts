/** 管理页：单文件 HTML，经 /?token= 鉴权后返回，页面内 fetch 自动携带同一 token */
export const UI_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>配置互转 — Loon / Surge / Quantumult X</title>
<style>
  :root {
    --bg: #f6f7f9; --card: #ffffff; --text: #1a1d21; --muted: #6b7280;
    --border: #e2e5ea; --accent: #2563eb; --accent-text: #ffffff;
    --warn-bg: #fef3c7; --warn-text: #92400e; --ok-bg: #d1fae5; --ok-text: #065f46;
    --err-bg: #fee2e2; --err-text: #991b1b; --code-bg: #f3f4f6;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #101317; --card: #1a1f26; --text: #e5e7eb; --muted: #9ca3af;
      --border: #2d333c; --accent: #3b82f6; --accent-text: #ffffff;
      --warn-bg: #3a2e10; --warn-text: #fbbf24; --ok-bg: #0c2f24; --ok-text: #34d399;
      --err-bg: #3a1515; --err-text: #f87171; --code-bg: #12161b;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text);
    font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
  .wrap { max-width: 860px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: var(--muted); margin: 0 0 20px; font-size: 13px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 18px; margin-bottom: 16px; }
  label.title { display: block; font-weight: 600; margin-bottom: 8px; }
  .tabs { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
  .tabs button, .seg button {
    border: 1px solid var(--border); background: transparent; color: var(--text);
    padding: 6px 14px; border-radius: 8px; cursor: pointer; font-size: 13px;
  }
  .tabs button.on, .seg button.on { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }
  input[type=url], textarea, select {
    width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px;
    background: var(--code-bg); color: var(--text); font-size: 13px;
  }
  textarea { min-height: 180px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; resize: vertical; }
  .row { display: flex; gap: 16px; flex-wrap: wrap; align-items: center; }
  .row > div { flex: 1; min-width: 200px; }
  .opts { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 12px; color: var(--muted); }
  .opts label { cursor: pointer; user-select: none; }
  .go { margin-top: 16px; }
  .go button {
    background: var(--accent); color: var(--accent-text); border: none; border-radius: 8px;
    padding: 10px 28px; font-size: 15px; font-weight: 600; cursor: pointer;
  }
  .go button:disabled { opacity: .5; cursor: wait; }
  .msg { padding: 8px 12px; border-radius: 8px; margin: 6px 0; font-size: 13px; white-space: pre-wrap; word-break: break-all; }
  .msg.warn { background: var(--warn-bg); color: var(--warn-text); }
  .msg.ok { background: var(--ok-bg); color: var(--ok-text); }
  .msg.err { background: var(--err-bg); color: var(--err-text); }
  pre.out {
    background: var(--code-bg); border: 1px solid var(--border); border-radius: 8px;
    padding: 12px; overflow-x: auto; font-size: 12.5px; max-height: 480px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .toolbar { display: flex; gap: 8px; margin-bottom: 8px; }
  .toolbar button { border: 1px solid var(--border); background: transparent; color: var(--text);
    padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 12.5px; }
  .hidden { display: none; }
  .file-drop { border: 2px dashed var(--border); border-radius: 8px; padding: 24px; text-align: center; color: var(--muted); cursor: pointer; }
  .file-drop.hover { border-color: var(--accent); color: var(--accent); }
</style>
</head>
<body>
<div class="wrap">
  <h1>配置互转</h1>
  <p class="sub">Loon 插件 · Surge 模块 · Quantumult X 重写 — 互相转换，附 JS 脚本兼容性检查</p>

  <div class="card">
    <label class="title">输入</label>
    <div class="tabs" id="inputTabs">
      <button data-tab="url" class="on">远程 URL</button>
      <button data-tab="file">上传文件</button>
      <button data-tab="text">粘贴内容</button>
    </div>
    <div id="tab-url">
      <input type="url" id="srcUrl" placeholder="https://example.com/xxx.plugin / .sgmodule / .snippet">
    </div>
    <div id="tab-file" class="hidden">
      <div class="file-drop" id="fileDrop">点击选择或拖入文件<span id="fileName"></span></div>
      <input type="file" id="fileInput" class="hidden">
    </div>
    <div id="tab-text" class="hidden">
      <textarea id="srcText" placeholder="粘贴 Loon / Surge / QX 配置内容…"></textarea>
    </div>
    <div id="attachArea" class="hidden" style="margin-top:12px">
      <label class="title" style="font-size:13px">附带 JS 脚本（可多选，选填）</label>
      <div class="file-drop" id="jsDrop" style="padding:14px">配置里 script-path 引用了本地 JS？点击选择或拖入这些文件，文件名需与 script-path 一致<span id="jsNames"></span></div>
      <input type="file" id="jsInput" class="hidden" multiple accept=".js,text/javascript">
    </div>
  </div>

  <div class="card">
    <div class="row">
      <div>
        <label class="title">来源格式</label>
        <select id="from">
          <option value="auto" selected>自动识别</option>
          <option value="loon">Loon 插件</option>
          <option value="surge">Surge 模块</option>
          <option value="qx">Quantumult X 重写</option>
        </select>
      </div>
      <div>
        <label class="title">目标格式</label>
        <div class="seg" id="targetSeg">
          <button data-v="loon">Loon</button>
          <button data-v="surge" class="on">Surge</button>
          <button data-v="qx">Quantumult X</button>
        </div>
      </div>
    </div>
    <div class="opts">
      <label><input type="checkbox" id="optCheck" checked> 检查 JS 脚本兼容性</label>
      <label><input type="checkbox" id="optJsconvert"> 不兼容脚本自动注入兼容层（经本服务代理）</label>
    </div>
    <div class="go"><button id="convertBtn">转换</button></div>
  </div>

  <div class="card hidden" id="resultCard">
    <label class="title">结果</label>
    <div id="messages"></div>
    <div class="toolbar">
      <button id="copyBtn">复制</button>
      <button id="dlBtn">下载</button>
    </div>
    <pre class="out" id="output"></pre>
  </div>
</div>

<script>
(function () {
  var token = new URLSearchParams(location.search).get("token") || "";
  var inputMode = "url";
  var target = "surge";
  var fileContent = null;
  var jsFiles = [];
  var lastOutput = "";
  var lastExt = "sgmodule";
  var EXT = { loon: "plugin", surge: "sgmodule", qx: "snippet" };

  function $(id) { return document.getElementById(id); }

  // 输入方式切换
  $("inputTabs").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    inputMode = b.dataset.tab;
    this.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); });
    ["url", "file", "text"].forEach(function (t) {
      $("tab-" + t).classList.toggle("hidden", t !== inputMode);
    });
    // 附带 JS 仅在上传/粘贴方式下可用（远程配置引本地 JS 请改用这两种方式）
    $("attachArea").classList.toggle("hidden", inputMode === "url");
  });

  // 目标格式切换
  $("targetSeg").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    target = b.dataset.v;
    this.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); });
  });

  // 文件选择 / 拖拽
  var drop = $("fileDrop"), fi = $("fileInput");
  drop.addEventListener("click", function () { fi.click(); });
  fi.addEventListener("change", function () { if (fi.files[0]) readFile(fi.files[0]); });
  drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("hover"); });
  drop.addEventListener("dragleave", function () { drop.classList.remove("hover"); });
  drop.addEventListener("drop", function (e) {
    e.preventDefault(); drop.classList.remove("hover");
    if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
  });
  function readFile(f) {
    var r = new FileReader();
    r.onload = function () { fileContent = r.result; $("fileName").textContent = "：" + f.name; };
    r.readAsText(f);
  }

  // 附带 JS 脚本选择 / 拖拽
  var jsDrop = $("jsDrop"), ji = $("jsInput");
  jsDrop.addEventListener("click", function () { ji.click(); });
  ji.addEventListener("change", function () { setJsFiles(ji.files); });
  jsDrop.addEventListener("dragover", function (e) { e.preventDefault(); jsDrop.classList.add("hover"); });
  jsDrop.addEventListener("dragleave", function () { jsDrop.classList.remove("hover"); });
  jsDrop.addEventListener("drop", function (e) {
    e.preventDefault(); jsDrop.classList.remove("hover");
    setJsFiles(e.dataTransfer.files);
  });
  function setJsFiles(list) {
    jsFiles = Array.prototype.slice.call(list);
    $("jsNames").textContent = jsFiles.length ? "：" + jsFiles.map(function (f) { return f.name; }).join("、") : "";
  }

  function addMsg(cls, text) {
    var d = document.createElement("div");
    d.className = "msg " + cls;
    d.textContent = text;
    $("messages").appendChild(d);
  }

  $("convertBtn").addEventListener("click", async function () {
    var btn = this;
    var qs = new URLSearchParams({ token: token, target: target, report: "1" });
    var fromV = $("from").value;
    if (fromV !== "auto") qs.set("from", fromV);
    if (!$("optCheck").checked) qs.set("check", "0");
    if ($("optJsconvert").checked) qs.set("jsconvert", "1");

    var method = "POST", body = null;
    if (inputMode === "url") {
      var u = $("srcUrl").value.trim();
      if (!u) return alert("请填写远程 URL");
      qs.set("src", u); method = "GET";
    } else {
      // 上传/粘贴统一走 multipart，便于附带 JS 脚本
      var fd = new FormData();
      if (inputMode === "file") {
        if (!fileContent) return alert("请选择文件");
        fd.append("file", new Blob([fileContent], { type: "text/plain" }), "config.txt");
      } else {
        var t = $("srcText").value;
        if (!t.trim()) return alert("请粘贴配置内容");
        fd.append("content", t);
      }
      jsFiles.forEach(function (f) { fd.append("script", f, f.name); });
      body = fd;
    }

    btn.disabled = true; btn.textContent = "转换中…";
    $("messages").innerHTML = ""; $("resultCard").classList.remove("hidden");
    $("output").textContent = "";
    try {
      // FormData 由浏览器自动设置 multipart 边界，不要手动指定 content-type
      var res = await fetch("/convert?" + qs.toString(), { method: method, body: body });
      if (!res.ok) { addMsg("err", await res.text()); return; }
      var data = await res.json();
      addMsg("ok", "识别来源: " + data.from + " → 目标: " + data.target);
      (data.warnings || []).forEach(function (w) { addMsg("warn", "⚠ " + w); });
      (data.jsCompatibility || []).forEach(function (j) {
        if (j.status === "incompatible") {
          var hint = !j.shimmable ? "（含无法自动补齐的 API，需手动改写）"
            : $("optJsconvert").checked ? "（已自动注入兼容层）"
            : "（可勾选「自动注入兼容层」转换）";
          addMsg("warn", "⚠ JS 不兼容: " + j.path + "\\n   缺少 API: " + j.offendingApis.join(", ") + hint);
        } else if (j.status === "universal") {
          addMsg("ok", "✓ " + j.path + " 自带多端适配层");
        } else if (j.status === "unknown") {
          addMsg("warn", "? " + j.path + " 未能检查（" + (j.error || "未知原因") + "）");
        } else {
          addMsg("ok", "✓ " + j.path + " 兼容");
        }
      });
      lastOutput = data.output || "";
      lastExt = EXT[data.target] || "txt";
      $("output").textContent = lastOutput;
      // 注入兼容层后的本地脚本：逐个给下载按钮（保持原文件名，替换本地原文件）
      (data.convertedScripts || []).forEach(function (s) {
        var d = document.createElement("div");
        d.className = "msg ok";
        var b = document.createElement("button");
        b.textContent = "下载转换后脚本 " + s.name;
        b.style.cssText = "margin-left:8px;border:1px solid currentColor;background:transparent;color:inherit;border-radius:6px;padding:3px 10px;cursor:pointer";
        b.addEventListener("click", function () {
          var a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([s.content], { type: "text/javascript" }));
          a.download = s.name;
          a.click();
          URL.revokeObjectURL(a.href);
        });
        d.textContent = "✓ 本地脚本已注入兼容层: " + s.name + "（下载后替换原文件）";
        d.appendChild(b);
        $("messages").appendChild(d);
      });
    } catch (e) {
      addMsg("err", "请求失败: " + e.message);
    } finally {
      btn.disabled = false; btn.textContent = "转换";
    }
  });

  $("copyBtn").addEventListener("click", function () {
    navigator.clipboard.writeText(lastOutput).then(function () {
      $("copyBtn").textContent = "已复制";
      setTimeout(function () { $("copyBtn").textContent = "复制"; }, 1500);
    });
  });
  $("dlBtn").addEventListener("click", function () {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lastOutput], { type: "text/plain" }));
    a.download = "converted." + lastExt;
    a.click();
    URL.revokeObjectURL(a.href);
  });
})();
</script>
</body>
</html>`;
