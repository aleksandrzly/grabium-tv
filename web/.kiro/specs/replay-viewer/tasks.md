# Replay Viewer – Tasks

Each task is self-contained and builds on the previous one. Implement them in
order; stop and verify `npm run lint` + `npm run build` after tasks 3 and 5.

---

## Task 1 — Extend WinsTicker to accept focus props, show play badges, and centre via transform

**File:** `src/components/WinsTicker.svelte`

- Add props: `focused = false`, `focusIndex = 0` (Svelte 5 runes).
- **Play badge (both copies):** For every win with `w.has_replay`, add
  `<span class="play-badge">▶</span>` inside the `<li>`, in **both** loop
  iterations (`copy === 0` and `copy === 1`), so the seamless visual loop is
  consistent.
- **Focus ring (copy 0 only):** Within the `copy === 0` inner loop, maintain a
  counter `ri` that increments only for replayable wins. When `ri === focusIndex`
  add class `row-focused` to that `<li>`. Bind `<li bind:this={liRefs[i]}>` (where
  `i` is the overall win index within copy 0) so element positions can be measured.
- **Scroll pause:** When `focused` is true, add class `paused` to `<ul>`:
  `.paused { animation-play-state: paused; }`.
- **Transform centring:** Add a `$state` variable `focusOffset = 0`.
  A `$effect` that runs when `focused` or `focusIndex` changes:
  - If `!focused`: set `focusOffset = 0` (clears inline transform; animation restarts).
  - If `focused`: find the `<li>` for the focused replayable win using `liRefs`.
    Compute:
    ```js
    const vw = track.parentElement.offsetWidth;
    const li = liRefs[targetWinIndex]; // index in wins[] for this replayable win
    focusOffset = -(li.offsetLeft - vw / 2 + li.offsetWidth / 2);
    ```
    Apply as `style="... transform: translateX({focusOffset}px)"` (combined
    with the existing `animation-duration` inline style).
  - CSS: add `transition: transform 250ms ease-out` on `ul` (only fires when
    `paused` class is present, since the animation has `animation-play-state:
    paused` which stops the `@keyframes` from running, leaving the transition free
    to work).
- CSS for new classes: `.play-badge` (small amber `▶`), `.row-focused::after`
  focus ring using `var(--focus)` box-shadow.

**Acceptance:** Ticker scrolls normally with default props. A replayable item in
both copies shows the badge. Focusing the row pauses scroll, smoothly centres the
focused item, and shows the ring. Unfocusing clears offset and scroll restarts.

---

## Task 2 — Create ReplayPlayer.svelte

**File:** `src/components/ReplayPlayer.svelte` (new)

- Props: `win` (win object), `onclose` (callback).
- Internal state: `ended`, `failed`, `videoEl` (bind:this).
- Render a `.scrim` backdrop and a `.card` centred child.
  - If `!failed`: render `<video>` with `autoplay muted playsinline`,
    `src={url(...)}`, `onended`, `onerror` handlers.
  - If `failed`: render `<p class="status">Replay not available</p>`.
  - Caption: `🏆 {win.name} · {win.machine} · {timeAgo(win.ts)}`.
  - Hint: conditional on `failed` / `ended` / playing; key labels use
    `__GRABIUM_WEB__` to switch between "OK"/"Back" (Fire TV) and "Enter"/"Esc"
    (desktop), matching the Lobby footer pattern.
- `listenRemote` with `{ capture: true }`:
  - `ok` + `first` → restart: `videoEl.load(); videoEl.play().catch(() => {})`.
  - `back` + `first` → `onclose()`.
  - All keys return `true` (consume).
- Animations: `fade` on `.scrim`, `pop` (opacity + scale) on `.card`.
  Respect `prefers-reduced-motion`.
- Imports: `url` from `../lib/config.js`, `timeAgo` from `../lib/format.js`,
  `listenRemote` from `../lib/remote.js`.

**Acceptance:** Component renders. Video autoplays. OK restarts. Back calls
`onclose`. On error shows "Replay not available". Ends shows "Watch again".

---

## Task 3 — Wire row focus into Lobby.svelte

**File:** `src/screens/Lobby.svelte`

- Add state: `rowFocused = false`, `rowFocusIndex = 0`, `playerWin = null`.
- Add derived: `replayableWins = $derived(wins.filter(w => w.has_replay))`.
- Guard: in a `$effect` watching `replayableWins`, if `replayableWins.length === 0`,
  set `rowFocused = false`. Clamp `rowFocusIndex` to
  `Math.min(rowFocusIndex, Math.max(0, replayableWins.length - 1))`.
- Extend the existing `listenRemote` `$effect` — add these cases **at the top**,
  before the existing card handlers:
  - `back && first && rowFocused` → `rowFocused = false; return` (must return
    before the existing `back` handler that calls `exitApp()`).
  - `down` → if `!rowFocused && replayableWins.length > 0`: `rowFocused = true; return`.
  - `up`   → if `rowFocused`: `rowFocused = false; return`.
  - `left` → if `rowFocused`: `rowFocusIndex = Math.max(0, rowFocusIndex - 1); return`.
  - `right`→ if `rowFocused`: `rowFocusIndex = Math.min(replayableWins.length - 1, rowFocusIndex + 1); return`.
  - `ok && first && rowFocused` → `playerWin = replayableWins[rowFocusIndex]; return`.
- **Card focus class:** Change the card's `class:focused` condition from
  `m.id === focusId` to `m.id === focusId && !rowFocused`.
- Pass new props to `<WinsTicker>`:
  `focused={rowFocused}` and `focusIndex={rowFocusIndex}`.
- Import and render `<ReplayPlayer>` conditionally at the bottom of `<main>`:
  ```svelte
  {#if playerWin}
    <ReplayPlayer win={playerWin} onclose={() => { playerWin = null; }} />
  {/if}
  ```
- Import `ReplayPlayer` from `../components/ReplayPlayer.svelte`.

**Checkpoint:** `npm run lint` and `npm run build` pass.

**Acceptance:** Down from cards enters row. Left/Right cycles replayable wins (no
card focus ring visible). Up exits row. Back while row focused returns to cards
without exiting the app. OK opens the player. Back from player returns to the row.
Lobby with no-replay wins is unchanged.

---

## Task 4 — Verify keyboard input on desktop

No code changes — this is a manual test pass:

1. `npm run dev`, open in desktop browser.
2. Arrow-key navigation: Down enters row, Left/Right moves between replayable
   wins, Up exits. OK opens player, Back closes it.
3. Confirm the ticker pauses and the focused win is visible while row is active.
4. Confirm the player animates in; OK restarts clip; end of clip shows "Watch again".
5. Navigate to a non-replayable-wins state (temporarily set all `has_replay`
   to false in a test): Down from cards does nothing; ticker scrolls as before.

---

## Task 5 — Final lint + build pass

Run `npm run lint` and `npm run build`.
Fix any errors surfaced. Do not suppress warnings with disable comments.

**Acceptance:** Both commands exit 0 with no new errors or warnings compared to
the baseline (before this feature).
