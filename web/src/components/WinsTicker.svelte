<script>
  import { timeAgo } from "../lib/format.js";
  import { economy } from "../lib/economy.svelte.js";

  let { wins, focused = false, focusIndex = 0 } = $props();

  // Constant reading speed regardless of how many wins there are.
  const PX_PER_SECOND = 70;
  let track = $state(null);
  let duration = $state(40);
  // Per-item refs for copy-0 items, keyed by win index in the wins array.
  let liRefs = $state([]);
  // translateX offset applied when focused; 0 = no override.
  let focusOffset = $state(0);

  // Replayable wins and their indices in the wins array.
  const replayableIndices = $derived(
    wins.reduce((acc, w, i) => (w.has_replay ? [...acc, i] : acc), [])
  );

  $effect(() => {
    void wins.length;
    if (!track) return;
    // The track holds the list twice; one copy's width is one loop.
    duration = Math.max(20, track.scrollWidth / 2 / PX_PER_SECOND);
  });

  $effect(() => {
    if (!focused) {
      focusOffset = 0;
      return;
    }
    // Find which wins[] index corresponds to focusIndex among replayable wins.
    const winIdx = replayableIndices[focusIndex];
    if (winIdx == null || !track) return;
    const li = liRefs[winIdx];
    if (!li) return;
    const vw = track.parentElement.offsetWidth;
    focusOffset = -(li.offsetLeft - vw / 2 + li.offsetWidth / 2);
  });

  // Combined inline style for the <ul>: animation-duration always set;
  // when focused, override transform and pause the animation.
  const trackStyle = $derived(
    focused
      ? `animation-duration: ${duration}s; transform: translateX(${focusOffset}px);`
      : `animation-duration: ${duration}s;`
  );
</script>

<section class="ticker" aria-label="Recent wins">
  <h3>
    <span class="dot"></span>{economy.prizesShip ? "Recent wins" : "Recent grabs"}
    {#if wins.some((w) => w.has_replay)}
      <span class="watch-hint"><kbd>▼</kbd> to watch replays</span>
    {/if}
  </h3>
  <div class="viewport">
    <ul bind:this={track} class:paused={focused} style={trackStyle}>
      {#each wins as w, i (`0-${w.win_id}`)}
        <li
          aria-hidden={false}
          bind:this={liRefs[i]}
          class:row-focused={focused && replayableIndices[focusIndex] === i}
        >
          <span class="trophy">🏆</span>
          {#if economy.prizesShip}
            <strong>{w.name}</strong> won on {w.machine}
          {:else}
            <strong>{w.name}</strong> landed a grab on {w.machine}
          {/if}
          <span class="when">{timeAgo(w.ts)}</span>
          {#if w.has_replay}<span class="play-badge">▶ Watch</span>{/if}
        </li>
      {/each}
      {#each wins as w (`1-${w.win_id}`)}
        <li aria-hidden={true}>
          <span class="trophy">🏆</span>
          {#if economy.prizesShip}
            <strong>{w.name}</strong> won on {w.machine}
          {:else}
            <strong>{w.name}</strong> landed a grab on {w.machine}
          {/if}
          <span class="when">{timeAgo(w.ts)}</span>
          {#if w.has_replay}<span class="play-badge">▶ Watch</span>{/if}
        </li>
      {/each}
    </ul>
  </div>
</section>

<style>
  .ticker { min-width: 0; }
  h3 {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0 0 12px;
    font-size: 26px;
    font-weight: 600;
    color: var(--muted);
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--accent);
    animation: pulse 1.6s ease-in-out infinite;
  }
  .viewport {
    overflow: hidden;
    /* Fade both edges so items glide in and out instead of being cut. */
    mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent);
  }
  ul {
    display: flex;
    width: max-content;
    margin: 0;
    padding: 0;
    list-style: none;
    animation: scroll linear infinite;
  }
  ul.paused {
    animation: none;
    /* Now that the animation is gone the inline translateX takes effect. */
    transition: transform 250ms ease-out;
  }
  li {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    margin-right: 28px;
    padding: 10px 22px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.05);
    box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.16);
    white-space: nowrap;
  }
  /* Focus ring: same pseudo-element pattern as machine cards. */
  li::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: var(--focus);
    opacity: 0;
    transition: opacity 160ms ease-out;
    pointer-events: none;
  }
  li.row-focused::after { opacity: 1; }
  .trophy { font-size: 24px; }
  .when { color: var(--muted); font-size: 24px; }
  .play-badge {
    display: inline-flex;
    align-items: center;
    padding: 4px 12px;
    border-radius: 999px;
    background: var(--play);
    color: #1a1000;
    font-size: 20px;
    font-weight: 800;
    line-height: 1;
  }
  .watch-hint {
    margin-left: 18px;
    font-size: 20px;
    letter-spacing: 0;
    text-transform: none;
    color: var(--muted);
  }
  .watch-hint kbd {
    padding: 1px 8px;
    border-radius: 6px;
    background: var(--surface-2);
    color: var(--text);
    font: inherit;
  }
  @keyframes scroll {
    from { transform: translate3d(0, 0, 0); }
    to { transform: translate3d(-50%, 0, 0); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
  }
  @media (prefers-reduced-motion: reduce) {
    ul, .dot { animation: none; }
    ul.paused { transition: none; }
  }
</style>
