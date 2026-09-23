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

  let { initial, onBack, onSignIn } = $props();

  // Snapshot the id once: this screen is always for one machine.
  const id = initial.id;
  let machine = $state(initial);
  let video = $state(null);
  let streamState = $state("connecting");

  const game = createGame(id, initial.mode);
  const g = game.state;
  const action = $derived(actionCopy(g, economy));
  const playing = $derived(g.status === "controlling");

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
    } else if (status === "session_ended" && coachKind === "hint") {
      coachKind = "recap";
      coachRecap(id, g.result).then((line) => {
        if (coachKind === "recap") coachLine = line;
      });
    }
  });

  const status = $derived(statusOf(machine));
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
  </section>

  <aside>
    <span class="live">LIVE{#if streamState === "hls"} · HLS{/if}</span>
    <h1>{machine.name}</h1>
    <span class="pill tone-{status.tone}">{status.label}</span>

    <section class="action" class:playing aria-live="polite">
      <h2>{action.title}</h2>
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
      {#if backArmed}<strong class="error">Press Back again to end your round</strong>
      {:else if playing}<kbd>Back</kbd> twice to leave
      {:else}<kbd>Back</kbd> machines{/if}
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
