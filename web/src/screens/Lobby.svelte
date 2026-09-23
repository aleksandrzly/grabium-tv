<script>
  import { fetchMachines, fetchRecentWins, previewUrl, iconUrl } from "../lib/api.js";
  import { LOBBY_POLL_MS } from "../lib/config.js";
  import { listenRemote } from "../lib/remote.js";
  import { cropStyle, statusOf } from "../lib/format.js";
  import WinsTicker from "../components/WinsTicker.svelte";
  import WalletBadge from "../components/WalletBadge.svelte";
  import SidePanel from "../components/SidePanel.svelte";
  import Wordmark from "../components/Wordmark.svelte";
  // The real brand logo (the Mini App's loading-screen art), cropped to the
  // "G" by CSS; the wordmark beside it already spells the name.
  import mark from "../assets/grabium-loading-logo.jpeg";
  import { refreshWallet } from "../lib/wallet.svelte.js";
  import { economy, modeInfo } from "../lib/economy.svelte.js";
  import { exitApp } from "../lib/bridge.js";
  import { account } from "../lib/platform.svelte.js";

  let { onOpen, initialFocusId = null } = $props();

  let machines = $state([]);
  let wins = $state([]);
  let error = $state("");
  let loaded = $state(false);
  let tick = $state(0);
  let focusId = $state(initialFocusId);

  // Focus follows the machine id, not an index, so a poll that reorders or
  // drops a machine never moves the highlight onto a different cabinet.
  const focusIndex = $derived(Math.max(0, machines.findIndex((m) => m.id === focusId)));

  $effect(() => {
    const abort = new AbortController();
    async function refresh() {
      try {
        machines = await fetchMachines(abort.signal);
        error = "";
        if (!machines.some((m) => m.id === focusId)) focusId = machines[0]?.id ?? null;
      } catch (err) {
        if (!abort.signal.aborted) error = err.message;
      } finally {
        if (!loaded) window.dispatchEvent(new Event("grabium-ready"));
        loaded = true;
        tick += 1;
      }
    }
    async function refreshWins() {
      try {
        wins = (await fetchRecentWins(abort.signal)).slice(0, 12);
      } catch (err) {
        console.warn("[lobby] recent wins", err);
      }
    }
    refresh();
    refreshWins();
    refreshWallet();
    const walletPoll = setInterval(refreshWallet, 30000);
    const poll = setInterval(refresh, LOBBY_POLL_MS);
    const winsPoll = setInterval(refreshWins, 30000);
    return () => {
      abort.abort();
      clearInterval(poll);
      clearInterval(winsPoll);
      clearInterval(walletPoll);
    };
  });

  // Coming back from a machine uses the same Back key; a held or repeating
  // Back must not fall through and close the app the moment the lobby mounts.
  const mountedAt = Date.now();

  $effect(() =>
    listenRemote((action, { first }) => {
      if (action === "back") {
        if (first && Date.now() - mountedAt > 600) exitApp();
        return;
      }
      if (!machines.length) return;
      if (action === "left") focusId = machines[Math.max(0, focusIndex - 1)].id;
      if (action === "right") focusId = machines[Math.min(machines.length - 1, focusIndex + 1)].id;
      if (action === "ok" && first) onOpen(machines[focusIndex]);
    })
  );
</script>

<main>
  <header>
    <div class="brand">
    <h1 class="logo"><span class="mark"><img src={mark} alt="" /></span><Wordmark height={100} /></h1>
    <p>Real claw machines, live. Pick one and play from your couch.</p>
    {#if !economy.prizesShip}
      <p class="arcade"><strong>Arcade mode</strong> · grabs count on the weekly board, no prizes are shipped</p>
    {/if}
    </div>
    <div class="wallet-slot"><WalletBadge /></div>
  </header>

  <div class="content">
  <section class="cards" aria-label="Machines">
    {#if !loaded}
      <p class="hint">Loading machines…</p>
    {:else if error && !machines.length}
      <p class="error">Can't reach the machines right now. Retrying…</p>
    {:else if !machines.length}
      <p class="hint">No machines are online.</p>
    {/if}
    {#each machines as m, i (m.id)}
      {@const s = statusOf(m)}
      {@const prize = m.prizes?.[0]}
      <article class="card" style="--i: {i}" class:focused={m.id === focusId}
        aria-selected={m.id === focusId}>
        <div class="preview">
          <img src={previewUrl(m.id, tick)} alt="" style={cropStyle(m.camera_crop)} />
          <span class="live"><i></i>LIVE</span>
        </div>
        <div class="meta">
          <h2>{m.name}</h2>
          <span class="pill tone-{s.tone}">{s.label}</span>
        </div>
        <p class="watch hint">{m.watching || 0} watching{#if m.queue?.size} · {m.queue.size} in line{/if}</p>
        <div class="details">
          {#if economy.prizesShip && prize}
            <span class="prize">
              {#if prize.icon_url}<img src={iconUrl(prize.icon_url)} alt="" />{/if}
              {prize.title}
            </span>
          {:else}
            <span class="mode"><strong>{modeInfo(m.mode).label}</strong> {modeInfo(m.mode).blurb}</span>
          {/if}
        </div>
      </article>
    {/each}
  </section>
  <SidePanel />
  </div>

  {#if wins.length}
    <WinsTicker {wins} />
  {:else}
    <div></div>
  {/if}

  <footer class="hint">
    {#if __GRABIUM_WEB__}
      <span><kbd>◀</kbd> <kbd>▶</kbd> choose &nbsp; <kbd>Enter</kbd> open &nbsp; <kbd>M</kbd> settings</span>
    {:else}
      <span><kbd>◀</kbd> <kbd>▶</kbd> choose &nbsp; <kbd>OK</kbd> open &nbsp; <kbd>≡</kbd> settings &nbsp; <kbd>Back</kbd> exit</span>
    {/if}
    {#if account.token}
      <span class="account">Signed in as <strong>{account.email || "player"}</strong></span>
    {/if}
  </footer>
</main>

<style>
  main {
    display: grid;
    grid-template-rows: auto 1fr auto auto;
    grid-template-columns: minmax(0, 1fr);
    gap: 24px;
    height: 1080px;
    padding: 40px 96px 36px;
  }
  /* Two columns share one grid: machines on the left, the wallet and the
     side panel on the right, so the wallet lines up with the panel below. */
  header, .content {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 460px;
    gap: 48px;
  }
  header { align-items: start; }
  /* Exactly the side column's width, so the pill lines up with the panel. */
  .wallet-slot { display: flex; min-width: 0; }
  .content { align-items: center; }
  .logo {
    display: flex;
    align-items: center;
    gap: 22px;
    margin: 0 0 6px;
  }
  .mark {
    display: block;
    width: 108px;
    height: 108px;
    overflow: hidden;
    border-radius: 26px;
    background: #070717;
    box-shadow: var(--mark-shadow), inset 0 0 0 1px var(--mark-ring);
    outline: 4px solid var(--mark-ring);
    outline-offset: 0;
    animation: mark-float 5s ease-in-out infinite;
  }
  /* Show the G only: the art is 392x390 with the GRABIUM caption in the
     bottom fifth, so scale it up and anchor to the top. */
  .mark img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: 50% 8%;
    transform: scale(1.32);
    transform-origin: 50% 22%;
  }
  @keyframes mark-float {
    0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
    50% { transform: translate3d(0, -6px, 0) rotate(-2deg); }
  }
  @media (prefers-reduced-motion: reduce) { .mark { animation: none; } }
  header p { margin: 4px 0 0; color: var(--muted); font-size: 32px; }
  header .arcade {
    display: inline-block;
    margin-top: 16px;
    padding: 8px 18px;
    border-radius: 999px;
    background: rgba(250, 204, 21, 0.1);
    box-shadow: inset 0 0 0 1px rgba(250, 204, 21, 0.35);
    color: var(--text);
    font-size: 24px;
  }
  .mode { color: var(--muted); font-size: 24px; }
  .mode strong { color: var(--live); margin-right: 8px; }
  .cards {
    display: flex;
    gap: 48px;
    align-items: center;
  }
  .card {
    position: relative;
    width: 580px;
    padding: 20px;
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--line), 0 18px 40px rgba(0, 0, 0, 0.35);
    transform: scale(0.95);
    opacity: 0.78;
    transition: transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 220ms ease-out;
  }
  /* Focus glow sits on its own layer so only its opacity animates. */
  .card::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: var(--focus);
    opacity: 0;
    transition: opacity 220ms ease-out;
    pointer-events: none;
  }
  /* Staggered entrance on the wrapper's opacity/translate only. */
  .card { animation: enter 480ms cubic-bezier(0.2, 0.8, 0.2, 1) both; animation-delay: calc(var(--i) * 90ms); }
  @keyframes enter {
    from { opacity: 0; translate: 0 40px; }
  }
  .card.focused {
    transform: scale(1.02);
    opacity: 1;
  }
  .card.focused::after {
    opacity: 1;
    animation: glow 2.4s ease-in-out infinite;
  }
  @keyframes glow {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.55; }
  }
  .preview {
    position: relative;
    height: 320px;
    border-radius: 14px;
    overflow: hidden;
    background: #000;
  }
  .preview img { width: 100%; height: 100%; object-fit: cover; }
  .live {
    position: absolute;
    top: 14px;
    left: 14px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    border-radius: 8px;
    background: rgba(7, 9, 15, 0.72);
    color: #fff;
    font-size: 20px;
    font-weight: 800;
    letter-spacing: 1px;
  }
  .live i {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #ef4444;
    animation: blink 1.4s ease-in-out infinite;
  }
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.25; }
  }
  .meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    margin-top: 18px;
  }
  .meta h2 { margin: 0; font-size: 40px; }
  .details { margin-top: 10px; }
  .watch { margin: 6px 0 0; font-size: 22px; }
  .prize { display: inline-flex; align-items: center; gap: 10px; }
  .prize img { width: 44px; height: 44px; object-fit: contain; }
  .error { color: var(--busy); }
  footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .account { padding: 10px 20px; }
</style>
