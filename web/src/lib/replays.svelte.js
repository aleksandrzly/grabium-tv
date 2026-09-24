// /api/recent-wins sets has_replay from the database row, not from the file,
// so a clip deleted on the server still looks watchable. Each clip is probed
// with a detached <video preload="metadata"> before its Watch badge shows: a
// media load needs no CORS and no bridge, and metadata is a few KB.
import { url } from "./config.js";

export const replayUrl = (win) =>
  url(`/api/wins/${encodeURIComponent(win.win_id)}/replay?machine_id=${encodeURIComponent(win.machine_id)}`);

// A clip that loaded is checked again after this long, so a deletion during
// a long session also hides the badge.
const RECHECK_MS = 5 * 60 * 1000;
const PROBE_TIMEOUT_MS = 15000;

/** win_id -> {ok, at}; replaced (not mutated) so $derived readers update. */
let checked = $state({});
// Bookkeeping only, not rendered, so a plain object rather than reactive state.
const inFlight = {};

function record(id, ok) {
  checked = { ...checked, [id]: { ok, at: Date.now() } };
}

function probe(win) {
  const id = win.win_id;
  inFlight[id] = true;
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "metadata";
  let timer = 0;
  const done = (ok) => {
    clearTimeout(timer);
    video.onloadedmetadata = video.onerror = null;
    // Dropping the source stops any further download.
    video.removeAttribute("src");
    video.load();
    delete inFlight[id];
    record(id, ok);
  };
  video.onloadedmetadata = () => done(true);
  video.onerror = () => done(false);
  // A stalled request counts as missing; the next refresh tries again.
  timer = setTimeout(() => done(false), PROBE_TIMEOUT_MS);
  video.src = replayUrl(win);
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
