<script>
  import { untrack } from "svelte";
  import { wallet } from "../lib/wallet.svelte.js";
  import { account } from "../lib/platform.svelte.js";

  let { compact = false } = $props();

  // Count up/down to the new balance instead of jumping: the change is the
  // news (a round spent, welcome credits landed), so let the eye catch it.
  let shown = $state(0);
  let bump = $state(0);
  $effect(() => {
    const target = wallet.credits;
    // Only the balance drives this effect; the animated value must not.
    const from = untrack(() => shown);
    if (from === target) return;
    untrack(() => (bump += 1));
    const started = performance.now();
    const duration = Math.min(900, 120 + Math.abs(target - from) * 60);
    let frame = 0;
    const step = (now) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - (1 - t) ** 3;
      shown = Math.round(from + (target - from) * eased);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  });
</script>

{#if account.token && wallet.known}
  <div class="wallet" class:compact aria-label="Your credits">
    <div class="credits">
      <span class="coin" aria-hidden="true"><span>G</span></span>
      <span class="amount">
        {#key bump}<strong class="pop">{shown}</strong>{/key}
        <small>{shown === 1 ? "credit" : "credits"}</small>
      </span>
    </div>
    {#if wallet.freeLeft !== null && compact}
      <div class="free" class:empty={wallet.freeLeft === 0}>
        <span>{wallet.freeLeft}/{wallet.freeLimit} free</span>
      </div>
    {:else if wallet.freeLeft !== null}
      <div class="free" class:empty={wallet.freeLeft === 0}>
        <span class="pips" aria-hidden="true">
          {#each Array(wallet.freeLimit) as _, i (i)}
            <i class:on={i < wallet.freeLeft}></i>
          {/each}
        </span>
        <span>{wallet.freeLeft}/{wallet.freeLimit} free today</span>
      </div>
    {/if}
  </div>
{:else if !compact}
  <div class="wallet guest">
    <span class="coin" aria-hidden="true"><span>G</span></span>
    <span>New players get free plays. Sign in on any machine.</span>
  </div>
{/if}

<style>
  .wallet {
    position: relative;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 14px;
    padding: 12px 16px 12px 12px;
    border-radius: 999px;
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--line), 0 12px 30px rgba(0, 0, 0, 0.25);
    overflow: hidden;
    isolation: isolate;
  }
  /* A slow light sweep across the pill; transform only. */
  .wallet::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    background: linear-gradient(100deg, transparent 30%, rgba(255, 255, 255, 0.1) 50%, transparent 70%);
    transform: translate3d(-100%, 0, 0);
    animation: sweep 5.5s ease-in-out infinite;
  }
  .credits { display: flex; align-items: center; gap: 12px; }
  .coin {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    flex: none;
    border-radius: 50%;
    background: radial-gradient(circle at 32% 28%, #fff6c2, #facc15 45%, #b7791f);
    box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.18), 0 0 22px rgba(250, 204, 21, 0.35);
    color: #5b3a06;
    font-weight: 900;
    font-size: 26px;
    animation: bob 3.2s ease-in-out infinite;
  }
  .coin span { animation: spin 6s ease-in-out infinite; }
  .amount { display: flex; align-items: baseline; gap: 8px; }
  .amount strong {
    display: inline-block;
    min-width: 1.2ch;
    font-size: 40px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .amount small { color: var(--muted); font-size: 22px; }
  .pop { animation: pop 420ms cubic-bezier(0.2, 0.8, 0.2, 1.4); }
  .free {
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    border-radius: 999px;
    background: var(--surface-2);
    font-size: 22px;
  }
  .free.empty { color: var(--muted); }
  .pips { display: flex; gap: 6px; }
  .pips i {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--line);
    transform: scale(0.8);
    transition: transform 300ms ease-out, opacity 300ms ease-out;
  }
  .pips i.on {
    background: var(--live);
    transform: scale(1);
    box-shadow: 0 0 10px var(--live);
  }
  .guest { gap: 14px; padding-right: 24px; font-size: 22px; color: var(--muted); }
  .guest .coin { width: 40px; height: 40px; font-size: 20px; }
  .compact { width: auto; padding: 8px 14px 8px 8px; }
  .compact .coin { width: 40px; height: 40px; font-size: 20px; }
  .compact .amount strong { font-size: 30px; }
  @keyframes sweep {
    0%, 55% { transform: translate3d(-100%, 0, 0); }
    100% { transform: translate3d(100%, 0, 0); }
  }
  @keyframes bob {
    0%, 100% { transform: translate3d(0, 0, 0); }
    50% { transform: translate3d(0, -4px, 0); }
  }
  @keyframes spin {
    0%, 80% { transform: rotateY(0deg); }
    100% { transform: rotateY(360deg); }
  }
  @keyframes pop {
    from { transform: scale(1.35); opacity: 0.4; }
  }
  @media (prefers-reduced-motion: reduce) {
    .wallet::before, .coin, .coin span, .pop { animation: none; }
  }
</style>
