// Web side of the Vega WebView bridge (see FireTv/vega/src/bridge.ts).
// Inside the TV app, HTTP is sent by React Native because the edge sends no
// CORS headers and this page lives on file://. In a desktop browser
// (vite dev) there is no bridge and plain fetch is used.
const pending = new Map();
let seq = 0;

window.__grabiumBridge = {
  resolve(reply) {
    const entry = pending.get(reply.id);
    if (!entry) return;
    pending.delete(reply.id);
    clearTimeout(entry.timer);
    entry.resolve(reply);
  }
};

const hasBridge = () => Boolean(window.ReactNativeWebView?.postMessage);

// Vega injects window.ReactNativeWebView around page load, not before our
// first line runs. A request made at startup (the launch-time token refresh)
// would otherwise fall back to plain fetch and die on CORS without a sound.
const inTvApp = /Kepler/.test(navigator.userAgent);
async function bridgeReady(timeoutMs = 3000) {
  const started = Date.now();
  while (!hasBridge() && Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return hasBridge();
}

function viaBridge(absoluteUrl, { method = "GET", headers = {}, body, signal, refresh } = {}) {
  return new Promise((resolve, reject) => {
    const id = `r${++seq}`;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("bridge timeout"));
    }, 12000);
    pending.set(id, { resolve, timer });
    signal?.addEventListener("abort", () => {
      pending.delete(id);
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
    window.ReactNativeWebView.postMessage(
      JSON.stringify({ type: "fetch", id, url: absoluteUrl, method, headers, body, refresh })
    );
  });
}

/**
 * Minimal fetch that works both inside the TV WebView and in a browser.
 * @returns {Promise<{ok: boolean, status: number, body: string, refresh?: string}>}
 */
export async function request(absoluteUrl, options = {}) {
  if (hasBridge() || (inTvApp && (await bridgeReady()))) return viaBridge(absoluteUrl, options);
  const { method = "GET", headers = {}, body, signal } = options;
  const response = await fetch(absoluteUrl, { method, headers, body, signal, cache: "no-store" });
  return { ok: response.ok, status: response.status, body: await response.text() };
}

/** Close the TV app (Vega only; no-op in a desktop browser). */
export function exitApp() {
  if (hasBridge()) window.ReactNativeWebView.postMessage(JSON.stringify({ type: "exit" }));
}
