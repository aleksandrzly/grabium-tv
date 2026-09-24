<script>
  import { markReplayMissing, replayUrl } from "../lib/replays.svelte.js";
  import { timeAgo } from "../lib/format.js";
  import { listenRemote } from "../lib/remote.js";

  let { win, onclose } = $props();

  let ended = $state(false);
  let failed = $state(false);
  /** @type {HTMLVideoElement | null} */
  let videoEl = $state(null);

  function restart() {
    if (!videoEl) return;
    ended = false;
    videoEl.load();
    videoEl.play().catch(() => {});
  }

  $effect(() =>
    listenRemote(
      (action, { first }) => {
        if (action === "ok" && first) restart();
        if (action === "back" && first) onclose();
        // Consume every key so the lobby never sees them.
        return true;
      },
      undefined,
      { capture: true }
    )
  );
</script>

<div class="scrim" role="dialog" aria-modal="true" aria-label="Replay">
  <div class="card">
    {#if failed}
      <div class="status-wrap">
        <p class="status">Replay not available</p>
      </div>
    {:else}
      <div class="stage">
      <span class="badge">▶ REPLAY</span>
      <video
        bind:this={videoEl}
        src={replayUrl(win)}
        autoplay
        muted
        playsinline
        onended={() => (ended = true)}
        onerror={() => { failed = true; markReplayMissing(win); }}
      ></video>
      </div>
    {/if}

    <p class="caption">🏆 {win.name} · {win.machine} · {timeAgo(win.ts)}</p>

    <p class="hint">
      {#if failed}
        {#if __GRABIUM_WEB__}<kbd>Esc</kbd> close{:else}<kbd>Back</kbd> close{/if}
      {:else if ended}
        {#if __GRABIUM_WEB__}
          <kbd>Enter</kbd> watch again &nbsp; <kbd>Esc</kbd> close
        {:else}
          <kbd>OK</kbd> watch again &nbsp; <kbd>Back</kbd> close
        {/if}
      {:else}
        {#if __GRABIUM_WEB__}
          <kbd>Enter</kbd> replay &nbsp; <kbd>Esc</kbd> close
        {:else}
          <kbd>OK</kbd> replay &nbsp; <kbd>Back</kbd> close
        {/if}
      {/if}
    </p>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.7);
    animation: fade 220ms ease-out both;
  }
  .card {
    display: grid;
    /* minmax(0, 1fr): without it the video's intrinsic height grows the
       first row and pushes the caption and key hints out of the card. */
    grid-template-rows: minmax(0, 1fr) auto auto;
    width: 860px;
    height: 700px;
    padding: 20px 20px 0;
    box-sizing: border-box;
    border-radius: var(--radius);
    background: var(--panel);
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6), inset 0 0 0 1px var(--line);
    overflow: hidden;
    animation: pop 220ms ease-out both;
  }
  /* Framed like a screen: a gradient ring and an inner shadow. */
  .stage {
    position: relative;
    min-height: 0;
    padding: 6px;
    border-radius: calc(var(--radius) - 4px);
    background: var(--brand-gradient);
    box-shadow: 0 0 40px rgba(34, 211, 238, 0.18);
  }
  video {
    width: 100%;
    height: 100%;
    display: block;
    border-radius: calc(var(--radius) - 8px);
    background: #000;
    object-fit: contain;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  }
  .badge {
    position: absolute;
    top: 18px;
    left: 18px;
    z-index: 1;
    padding: 4px 12px;
    border-radius: 8px;
    background: rgba(7, 9, 15, 0.72);
    color: #fff;
    font-size: 20px;
    font-weight: 800;
    letter-spacing: 1px;
  }
  .status-wrap {
    min-height: 0;
    border-radius: calc(var(--radius) - 4px);
    display: flex;
    align-items: center;
    justify-content: center;
    background: #000;
  }
  .status {
    margin: 0;
    color: var(--muted);
    font-size: 32px;
  }
  .caption {
    margin: 0;
    padding: 16px 8px 6px;
    font-size: 28px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hint {
    margin: 0;
    padding: 0 8px 20px;
    font-size: 24px;
    color: var(--muted);
  }
  @keyframes fade {
    from { opacity: 0; }
  }
  @keyframes pop {
    from { opacity: 0; transform: scale(0.92); }
  }
  @media (prefers-reduced-motion: reduce) {
    .scrim, .card { animation: none; }
  }
</style>
