// Player account for the TV, via the existing platform service.
// Why: production runs the central wallet, so the edge only starts a round
// for platform-authenticated sockets (game_adapter.authorize_game_session);
// a guest_id socket can watch but gets platform_auth_required on start.
// Flow is the Mini App's email sign-in (frontend/src/lib/platformSession.svelte.js):
// request-code -> verify-code -> access token -> per-machine ws-ticket.
import { url } from "./config.js";
import { request } from "./bridge.js";

const TOKEN_KEY = "grabium_tv_access_token";
const EMAIL_KEY = "grabium_tv_email";
// Platform refresh credential (30 days), carried by hand because the Vega
// RN fetch has no cookie jar; see FireTv/vega/src/bridge.ts.
const REFRESH_KEY = "grabium_tv_refresh";
const base = (path) => url(`/platform${path}`);

function load(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch (err) {
    console.warn("[platform] storage unavailable", err);
    return "";
  }
}

function save(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch (err) {
    console.warn("[platform] storage unavailable", err);
  }
}

export const account = $state({ token: load(TOKEN_KEY), email: load(EMAIL_KEY) });

export const signedIn = () => Boolean(account.token);
export const hasRefresh = () => Boolean(load(REFRESH_KEY));

// Player-facing text for the platform's sign-in errors
// (platform_service/api.py request_email_code / verify_email_code).
const AUTH_ERRORS = {
  invalid_code: "The code has 6 digits. Check it and try again.",
  bad_otp: "That code isn't right. Check the latest email and try again.",
  otp_expired: "This code has expired. Press Back and ask for a new one.",
  otp_attempts_exhausted: "Too many wrong codes. Press Back and ask for a new one.",
  otp_already_used: "This code was already used. Press Back and ask for a new one.",
  email_not_configured: "We can't send emails right now. Please try again later."
};

function authError(reply, data) {
  const reason = String(data.error || data.message || "");
  if (AUTH_ERRORS[reason]) return new Error(AUTH_ERRORS[reason]);
  if (reply.status === 429) return new Error("Too many tries. Please wait a minute and try again.");
  if (/email/i.test(reason)) return new Error("Enter a valid email address.");
  if (reply.status === 0) return new Error("No connection. Check the network and try again.");
  if (reply.status >= 500) return new Error("Something went wrong on our side. Please try again.");
  return new Error("Sign-in didn't work. Please try again.");
}

function parse(reply) {
  try {
    return JSON.parse(reply.body || "{}");
  } catch {
    return {};
  }
}

async function post(path, body, token = "") {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const reply = await request(base(path), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    refresh: load(REFRESH_KEY) || undefined
  });
  // Every rotation hands out a new refresh value; keep only the latest.
  if (reply.refresh) save(REFRESH_KEY, reply.refresh);
  return { reply, data: parse(reply) };
}

export async function requestCode(email) {
  const { reply, data } = await post("/auth/email/request-code", { email });
  if (!reply.ok) throw authError(reply, data);
}

export async function verifyCode(email, code) {
  const { reply, data } = await post("/auth/email/verify-code", { email, code });
  if (!reply.ok || !data.access_token) throw authError(reply, data);
  account.token = data.access_token;
  account.email = data.user?.email || email;
  save(TOKEN_KEY, account.token);
  save(EMAIL_KEY, account.email);
}

export function signOut() {
  account.token = "";
  account.email = "";
  save(TOKEN_KEY, "");
  save(EMAIL_KEY, "");
  // Revoke the refresh session server-side before forgetting it locally.
  post("/auth/logout", {})
    .catch((err) => console.warn("[platform] logout failed", err))
    .finally(() => save(REFRESH_KEY, ""));
}

let refreshing = null;

/**
 * Trade the 30-day refresh cookie for a new 10-minute access token.
 * The refresh value is stored by this page; see REFRESH_KEY for why.
 * @returns {Promise<boolean>} true when a new access token was stored
 */
export function refreshSession() {
  refreshing ??= (async () => {
    try {
      const { reply, data } = await post("/auth/refresh", {});
      if (!reply.ok || !data.access_token) {
        console.info("[platform] refresh refused", reply.status);
        return false;
      }
      account.token = data.access_token;
      save(TOKEN_KEY, account.token);
      return true;
    } catch (err) {
      console.warn("[platform] refresh failed", err);
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/**
 * One-shot ticket for the machine socket. Returns "" when not signed in.
 * Access tokens last 10 minutes (PLATFORM_ACCESS_TTL_SECONDS), so a 401 is
 * normal: refresh once, and only sign out when the refresh is refused too.
 */
export async function wsTicket(machineId) {
  if (!account.token && !load(REFRESH_KEY)) return "";
  if (!account.token && !(await refreshSession())) return "";
  let { reply, data } = await post("/auth/ws-ticket", { machine_id: machineId }, account.token);
  if (reply.status === 401 && (await refreshSession())) {
    ({ reply, data } = await post("/auth/ws-ticket", { machine_id: machineId }, account.token));
  }
  if (reply.status === 401) {
    signOut();
    return "";
  }
  if (!reply.ok) throw new Error(`ws-ticket HTTP ${reply.status}`);
  return String(data.ticket || data.ws_ticket || "");
}
