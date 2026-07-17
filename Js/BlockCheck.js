/**
 * 节点连通性检测脚本 (Loon 版)
 * 移植自 Quantumult X 版，原作者：https://github.com/RavelloH
 *
 * 功能：
 *   检测当前节点是否可连接，并判断是否被运营商/GFW 阻断
 *
 * 配置 (Loon):
 *   [Script]
 *   generic script-path=https://raw.githubusercontent.com/wangyuyan666/Doumu/main/Js/BlockCheck.js, tag=节点阻断检测, img-url=bolt.horizontal.icloud.fill.system, timeout=30
 *
 * 使用：Loon 首页 → 脚本 → 节点阻断检测 → 选择节点执行
 *   远端探测依赖 $environment.params.nodeInfo，需 Loon build 411+
 */

const IP_API = "http://ip-api.com/json?lang=zh-CN";
const CHECK_HOST = "https://check-host.net";
const TIMEOUT = 8000;

function httpGet(params) {
  return new Promise(function (resolve, reject) {
    $httpClient.get(params, function (errormsg, response, data) {
      if (errormsg) {
        reject(errormsg);
      } else {
        resolve({ status: response ? response.status : 0, body: data });
      }
    });
  });
}

function run() {
  var params = $environment.params || {};
  var tag = params.node;
  if (!tag) return done("未获取到节点名称");

  var host = null, port = null;
  var info = params.nodeInfo;
  if (info && info.address && info.port) {
    host = String(info.address);
    port = String(info.port);
  }
  startChecks(tag, host, port);
}

function startChecks(tag, host, port) {
  var pA = httpGet({ url: IP_API, node: tag, timeout: TIMEOUT })
    .then(function (r) { return { src: "node", ok: true, data: JSON.parse(r.body) }; })
    .catch(function () { return { src: "node", ok: false }; });

  var pB = httpGet({ url: IP_API, timeout: TIMEOUT })
    .then(function (r) { return { src: "direct", ok: true, data: JSON.parse(r.body) }; })
    .catch(function () { return { src: "direct", ok: false }; });

  var pC;
  if (host && port) {
    var target = host + ":" + port;
    var checkUrl = CHECK_HOST + "/check-tcp?host=" + encodeURIComponent(target) + "&max_nodes=10";
    pC = httpGet({ url: checkUrl, headers: { "Accept": "application/json" }, timeout: TIMEOUT })
      .then(function (r) {
        var d = JSON.parse(r.body);
        if (!d.ok || !d.request_id) return { src: "remote", ok: false, error: "提交失败" };
        var rid = d.request_id;
        var nodeList = d.nodes || {};
        var nodeNames = Object.keys(nodeList);
        var countryMap = {};
        nodeNames.forEach(function (n) {
          var info = nodeList[n];
          if (info && info.length >= 1) countryMap[n] = info[0];
        });
        return new Promise(function (resolve) {
          setTimeout(function () {
            httpGet({ url: CHECK_HOST + "/check-result/" + rid, headers: { "Accept": "application/json" }, timeout: TIMEOUT })
              .then(function (r2) {
                var res = JSON.parse(r2.body);
                var reachable = false;
                var items = [];
                nodeNames.forEach(function (n) {
                  var cc = countryMap[n] || "";
                  var flag = cc ? getFlag(cc) : "🌍";
                  var nr = res[n];
                  var ms = '<code style="font-family: Menlo, Monaco, monospace; font-size: 12px">--.--ms</code>';
                  if (nr && Array.isArray(nr) && nr.length > 0 && nr[0].time !== undefined) {
                    reachable = true;
                    ms = '<code style="font-family: Menlo, Monaco, monospace; font-size: 12px">' + formatMs(nr[0].time * 1000) + '</code>';
                  }
                  items.push({ flag: flag, ms: ms });
                });
                resolve({ src: "remote", ok: reachable, data: items });
              }, function () {
                resolve({ src: "remote", ok: false, error: "查询失败" });
              });
          }, 3500);
        });
      })
      .catch(function () { return { src: "remote", ok: false, error: "请求失败" }; });
  } else {
    pC = Promise.resolve({ src: "remote", ok: false, error: "无地址信息" });
  }

  // pA/pB/pC 内部都已 catch，不会 reject
  Promise.all([pA, pB, pC]).then(function (results) {
    render(tag, results[0], results[1], results[2]);
  });
}

function formatMs(ms) {
  if (ms >= 10000) {
    return Math.floor(ms) + "ms";
  } else if (ms >= 1000) {
    return Math.floor(ms).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "ms";
  } else if (ms >= 100) {
    return ms.toFixed(1) + "ms";
  } else if (ms >= 10) {
    return ms.toFixed(2) + "ms";
  } else if (ms <= 0) {
    return "0.00ms";
  } else {
    return ms.toFixed(3) + "ms";
  }
}

function render(tag, node, direct, remote) {
  var nOk = node && node.ok;
  var dOk = direct && direct.ok;
  var rOk = remote && remote.ok;

  var parts = [];

  // 节点代理
  var nodeStr = '<span style="font-weight: bold">节点代理</span>: ' + (nOk ? "✅ 正常" : "❌ 不可达");
  if (nOk && node.data) {
    var d = node.data;
    nodeStr += '<br/>' + '<span style="font-weight: bold">IP</span>: ' + d.query;
    nodeStr += '<br/>' + '<span style="font-weight: bold">位置</span>: ' + [d.country, d.regionName, d.city].filter(Boolean).join(" - ");
    nodeStr += '<br/>' + '<span style="font-weight: bold">ISP</span>: ' + (d.isp || "未知");
  }
  parts.push(nodeStr);

  // 本机网络
  parts.push('<span style="font-weight: bold">本机网络</span>: ' + (dOk ? "✅ 正常" : "❌ 异常"));

  // 远端探测
  var remoteStr = '<span style="font-weight: bold">远端探测</span>: ' + (rOk ? "✅ 可达" : "❌ 不可达");
  if (remote && remote.data && remote.data.length > 0) {
    var items = remote.data;
    for (var i = 0; i < items.length; i += 2) {
      var left = items[i];
      var right = i + 1 < items.length ? items[i + 1] : null;
      remoteStr += '<br/>' + left.flag + " " + left.ms;
      if (right) {
        remoteStr += "&emsp;&emsp;" + right.flag + " " + right.ms;
      }
    }
  } else if (remote && remote.error) {
    remoteStr += '<br/>' + remote.error;
  }
  parts.push(remoteStr);

  // 分隔
  parts.push('<span style="font-weight: bold">📋 诊断结论</span>');

  if (!dOk) {
    parts.push('⚠️ 本机网络异常');
  } else if (nOk && rOk) {
    parts.push('✅ 节点正常');
  } else if (!nOk && rOk && dOk) {
    parts.push('🚫 疑似被运营商/GFW 阻断');
  } else if (!nOk && !rOk && dOk) {
    parts.push('💤 节点离线');
  } else {
    parts.push('❓ 数据不完整');
  }

  // 节点名称
  parts.push('<span style="font-weight: bold">节点</span>: <span style="color: #467fcf">' + (tag || "当前节点") + '</span>');

  var html = parts.join('<br/><br/>');

  $done({
    "title": "   🌐 节点阻断检测",
    htmlMessage: '<div style="font-family: -apple-system; font-size: large">' + html + '</div>'
  });
}

function getFlag(cc) {
  if (!cc || cc.length !== 2) return "🌍";
  var cp = cc.toUpperCase().split('').map(function (c) { return 127397 + c.charCodeAt(); });
  return String.fromCodePoint.apply(null, cp);
}

function done(msg) {
  $done({
    "title": "   🌐 节点阻断检测",
    htmlMessage: '<div style="font-family: -apple-system; font-size: large"><span style="font-weight: bold">🛑 ' + msg + '</span></div>'
  });
}

run();
