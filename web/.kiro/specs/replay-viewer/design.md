# Replay Viewer – Design

## Files changed

| File | Change |
|------|--------|
| `src/components/WinsTicker.svelte` | Add `focused` and `focusIndex` props; expose `onwinselect` callback; pause scroll; show play badge; scroll active win into view |
| `src/components/ReplayPlayer.svelte` | **New** – the centred overlay with video, caption, hints, error/ended states |
| `src/screens/Lobby.svelte` | Add row-focus state; wire Down/Up/Left/Right/OK remote actions; mount `<ReplayPlayer>` |

No new dependencies, no new files outside `src/`.

---

## State model (Lobby.svelte additions)

```
rowFocused: boolean           // true = ticker row has D-pad focus
rowFocusIndex: number         // index within replayable-wins array
playerWin: WinObject | null   // non-null = overlay is open
```

The existing `focusId` (machine card focus) is untouched.

`replayableWins` is a `$derived` that filters `wins` by `has_replay`.
`rowFocused` is set to `false` if `replayableWins` becomes empty on a poll update
(graceful degradation while the row is focused).

---

## Remote-key routing

### Normal lobby listener (existing `$effect` in Lobby.svelte)

Extended to handle new cases **before** the existing ones:

```
back  → if rowFocused && first: rowFocused = false; return  ← NEW (must not fall through to exitApp)
down  → if !rowFocused && replayableWins.length > 0: rowFocused = true; return
up    → if rowFocused: rowFocused = false; return
left  → if rowFocused: rowFocusIndex = max(0, rowFocusIndex - 1); return
right → if rowFocused: rowFocusIndex = min(replayableWins.length-1, rowFocusIndex + 1); return
ok    → if rowFocused && first: playerWin = replayableWins[rowFocusIndex]; return
```

When `rowFocused` is false, the existing `back`/`left`/`right`/`ok` card logic
runs unchanged (including the `exitApp()` call on back).

### Card focus class

The `focused` class on each machine card is conditioned on `m.id === focusId && !rowFocused`,
so cards never appear highlighted while the ticker row has focus.

### Player overlay listener (inside ReplayPlayer.svelte)

Uses `listenRemote(..., { capture: true })` — consumes every key:

```
ok   && first → restart clip (video.load(); video.play())
back && first → close overlay (call onclose prop)
```

All other keys: consumed silently (return true) so the lobby never sees them.

---

## WinsTicker.svelte additions

New props accepted:

```svelte
let {
  wins,
  focused = false,          // row has D-pad focus → pause scroll, apply transform
  focusIndex = 0,           // which replayable win is highlighted (index into replayable subset)
} = $props();
```

### Play badge

Rendered inside every `<li>` whose `w.has_replay` is true — in **both** `copy`
iterations — so the seamless loop stays visually consistent. The badge is a small
amber `<span class="play-badge">▶</span>`.

### Focus ring

Only the `copy === 0` list items participate in focus. Within copy 0, a
per-iteration index `ri` counts replayable wins; the item where `ri === focusIndex`
gets class `row-focused` (same `::after` pseudo focus-ring pattern as machine
cards, using `var(--focus)`).

### Scroll pause and transform centering

The `<ul>` element is bound: `bind:this={track}`.

When `focused` is false the `<ul>` gets no inline style override and the
`scroll` CSS animation runs normally (including its `animation-duration` set from
the `$effect` that measures `scrollWidth`).

When `focused` is true:
- Add class `paused` → `animation-play-state: paused`.
- Compute `focusOffset`: iterate `copy === 0` items using `bind:this` on each `<li>`
  (store refs in a `liRefs` array sized to `wins.length`). Find the `<li>` for the
  focused replayable win. `offsetLeft` of that element relative to the track gives
  its position. Centre it:

  ```
  const viewportW = track.parentElement.offsetWidth;
  const itemLeft  = liRefs[targetIndex].offsetLeft;
  const itemW     = liRefs[targetIndex].offsetWidth;
  focusOffset     = -(itemLeft - viewportW / 2 + itemW / 2);
  ```

  Apply as `transform: translateX({focusOffset}px)` on the `<ul>`. Use
  `transition: transform 250ms ease-out` so movement between items is smooth.
  The `paused` class sets `animation-play-state: paused` — this does **not**
  conflict with an inline `transform` override.

- A `$effect` recalculates `focusOffset` whenever `focused` or `focusIndex`
  changes and the `liRefs` array is populated.

When `focused` returns to false, remove the inline transform so the `scroll`
animation restarts from `translate3d(0,0,0)` (this is acceptable per the updated
requirements).

---

## ReplayPlayer.svelte

```
props: { win, onclose }

internal state:
  ended: boolean   // clip reached end
  failed: boolean  // video error or 404
  videoEl: HTMLVideoElement  (bind:this)
```

### Template outline

```html
<div class="scrim" role="dialog" aria-modal="true" aria-label="Replay">
  <div class="card">
    {#if failed}
      <p class="status">Replay not available</p>
    {:else}
      <video bind:this={videoEl}
             src={url(`/api/wins/${win.win_id}/replay?machine_id=${win.machine_id}`)}
             autoplay muted playsinline
             onended={() => ended = true}
             onerror={() => failed = true} />
    {/if}
    <p class="caption">🏆 {win.name} · {win.machine} · {timeAgo(win.ts)}</p>
    <p class="hint">
      {#if failed}
        {#if __GRABIUM_WEB__}<kbd>Esc</kbd> close{:else}<kbd>Back</kbd> close{/if}
      {:else if ended}
        {#if __GRABIUM_WEB__}<kbd>Enter</kbd> watch again &nbsp; <kbd>Esc</kbd> close{:else}<kbd>OK</kbd> watch again &nbsp; <kbd>Back</kbd> close{/if}
      {:else}
        {#if __GRABIUM_WEB__}<kbd>Enter</kbd> replay &nbsp; <kbd>Esc</kbd> close{:else}<kbd>OK</kbd> replay &nbsp; <kbd>Back</kbd> close{/if}
      {/if}
    </p>
  </div>
</div>
```

### Sizing

`.card` is `800px × 600px`, centered via flexbox on `.scrim`
(which is `position: fixed; inset: 0; z-index: 20`).
Video is `width: 100%` inside the card; card uses `display: grid` with rows:
`1fr auto auto` (video / caption / hint).

### Overlay animation

```css
.scrim { animation: fade 220ms ease-out both; }
.card  { animation: pop  220ms ease-out both; }

@keyframes fade { from { opacity: 0; } }
@keyframes pop  { from { opacity: 0; transform: scale(0.92); } }

@media (prefers-reduced-motion: reduce) {
  .scrim, .card { animation: none; }
}
```

---

## Caption helper

`timeAgo()` already exists in `src/lib/format.js` and is already imported in
WinsTicker — import it in ReplayPlayer too. `url()` from `src/lib/config.js`.
`economy` from `src/lib/economy.svelte.js` for the "grab" vs "win" label in the
caption (same guard as WinsTicker).

---

## Lobby layout impact

`<ReplayPlayer>` is conditionally rendered:

```svelte
{#if playerWin}
  <ReplayPlayer win={playerWin} onclose={() => { playerWin = null; }} />
{/if}
```

It sits at the bottom of `<main>` so it layers over everything via `z-index: 20`
on its `.scrim`. No grid changes needed.

---

## Edge cases

| Scenario | Behaviour |
|----------|-----------|
| Poll update removes the focused win | `rowFocusIndex` clamped to `replayableWins.length - 1`; if empty, `rowFocused = false` |
| Poll update while player is open | `playerWin` stays until the user closes; the stale win object is fine (video URL doesn't change) |
| Clip 404s before `loadedmetadata` | `onerror` fires → `failed = true` |
| User presses OK before clip loads | `video.load(); video.play()` — harmless; browser re-fetches |
| `replayableWins` empty on Down | `rowFocused` stays false; ticker never pauses |
