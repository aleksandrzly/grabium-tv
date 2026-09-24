# Replay Viewer – Requirements

## Background
Grabium TV (Svelte 5 runes, Vite, single-file build) runs on Fire TV (Vega OS WebView)
with a D-pad remote and in a desktop browser with a keyboard.
`src/components/WinsTicker.svelte` shows a marquee of recent wins in the lobby.
Each win object from `/api/recent-wins` carries `win_id`, `name`, `machine`,
`machine_id`, `ts`, and `has_replay`.
Replay clips live at `/api/wins/${win_id}/replay?machine_id=${machine_id}` (H.264 MP4,
up to 640 × 480, ~30 s). A 404 returns `{"code":"replay_not_found"}`.

---

## REQ-1 — Focusable wins row

**REQ-1.1** In the lobby, pressing **Down** from the machine-cards section moves
D-pad focus to the Recent Grabs row. Pressing **Up** from the row returns focus
to the machine cards (to the card that was last focused).

**REQ-1.2** Only wins with `has_replay === true` are focusable. If no win has a
replay, Down from the cards has no effect (the ticker scrolls as today).

**REQ-1.3** Left / Right navigates between focusable wins in the row.
Non-replayable wins are skipped.

**REQ-1.4** Each win with `has_replay` displays a small ▶ play badge in **both**
copies of the duplicated list (so the seamless loop remains visually consistent).
Only `copy === 0` items receive the focus ring and are wired to the focusable-win
index.

**REQ-1.5** While the row has focus, the ticker's CSS scroll animation is paused
and the focused win is centred in the viewport using a `transform: translateX(...)`
on the list element. Do NOT use `scrollIntoView` (the viewport is
`overflow: hidden`; the list is moved by CSS transform). Animate the transition
between focused positions with `transition: transform`. When the row loses focus
the scroll animation may restart from the beginning.

**REQ-1.7** While `rowFocused` is true, no machine card may appear focused: the
`focused` class on each card must be conditioned on `!rowFocused`.

**REQ-1.8** Pressing **Back** while the row has focus sets `rowFocused = false`
and returns D-pad focus to the machine cards. It must NOT call `exitApp()`. Back
from the machine cards (row not focused) keeps the existing behaviour.

---

## REQ-2 — Replay player overlay

**REQ-2.1** Pressing **OK** on a focused win opens the replay player as a centred
overlay (approximately 800 × 600 logical px; not full-screen).

**REQ-2.2** The overlay contains:
- A `<video>` element with `autoplay`, `muted`, `playsinline`. No native controls.
  Source: `url(`/api/wins/${win_id}/replay?machine_id=${machine_id}`)`.
- A caption: "🏆 {name} · {machine} · {timeAgo(ts)}".
- A hint line whose key labels match the build target:
  - Fire TV / default: "OK replay · Back close"
  - Desktop (`__GRABIUM_WEB__`): "Enter replay · Esc close"
  (Mirror the same `__GRABIUM_WEB__` guard used in the Lobby footer.)

**REQ-2.3** The overlay uses `listenRemote` with `{ capture: true }` so it
consumes all keys while open, preventing the lobby and the remote-hold guard from
seeing them.

**REQ-2.4** **OK** while the video is playing or ended restarts the clip
(calls `video.load()` then `video.play()`).

**REQ-2.5** When the clip plays to completion, show a "Watch again" hint in place
of "OK replay · Back close".

**REQ-2.6** If the video element fires `error`, or if the server returns a 404
before the video loads, show the message "Replay not available" and hide the
video element.

**REQ-2.7** **Back** closes the overlay and returns D-pad focus to the same win
in the row.

---

## REQ-3 — Animations

**REQ-3.1** The overlay entrance animates with `opacity` 0 → 1 and
`scale` 0.92 → 1 (transform). Duration ≈ 220 ms, ease-out.

**REQ-3.2** When `prefers-reduced-motion: reduce` is active, skip the animation
(instant appear / disappear).

**REQ-3.3** Only `transform` and `opacity` are animated (no width/height/top/left
transitions).

---

## REQ-4 — Lobby continuity

**REQ-4.1** When no win has `has_replay`, the lobby behaves exactly as before this
feature. No UI change is visible.

**REQ-4.2** The WinsTicker component must be modified minimally: expose only the
props and events the feature requires; do not rewrite unrelated logic.

---

## REQ-5 — Wording

**REQ-5.1** Use arcade wording throughout: "grab", "Recent Grabs", never
"win" in user-facing copy unless `economy.prizesShip` is true (mirror the
existing WinsTicker logic).

---

## REQ-6 — Quality

**REQ-6.1** `npm run lint` passes with zero new errors or warnings.

**REQ-6.2** `npm run build` completes successfully.

**REQ-6.3** No new npm dependencies.

**REQ-6.4** All new code uses Svelte 5 runes (`$state`, `$derived`, `$effect`,
`$props`). No Svelte 4 `export let` / `on:event` / stores.
