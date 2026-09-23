<script>
  import { fetchWeeklyBoard } from "../lib/api.js";
  import { account } from "../lib/platform.svelte.js";

  let board = $state({ entries: [], me: null, challenge: null });

  $effect(() => {
    // Re-read when the player signs in or out: "me" and the challenge
    // progress only exist for a signed-in viewer.
    const token = account.token;
    const abort = new AbortController();
    const load = async () => {
      try {
        board = await fetchWeeklyBoard(token, abort.signal);
      } catch (err) {
        if (!abort.signal.aborted) console.info("[board] unavailable", err);
      }
    };
    load();
    const poll = setInterval(load, 60000);
    return () => {
      abort.abort();
      clearInterval(poll);
    };
  });

  const MEDALS = ["🥇", "🥈", "🥉"];
  // The browser build is played with a keyboard.
  const OK = __GRABIUM_WEB__ ? "Enter" : "OK";
  const MOVE = __GRABIUM_WEB__ ? "Arrows" : "◀▲▼▶";
  const challenge = $derived(board.challenge);
  const progress = $derived(
    challenge ? Math.min(1, (challenge.progress || 0) / Math.max(1, challenge.target || 1)) : 0
  );
</script>

<aside>
  <section class="card board" style="--i: 0">
    <h3>This week</h3>
    {#if board.entries.length}
      <ol>
        {#each board.entries as e, i (e.user_id)}
          <li class:lead={i === 0} style="--i: {i + 1}">
            <span class="medal">{MEDALS[i] || e.rank}</span>
            <span class="name">{e.display_name || "Player"}</span>
            <span class="grabs"><strong>{e.wins}</strong> {e.wins === 1 ? "grab" : "grabs"}</span>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="hint">Nobody on the board yet. Land the first grab!</p>
    {/if}

    {#if challenge}
      <div class="challenge">
        <div class="row">
          <span>Weekly challenge: land {challenge.target} grabs</span>
          {#if account.token}
            <strong>{challenge.progress || 0}/{challenge.target}</strong>
          {/if}
        </div>
        <div class="bar" aria-hidden="true"><i style="transform: scaleX({account.token ? progress : 0})"></i></div>
        {#if !account.token}<p class="hint small">Sign in to track your progress.</p>{/if}
      </div>
    {/if}
  </section>

  <section class="card how" style="--i: 1">
    <h3>How to play</h3>
    <ol class="steps">
      <li><span class="key">{OK}</span><span>Open a machine and start a round</span></li>
      <li><span class="key">{MOVE}</span><span>Hold to steer the claw over a toy</span></li>
      <li><span class="key">{OK}</span><span>Drop. It grabs on its own, live</span></li>
    </ol>
  </section>
</aside>

<style>
  aside {
    display: grid;
    align-content: start;
    gap: 24px;
  }
  .card {
    padding: 24px 26px;
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--line), 0 18px 40px rgba(0, 0, 0, 0.3);
    animation: rise 520ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
    animation-delay: calc(200ms + var(--i) * 120ms);
  }
  h3 {
    margin: 0 0 16px;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--muted);
  }
  ol { margin: 0; padding: 0; list-style: none; }
  .board li {
    position: relative;
    display: grid;
    grid-template-columns: 44px 1fr auto;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 14px;
    overflow: hidden;
    animation: rise 480ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
    animation-delay: calc(350ms + var(--i) * 90ms);
  }
  .board li + li { margin-top: 6px; }
  .medal { font-size: 30px; text-align: center; }
  .name { font-size: 28px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .grabs { color: var(--muted); font-size: 22px; white-space: nowrap; }
  .grabs strong { color: var(--text); font-size: 28px; }
  /* The leader's row gets a slow shine; transform only. */
  .lead { background: rgba(250, 204, 21, 0.08); box-shadow: inset 0 0 0 1px rgba(250, 204, 21, 0.25); }
  .lead::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(100deg, transparent 35%, rgba(255, 255, 255, 0.12) 50%, transparent 65%);
    transform: translate3d(-100%, 0, 0);
    animation: shine 4.5s ease-in-out 1.2s infinite;
    pointer-events: none;
  }
  .challenge { margin-top: 20px; }
  .row { display: flex; justify-content: space-between; gap: 12px; font-size: 22px; }
  .row strong { color: var(--accent); }
  .bar {
    height: 10px;
    margin-top: 10px;
    border-radius: 999px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    background: var(--brand-gradient);
    transform-origin: left;
    transition: transform 700ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .small { margin: 8px 0 0; font-size: 20px; }
  .steps { display: grid; gap: 14px; }
  .steps li { display: grid; grid-template-columns: 108px 1fr; align-items: center; gap: 14px; font-size: 24px; }
  .key {
    justify-self: start;
    padding: 6px 12px;
    border-radius: 10px;
    background: var(--surface-2);
    box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.25), inset 0 0 0 1px var(--line);
    font-weight: 700;
    font-size: 22px;
    white-space: nowrap;
  }
  @keyframes rise {
    from { opacity: 0; transform: translate3d(0, 24px, 0); }
  }
  @keyframes shine {
    0%, 60% { transform: translate3d(-100%, 0, 0); }
    100% { transform: translate3d(100%, 0, 0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .card, .board li, .lead::after { animation: none; }
  }
</style>
