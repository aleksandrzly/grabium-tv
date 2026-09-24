// /api/recent-wins sets has_replay from the database row, not from the file,
// so a clip deleted on the server still looks watchable. Each clip is checked
// with a HEAD request before its Watch badge shows. Not with a probe <video>:
// on Vega each media element takes one of the few platform video decoders,
// and with ten probes the replay player itself stayed black.
import { url } from "./config.js";
import { request } from "./bridge.js";

export const replayUrl = (win) =>
  url(`/api/wins/${encodeURIComponent(win.win_id)}/replay?machine_id=${encodeURIComponent(win.machine_id)}`);

// A clip that loaded is checked again after this long, so a deletion during
// a long session also hides the badge.
const RECHECK_MS = 5 * 60 * 1000;

/** win_id -> {ok, at}; replaced (not mutated) so $derived readers update. */
let checked = $state({});
// Bookkeeping only, not rendered, so a plain object rather than reactive state.
const inFlight = {};

function record(id, ok) {
  checked = { ...checked, [id]: { ok, at: Date.now() } };
}

async function probe(win) {
  const id = win.win_id;
  inFlight[id] = true;
  let ok = false;
  try {
    const reply = await request(replayUrl(win), { method: "HEAD" });
    ok = reply.ok;
  } catch (err) {
    // A failed check counts as missing; the next lobby refresh tries again.
    console.warn("[replays] check failed", err);
  } finally {
    delete inFlight[id];
  }
  record(id, ok);
}

/** Probe every claimed replay that is unknown, failed or stale. */
export function checkReplays(wins) {
  const now = Date.now();
  for (const win of wins) {
    if (!win.has_replay || !win.win_id || inFlight[win.win_id]) continue;
    const seen = checked[win.win_id];
    if (seen?.ok && now - seen.at < RECHECK_MS) continue;
    probe(win);
  }
}

/** True only for a clip the server actually served. */
export const replayReady = (win) => Boolean(win.has_replay && checked[win.win_id]?.ok);

/** The player hit an error: hide the badge right away. */
export const markReplayMissing = (win) => record(win.win_id, false);
