<script>
  import { timeAgo } from "../lib/format.js";
  import { economy } from "../lib/economy.svelte.js";

  let { wins } = $props();

  // Constant reading speed regardless of how many wins there are.
  const PX_PER_SECOND = 70;
  let track = $state(null);
  let duration = $state(40);

  $effect(() => {
    void wins.length;
    if (!track) return;
    // The track holds the list twice; one copy's width is one loop.
    duration = Math.max(20, track.scrollWidth / 2 / PX_PER_SECOND);
  });
</script>

<section class="ticker" aria-label="Recent wins">
  <h3><span class="dot"></span>{economy.prizesShip ? "Recent wins" : "Recent grabs"}</h3>
  <div class="viewport">
    <ul bind:this={track} style="animation-duration: {duration}s">
      {#each [0, 1] as copy (copy)}
        {#each wins as w (`${copy}-${w.win_id}`)}
          <li aria-hidden={copy === 1}>
            <span class="trophy">🏆</span>
            {#if economy.prizesShip}
              <strong>{w.name}</strong> won on {w.machine}
            {:else}
              <strong>{w.name}</strong> landed a grab on {w.machine}
            {/if}
            <span class="when">{timeAgo(w.ts)}</span>
          </li>
        {/each}
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
  li {
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
  .trophy { font-size: 24px; }
  .when { color: var(--muted); font-size: 24px; }
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
  }
</style>
