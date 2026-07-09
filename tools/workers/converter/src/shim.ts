import type { Fmt } from "./types";

/**
 * 兼容层：把「另一端」的脚本 API 映射到目标端原生 API。
 * 用 var + typeof 守卫，重复注入或原生已存在时不覆盖。
 *
 * API 签名依据官方文档：
 * - Surge/Loon: $httpClient.get(params, cb(error, response, data))
 *               $persistentStore.read(key) / .write(value, key)
 *               $notification.post(title, subtitle, body)
 * - QX:         $task.fetch(request) -> Promise<{statusCode, headers, body}>
 *               $prefs.valueForKey(key) / .setValueForKey(value, key)
 *               $notify(title, subtitle, message)
 */

/** Surge/Loon API -> QX 原生实现（目标端为 QX 时注入） */
const SHIM_FOR_QX = `// ==converter shim: Surge/Loon API on Quantumult X==
(function () {
  if (typeof $task === "undefined") return; // 非 QX 环境不注入
  if (typeof $httpClient === "undefined") {
    var _method = function (method) {
      return function (params, callback) {
        if (typeof params === "string") params = { url: params };
        var req = {
          url: params.url,
          method: method,
          headers: params.headers || {},
          body: params.body,
        };
        $task.fetch(req).then(
          function (resp) {
            callback(null, { status: resp.statusCode, statusCode: resp.statusCode, headers: resp.headers }, resp.body);
          },
          function (reason) {
            callback((reason && reason.error) || "network error", null, null);
          }
        );
      };
    };
    globalThis.$httpClient = {
      get: _method("GET"), post: _method("POST"), put: _method("PUT"),
      delete: _method("DELETE"), head: _method("HEAD"), options: _method("OPTIONS"), patch: _method("PATCH"),
    };
  }
  if (typeof $persistentStore === "undefined") {
    globalThis.$persistentStore = {
      read: function (key) { return $prefs.valueForKey(key); },
      write: function (value, key) { return $prefs.setValueForKey(value, key); },
      remove: function (key) { return $prefs.removeValueForKey(key); },
    };
  }
  if (typeof $notification === "undefined") {
    globalThis.$notification = {
      post: function (title, subtitle, body) { $notify(title || "", subtitle || "", body || ""); },
    };
  }
})();
// ==converter shim end==
`;

/** QX API -> Surge/Loon 原生实现（目标端为 Surge/Loon 时注入） */
const SHIM_FOR_SURGE_LOON = `// ==converter shim: Quantumult X API on Surge/Loon==
(function () {
  if (typeof $httpClient === "undefined") return; // 非 Surge/Loon 环境不注入
  if (typeof $task === "undefined") {
    globalThis.$task = {
      fetch: function (request) {
        if (typeof request === "string") request = { url: request };
        return new Promise(function (resolve, reject) {
          var method = (request.method || "GET").toLowerCase();
          var fn = $httpClient[method] || $httpClient.get;
          fn({ url: request.url, headers: request.headers, body: request.body }, function (error, response, data) {
            if (error) reject({ error: error });
            else resolve({ statusCode: response.status || response.statusCode, headers: response.headers, body: data });
          });
        });
      },
    };
  }
  if (typeof $prefs === "undefined") {
    globalThis.$prefs = {
      valueForKey: function (key) { return $persistentStore.read(key); },
      setValueForKey: function (value, key) { return $persistentStore.write(value, key); },
      removeValueForKey: function (key) { return $persistentStore.write(null, key); },
      removeAllValues: function () { return false; },
    };
  }
  if (typeof $notify === "undefined") {
    globalThis.$notify = function (title, subtitle, message) {
      $notification.post(title || "", subtitle || "", message || "");
    };
  }
})();
// ==converter shim end==
`;

/** 给脚本源码注入目标端兼容层 */
export function wrapScript(source: string, target: Fmt): string {
  const shim = target === "qx" ? SHIM_FOR_QX : SHIM_FOR_SURGE_LOON;
  return `${shim}\n${source}`;
}
