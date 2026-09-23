// The signed-in player's credits and today's free Classic allowance, from
// the edge's GET /api/users/me/credits (the endpoint the Mini App uses).
import { url } from "./config.js";
import { request } from "./bridge.js";
import { account, refreshSession } from "./platform.svelte.js";

export const wallet = $state({
  known: false,
  credits: 0,
  // null when the operator has no daily free Classic limit.
  freeLeft: null,
  freeLimit: 0
});

async function fetchOnce() {
  return request(url("/api/users/me/credits"), {
    headers: { Authorization: `Bearer ${account.token}` }
  });
}

export async function refreshWallet() {
  if (!account.token) {
    wallet.known = false;
    return;
  }
  try {
    let reply = await fetchOnce();
    // Access tokens last 10 minutes; refresh once and retry.
    if (reply.status === 401 && (await refreshSession())) reply = await fetchOnce();
    if (!reply.ok) return;
    const data = JSON.parse(reply.body);
    wallet.credits = Math.max(0, Number(data.credits) || 0);
    const free = data.free_classic;
    if (free?.enabled && !free.unlimited && free.limit > 0) {
      wallet.freeLeft = Math.max(0, Number(free.left) || 0);
      wallet.freeLimit = Number(free.limit);
    } else {
      wallet.freeLeft = null;
      wallet.freeLimit = 0;
    }
    wallet.known = true;
  } catch (err) {
    console.info("[wallet] unavailable", err);
  }
}
