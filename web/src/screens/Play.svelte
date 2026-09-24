<script>
  import { fetchMachine, iconUrl } from "../lib/api.js";
  import { MACHINE_POLL_MS, url } from "../lib/config.js";
  import { listenRemote } from "../lib/remote.js";
  import { startStream } from "../lib/stream.js";
  import { cropStyle, statusOf } from "../lib/format.js";
  import { createGame } from "../lib/game.svelte.js";
  import { actionCopy, refusalText } from "../lib/playCopy.js";
  import { economy, modeInfo } from "../lib/economy.svelte.js";
  import { coachHint, coachRecap } from "../lib/coach.js";
  import WalletBadge from "../components/WalletBadge.svelte";
  import { refreshWallet } from "../lib/wallet.svelte.js";

  let { initial, onBack, onSignIn } = $props();

  // Snapshot the id once: this screen is always for one machine.
  const id = initial.id;
  let machine = $state(initial);
  let video = $state(null);
  let streamState = $state("connecting");

  const game = createGame(id, initial.mode);
  const g = game.state;
  // Dev server only (stripped from builds): lets a designer force a status
  // from the console to review each panel animation.
  if (import.meta.env.DEV) window.__grabiumGame = g;
  const action = $derived(actionCopy(g, economy));
  const playing = $derived(g.status === "controlling");
  // Drives the panel animation: a claw swinging while the machine gets ready,
  // a pop when it is ready, and confetti or a shake when the round ends.
  const WAITING = ["connecting", "not_ready", "returning_home"];
  const mood = $derived(
    g.showResult
      ? g.result === "WIN" ? "win" : "lose"
      : WAITING.includes(g.status) ? "wait"
      : g.status === "ready" || g.status === "turn_invited" ? "ready" : ""
  );
  const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
    x: (i * 37) % 100,
    delay: (i % 7) * 0.12,
    dur: 1.8 + (i % 5) * 0.25,
    rot: (i * 53) % 360,
    hue: ["var(--accent)", "var(--ok)", "#ffd23f", "#ff5fa2", "#38c8ff"][i % 5]
  }));

  // Countdown between server updates; every WS message resets it to the
  // edge's session_left, so the edge stays the source of truth.
  let shownLeft = $state(0);
  $effect(() => {
    shownLeft = g.sessionLeft;
    if (!playing) return;
    const timer = setInterval(() => (shownLeft = Math.max(0, shownLeft - 1)), 1000);
    return () => clearInterval(timer);
  });

  // Back while playing must be pressed twice, so a stray press does not
  // throw away a paid round.
  let backArmedUntil = $state(0);
  let now = $state(Date.now());
  $effect(() => {
    if (!backArmedUntil) return;
    const timer = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(timer);
  });
  const backArmed = $derived(backArmedUntil > now);

  $effect(() => {
    game.connect();
    return () => {
      game.leave();
      game.close();
    };
  });

  // The balance changes when a round starts (spent) and ends; refresh then.
  $effect(() => {
    const status = g.status;
    if (status === "controlling" || g.showResult) refreshWallet();
  });
  refreshWallet();

  // AI coach: a tip when this player's round starts, a recap when it ends.
  // Keyed on the transition so a status resend does not ask twice.
  let coachLine = $state("");
  let coachKind = $state("");
  let lastCoachStatus = "";
  $effect(() => {
    const status = g.status;
    if (status === lastCoachStatus) return;
    lastCoachStatus = status;
    if (status === "controlling") {
      coachLine = "";
      coachKind = "hint";
      coachHint(id).then((line) => {
        if (coachKind === "hint") coachLine = line;
      });
    } else if ((status === "session_ended" || g.showResult) && coachKind === "hint") {
      coachKind = "recap";
      coachRecap(id, g.result).then((line) => {
        if (coachKind === "recap") coachLine = line;
      });
    }
  });

  // The poll only knows the machine is taken; during this player's own round
  // (and its result) that is them, not "someone".
  const ownRound = $derived(g.status === "controlling" || g.afterRound || g.showResult);
  const status = $derived(ownRound ? { label: "You're playing", tone: "ok" } : statusOf(machine));
  const prize = $derived(machine?.prizes?.[0]);
  const player = $derived(machine?.session?.active_user);

  $effect(() => {
    if (!video) return;
    return startStream(video, {
      whepUrl: url(initial.whep_url || `/cam/${id}/whep`),
      hlsUrl: url(initial.hls_url || `/cam/${id}/index.m3u8`),
      onState: (state, detail) => {
        streamState = state;
        if (detail) console.info("[stream]", state, detail);
      }
    });
  });

  $effect(() => {
    const abort = new AbortController();
    const refresh = async () => {
      try {
        machine = await fetchMachine(id, abort.signal);
      } catch (err) {
        if (!abort.signal.aborted) console.warn("[play] status", err);
      }
    };
    const poll = setInterval(refresh, MACHINE_POLL_MS);
    return () => {
      abort.abort();
      clearInterval(poll);
    };
  });

  $effect(() =>
    listenRemote(
      (key, { first }) => {
        if (key === "back") {
          if (!first) return;
          if (g.status === "controlling") {
            if (Date.now() < backArmedUntil) {
              game.leave();
              onBack();
            } else {
              backArmedUntil = Date.now() + 2500;
              now = Date.now();
            }
            return true;
          }
          if (g.status === "queued" || g.status === "turn_invited") {
            game.leave();
            return true;
          }
          onBack();
          // Consume the press so its repeats cannot reach the lobby.
          return true;
        }
        if (key === "ok") {
          if (first && game.ok() === "sign_in") onSignIn();
          return;
        }
        if (first) game.press(key);
      },
      (key) => game.release(key)
    )
  );
</script>

<main>
  <section class="stage" aria-label="Live camera">
    <video bind:this={video} autoplay muted playsinline style={cropStyle(initial.camera_crop)}></video>
    {#if streamState === "connecting"}
      <p class="overlay hint">Connecting to the camera…</p>
    {:else if streamState === "error"}
      <p class="overlay error">Video is unavailable. Press Back and try again.</p>
    {/if}
    {#if mood === "win"}
      <!-- Falls from the top edge and is gone in ~3 s; pointer-events none, so
           the stream stays the product surface. -->
      <div class="confetti" aria-hidden="true">
        {#each CONFETTI as c, i (i)}
          <i style="--x: {c.x}%; --d: {c.delay}s; --t: {c.dur}s; --r: {c.rot}deg; --c: {c.hue}"></i>
        {/each}
      </div>
    {/if}
  </section>

  <aside>
    <div class="top">
      <span class="live">LIVE{#if streamState === "hls"} · HLS{/if}</span>
      <WalletBadge compact />
    </div>
    <h1>{machine.name}</h1>
    <span class="pill tone-{status.tone}">{status.label}</span>

    <section class="action mood-{mood}" class:playing aria-live="polite">
      {#if mood === "wait"}
        <div class="waiter" aria-hidden="true">
          <svg class="claw" viewBox="0 0 96 120" width="96" height="120">
            <defs>
              <linearGradient id="claw-metal" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#00e0ff" />
                <stop offset="1" stop-color="#ff00c6" />
              </linearGradient>
            </defs>
            <g class="rig">
              <line class="cable" x1="48" y1="0" x2="48" y2="46" />
              <rect class="head" x="32" y="44" width="32" height="18" rx="6" />
              <circle class="bolt" cx="48" cy="53" r="3" />
              <path class="prong left" d="M38 62 C28 74 24 86 34 100" />
              <path class="prong right" d="M58 62 C68 74 72 86 62 100" />
            </g>
          </svg>
          <div class="waiter-copy">
            <span class="bar"><span></span></span>
          </div>
        </div>
      {/if}
      {#if mood === "win" || mood === "lose"}
        <div class="medal {mood}" aria-hidden="true">
          {#if mood === "win"}<span class="rays"></span>{/if}
          <svg viewBox="0 0 64 64" width="72" height="72">
            {#if mood === "win"}
              <path d="M20 10h24v10a12 12 0 0 1-24 0z" />
              <path d="M20 14h-8a8 8 0 0 0 8 10M44 14h8a8 8 0 0 1-8 10" class="line" />
              <path d="M32 32v10M22 52h20M26 52l2-10h8l2 10" class="line" />
            {:else}
              <path d="M32 6v14" class="line" />
              <rect x="22" y="20" width="20" height="10" rx="3" />
              <path d="M26 30c-7 8-8 16-2 24M38 30c7 8 8 16 2 24" class="line" />
            {/if}
          </svg>
        </div>
      {/if}
      {#key action.title}
        <h2 class="title">{action.title}{#if mood === "wait"}<span class="dots"><i>.</i><i>.</i><i>.</i></span>{/if}</h2>
      {/key}
      {#if action.subtitle}<p class="hint">{action.subtitle}</p>{/if}
      {#if playing && g.phase !== "lifting"}
        <p class="timer" class:low={shownLeft <= 5}>{shownLeft}<span>s</span></p>
      {/if}
      {#if g.refusal}
        <p class="error">{refusalText(g.refusal)}</p>
      {/if}
      {#if g.prize && economy.prizesShip}
        <p class="win">Prize: {g.prize.prize_title || g.prize.title || "a prize"}</p>
      {/if}
      <ul class="keys">
        {#each action.keys as k (k)}
          {@const [key, label] = k.split("|")}
          <li><kbd>{key}</kbd> {label}</li>
        {/each}
      </ul>
    </section>

    {#if coachLine}
      <div class="coach" aria-live="polite">
        <span class="coach-tag">AI coach</span>
        <p>{coachLine}</p>
      </div>
    {/if}

    {#if player && !playing}
      <p class="now">Now playing: <strong>{player.first_name || player.name || "a player"}</strong></p>
    {/if}

    {#if !economy.prizesShip}
      <div class="prize">
        <div>
          <strong>{modeInfo(machine.mode || initial.mode).label} mode</strong>
          <p class="hint">{modeInfo(machine.mode || initial.mode).blurb}. Arcade play: grabs count on the weekly board, no prizes are shipped.</p>
        </div>
      </div>
    {:else if prize}
      <div class="prize">
        {#if prize.icon_url}<img src={iconUrl(prize.icon_url)} alt="" />{/if}
        <div>
          <strong>{prize.title}</strong>
          {#if prize.prize_info}<p class="hint">{prize.prize_info}</p>{/if}
        </div>
      </div>
    {/if}

    <dl>
      <div><dt>Watching</dt><dd>{machine.watching || 0}</dd></div>
      <div><dt>In line</dt><dd>{machine.queue?.size || 0}</dd></div>
      <div><dt>Round</dt><dd>{g.sessionTotal || machine.session?.total || "–"} s</dd></div>
    </dl>

    <footer class="hint">
      {#if backArmed}<strong class="error">Press {__GRABIUM_WEB__ ? "Esc" : "Back"} again to end your round</strong>
      {:else if playing}<kbd>{__GRABIUM_WEB__ ? "Esc / ⌫" : "Back"}</kbd> twice to leave
      {:else}<kbd>{__GRABIUM_WEB__ ? "Esc / ⌫" : "Back"}</kbd> machines{/if}
    </footer>
  </aside>
</main>

<style>
  main {
    display: grid;
    grid-template-columns: 1fr 640px;
    height: 1080px;
  }
  .stage {
    position: relative;
    background: #000;
  }
  video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .overlay {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 48px;
    margin: 0;
    text-align: center;
  }
  aside {
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 64px 56px 48px;
    background: var(--surface);
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 56px;
  }
  .live {
    align-self: flex-start;
    padding: 2px 12px;
    border-radius: 8px;
    background: #e5484d;
    font-size: 20px;
    font-weight: 700;
  }
  h1 { margin: 0; font-size: 56px; line-height: 1.1; }
  .pill { align-self: flex-start; }
  .now { margin: 0; }
  .prize {
    display: flex;
    gap: 20px;
    align-items: center;
    padding: 20px;
    border-radius: var(--radius);
    background: var(--surface-2);
  }
  .prize img { width: 88px; height: 88px; object-fit: contain; }
  .prize p { margin: 6px 0 0; }
  dl {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin: 0;
  }
  dl div { padding: 16px; border-radius: 14px; background: var(--surface-2); }
  dt { color: var(--muted); font-size: 22px; }
  dd { margin: 4px 0 0; font-size: 36px; font-weight: 700; }
  footer { margin-top: auto; }
  .action {
    padding: 24px;
    border-radius: var(--radius);
    background: var(--surface-2);
    box-shadow: inset 0 0 0 2px transparent;
    transition: box-shadow 160ms ease-out;
  }
  .action.playing { box-shadow: inset 0 0 0 3px var(--accent); }
  /* Everything in the panel is centred, so a short title does not hug the
     left edge of the rounded card. */
  .action { position: relative; overflow: hidden; text-align: center; }
  .title { animation: title-in 360ms cubic-bezier(.2, 1.4, .4, 1) both; }
  .dots i { font-style: normal; display: inline-block; animation: dot 1.2s ease-in-out infinite; }
  .dots i:nth-child(2) { animation-delay: .2s; }
  .dots i:nth-child(3) { animation-delay: .4s; }
  .waiter { display: flex; align-items: center; gap: 28px; margin-bottom: 16px; }
  .waiter-copy { flex: 1; }
  .claw { flex: none; overflow: visible; filter: drop-shadow(0 0 12px rgba(0, 224, 255, 0.45)); }
  .rig { transform-origin: 48px 0; animation: swing 2.4s ease-in-out infinite; }
  .cable { stroke: var(--muted); stroke-width: 3; }
  .head { fill: var(--surface); stroke: url(#claw-metal); stroke-width: 4; }
  .bolt { fill: url(#claw-metal); }
  .prong {
    fill: none;
    stroke: url(#claw-metal);
    stroke-width: 6;
    stroke-linecap: round;
    transform-box: view-box;
    animation: grip 2.4s ease-in-out infinite;
  }
  .prong.left { transform-origin: 38px 62px; --open: 16deg; }
  .prong.right { transform-origin: 58px 62px; --open: -16deg; }
  .bar {
    position: relative;
    display: block;
    height: 10px;
    border-radius: 999px;
    overflow: hidden;
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .bar span {
    position: absolute;
    inset: 0;
    width: 40%;
    border-radius: inherit;
    background: var(--brand-gradient);
    box-shadow: 0 0 14px rgba(0, 224, 255, 0.6);
    animation: sweep 1.4s ease-in-out infinite;
  }
  .mood-ready { animation: ready-glow 1.8s ease-out 1; }
  .mood-ready .title { color: var(--ok); animation: title-pop 520ms cubic-bezier(.2, 1.6, .4, 1) both; }
  .mood-win { animation: win-glow 1.2s ease-in-out 3; }
  .mood-win .title {
    color: var(--ok);
    animation: title-pop 600ms cubic-bezier(.2, 1.8, .4, 1) both, bounce 1s ease-in-out 600ms 2;
  }
  .mood-lose .title { color: var(--busy); animation: title-in 300ms ease-out both, shake 500ms ease-in-out 300ms 1; }
  .medal {
    position: relative;
    display: grid;
    place-items: center;
    width: 120px;
    height: 120px;
    margin: -4px auto 12px;
    border-radius: 50%;
    background: radial-gradient(circle, var(--surface) 55%, transparent 56%);
  }
  .medal svg { position: relative; fill: none; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }
  .medal.win svg { stroke: #ffd23f; animation: medal-in 700ms cubic-bezier(.2, 1.8, .4, 1) both; }
  .medal.win svg path:first-child { fill: #ffd23f; }
  .medal.lose svg { stroke: var(--muted); animation: medal-in 400ms ease-out both, sway 900ms ease-in-out 400ms 2; }
  .medal.lose svg rect { fill: var(--surface-2); stroke: var(--muted); }
  .rays {
    position: absolute;
    inset: -18px;
    border-radius: 50%;
    background: repeating-conic-gradient(rgba(255, 210, 63, 0.5) 0 10deg, transparent 10deg 30deg);
    mask: radial-gradient(circle, transparent 38%, #000 40%, transparent 72%);
    animation: rays-spin 6s linear infinite, fade-in 500ms ease-out both;
  }
  .mood-win .title {
    font-size: 64px;
    background: linear-gradient(90deg, #ffd23f, var(--ok), #38c8ff);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .confetti { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
  .confetti i {
    position: absolute;
    top: -24px;
    left: var(--x);
    width: 14px;
    height: 22px;
    border-radius: 3px;
    background: var(--c);
    opacity: 0;
    animation: fall var(--t) cubic-bezier(.3, .6, .6, 1) var(--d) 1 both;
  }
  @keyframes title-in { from { opacity: 0; transform: translate3d(0, 12px, 0); } }
  @keyframes title-pop {
    0% { opacity: 0; transform: scale(.6); }
    60% { opacity: 1; transform: scale(1.12); }
    100% { transform: scale(1); }
  }
  @keyframes medal-in { from { opacity: 0; transform: scale(.3) rotate(-20deg); } }
  @keyframes sway { 25% { transform: rotate(-12deg); } 75% { transform: rotate(12deg); } }
  @keyframes rays-spin { to { transform: rotate(360deg); } }
  @keyframes fade-in { from { opacity: 0; } }
  @keyframes bounce { 50% { transform: translate3d(0, -10px, 0); } }
  @keyframes shake {
    20%, 60% { transform: translate3d(-10px, 0, 0); }
    40%, 80% { transform: translate3d(10px, 0, 0); }
  }
  @keyframes dot { 0%, 100% { opacity: .2; } 50% { opacity: 1; } }
  @keyframes swing {
    0%, 100% { transform: rotate(-9deg) translate3d(0, 0, 0); }
    50% { transform: rotate(9deg) translate3d(0, 6px, 0); }
  }
  @keyframes grip { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(var(--open)); } }
  @keyframes sweep { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
  @keyframes ready-glow { 0% { box-shadow: inset 0 0 0 3px var(--ok); } 100% { box-shadow: inset 0 0 0 3px transparent; } }
  @keyframes win-glow { 50% { box-shadow: inset 0 0 0 4px var(--ok), 0 0 40px var(--ok); } }
  @keyframes fall {
    0% { opacity: 1; transform: translate3d(0, 0, 0) rotate(var(--r)); }
    85% { opacity: 1; }
    100% { opacity: 0; transform: translate3d(40px, 1100px, 0) rotate(calc(var(--r) + 540deg)); }
  }
  @media (prefers-reduced-motion: reduce) {
    .title, .dots i, .rig, .prong, .bar span, .medal svg, .rays, .action, .confetti { animation: none !important; }
    .confetti { display: none; }
  }
  .action h2 { margin: 0; font-size: 40px; }
  .timer {
    margin: 8px 0 0;
    font-size: 96px;
    font-weight: 800;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    color: var(--accent);
  }
  .timer span { font-size: 40px; margin-left: 6px; }
  .timer.low { color: var(--busy); }
  .keys {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 28px;
    justify-content: center;
    margin: 16px 0 0;
    padding: 0;
    list-style: none;
  }
  .coach {
    padding: 18px 22px;
    border-radius: var(--radius);
    background: var(--surface-2);
    box-shadow: inset 0 0 0 1px var(--line);
    animation: coach-in 280ms ease-out both;
  }
  .coach p { margin: 8px 0 0; font-size: 28px; line-height: 1.3; }
  .coach-tag {
    font-size: 18px;
    font-weight: 800;
    letter-spacing: 1px;
    text-transform: uppercase;
    background: var(--brand-gradient);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  @keyframes coach-in { from { opacity: 0; transform: translate3d(0, 10px, 0); } }
  .win { color: var(--ok); font-size: 32px; margin: 8px 0 0; }
  .error { color: var(--busy); }
</style>
