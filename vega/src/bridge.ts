// Native side of the WebView bridge.
// Why: the web bundle runs from file://, and the edge's /api and /platform
// routes send no CORS headers, so the WebView blocks fetch(). React Native's
// fetch has no CORS, so requests are relayed through here instead of
// changing the backend. The allowlist keeps this from being an open proxy:
// only our own origin, only the routes the TV client uses.
export const ORIGIN = 'https://play.freeskillclaw.cc';
// AI coach (FireTv/ai-coach), behind its own tunnel hostname.
export const COACH_ORIGIN = 'https://coach.freeskillclaw.cc';
const TIMEOUT_MS = 10000;

const ALLOWED: Array<{method: 'GET' | 'POST'; prefix: string}> = [
  {method: 'GET', prefix: `${ORIGIN}/api/`},
  {method: 'POST', prefix: `${ORIGIN}/platform/auth/`},
  {method: 'GET', prefix: `${ORIGIN}/platform/users/me`},
  {method: 'POST', prefix: `${COACH_ORIGIN}/coach/`},
];
const FORWARDED_HEADERS = ['authorization', 'content-type'];

type FetchRequest = {
  type: 'fetch';
  id: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  // Refresh credential for /platform/auth/{refresh,logout}; see below.
  refresh?: string;
};
export type BridgeReply = {
  id: string;
  ok: boolean;
  status: number;
  body: string;
  refresh?: string;
};

// Vega's RN fetch keeps no cookie jar (checked 2026-09-23: /auth/refresh never
// rotated a session), so the platform's httpOnly refresh cookie is carried by
// hand: read from Set-Cookie on auth responses, handed to the web app to
// persist, and sent back as a Cookie header on refresh/logout. The web app is
// our own bundled file with no third-party scripts, which is what makes
// exposing it to page JS acceptable here.
const REFRESH_COOKIE = 'grabium_refresh';
const COOKIE_ROUTES = ['/platform/auth/refresh', '/platform/auth/logout'];

function refreshFromSetCookie(header: string | null): string {
  const match = (header || '').match(new RegExp(`${REFRESH_COOKIE}=([^;,\\s]+)`));
  return match ? match[1] : '';
}

function parse(raw: string): FetchRequest | null {
  try {
    const msg = JSON.parse(raw);
    if (msg?.type === 'fetch' && typeof msg.id === 'string' && typeof msg.url === 'string') {
      return msg;
    }
  } catch (err) {
    console.warn(`[bridge] bad message: ${(err as Error).message}`);
  }
  return null;
}

function allowed(method: string, url: string): boolean {
  return ALLOWED.some(rule => rule.method === method && url.startsWith(rule.prefix));
}

function pickHeaders(
  headers: Record<string, string> | undefined,
  cookie: string,
): Record<string, string> {
  const out: Record<string, string> = {'Cache-Control': 'no-store'};
  if (cookie) {
    out.Cookie = cookie;
  }
  for (const [name, value] of Object.entries(headers || {})) {
    if (FORWARDED_HEADERS.includes(name.toLowerCase()) && typeof value === 'string') {
      out[name] = value;
    }
  }
  return out;
}

export function isExitMessage(raw: string): boolean {
  try {
    return JSON.parse(raw)?.type === 'exit';
  } catch {
    return false;
  }
}

export async function handleBridgeMessage(raw: string): Promise<BridgeReply | null> {
  const req = parse(raw);
  if (!req) {
    return null;
  }
  const method = (req.method || 'GET').toUpperCase();
  if (!allowed(method, req.url)) {
    console.warn(`[bridge] refused ${method} ${req.url}`);
    return {id: req.id, ok: false, status: 0, body: 'refused'};
  }
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(req.url, {
      method,
      headers: pickHeaders(
        req.headers,
        req.refresh && COOKIE_ROUTES.some(route => req.url === `${ORIGIN}${route}`)
          ? `${REFRESH_COOKIE}=${req.refresh}`
          : '',
      ),
      body: method === 'POST' ? req.body || '' : undefined,
      signal: abort.signal,
    });
    const reply: BridgeReply = {id: req.id, ok: res.ok, status: res.status, body: await res.text()};
    if (req.url.startsWith(`${ORIGIN}/platform/auth/`)) {
      const refresh = refreshFromSetCookie(res.headers.get('set-cookie'));
      if (refresh) {
        reply.refresh = refresh;
      }
    }
    return reply;
  } catch (err) {
    // No URL here: auth requests carry an email and a code in the body only,
    // but keep logs free of anything user-shaped by habit.
    console.warn(`[bridge] ${method} failed: ${(err as Error).message}`);
    return {id: req.id, ok: false, status: 0, body: String((err as Error).message)};
  } finally {
    clearTimeout(timer);
  }
}

export function replyScript(reply: BridgeReply): string {
  // JSON.stringify output is a valid JS literal; the trailing `true` keeps
  // injectJavaScript from complaining about a non-serialisable result.
  return `window.__grabiumBridge && window.__grabiumBridge.resolve(${JSON.stringify(reply)}); true;`;
}
