<!--
  Launch screen, ported from the Mini App's LoadingSplash
  (frontend/src/LoadingSplash.svelte) and sized for a TV. The neon logo
  fills in from the bottom as loading progresses, with sparks, scanlines
  and an occasional glitch. It hides once the lobby has its first machine
  list ("grabium-ready"), but never before MIN_MS, so it does not flash, and
  never after MAX_MS, so a slow network cannot trap the player on it.
-->
<script>
  import logo from "../assets/grabium-loading-logo.jpeg";

  const MIN_MS = 1600;
  const MAX_MS = 7000;
  const SPARKS = [
    ["-280px", "-50px", "0s", "#38c8ff"],
    ["-220px", "-210px", ".18s", "#7a5cff"],
    ["-70px", "-300px", ".36s", "#c93bff"],
    ["96px", "-284px", ".54s", "#38c8ff"],
    ["238px", "-166px", ".72s", "#7a5cff"],
    ["296px", "-4px", ".9s", "#c93bff"],
    ["230px", "166px", "1.08s", "#38c8ff"],
    ["86px", "278px", "1.26s", "#7a5cff"],
    ["-86px", "278px", "1.44s", "#c93bff"],
    ["-238px", "158px", "1.62s", "#38c8ff"],
    ["-316px", "32px", "1.8s", "#7a5cff"],
    ["-158px", "-262px", "1.98s", "#c93bff"]
  ];

  let hidden = $state(false);
  let gone = $state(false);
  let progress = $state(0);
  const status = $derived(
    progress < 30 ? "Starting Grabium" : progress < 68 ? "Connecting to the machines" : progress < 100 ? "Almost ready" : "Ready"
  );

  $effect(() => {
    const started = performance.now();
    let frame = 0;
    let ready = false;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      progress = 100;
      cancelAnimationFrame(frame);
      setTimeout(() => (hidden = true), 120);
      // Unmount after the fade so the layers stop animating.
      setTimeout(() => (gone = true), 600);
    };
    const tick = (now) => {
      const elapsed = now - started;
      progress = Math.min(ready ? 100 : 94, Math.round((elapsed / MIN_MS) * 100));
      if (ready && elapsed >= MIN_MS) return finish();
      if (elapsed >= MAX_MS) return finish();
      frame = requestAnimationFrame(tick);
    };
    const onReady = () => (ready = true);
    window.addEventListener("grabium-ready", onReady);
    frame = requestAnimationFrame(tick);
    // requestAnimationFrame stops in a background tab; a plain timer still
    // guarantees the splash cannot outlive MAX_MS.
    const cap = setTimeout(finish, MAX_MS + 100);
    return () => {
      window.removeEventListener("grabium-ready", onReady);
      cancelAnimationFrame(frame);
      clearTimeout(cap);
    };
  });
</script>

{#if !gone}
  <div class="splash" class:hidden style="--p: {progress / 100}" aria-hidden={hidden}>
    <div class="content">
      <div class="sparks" aria-hidden="true">
        {#each SPARKS as [dx, dy, delay, color] (dx + dy)}
          <i style="--dx: {dx}; --dy: {dy}; --delay: {delay}; --spark: {color}"></i>
        {/each}
      </div>
      <div class="emblem" aria-label="Grabium">
        <img class="muted" src={logo} alt="" />
        <span class="reveal" style="clip-path: inset({100 - progress}% 0 0 0)"><img src={logo} alt="" /></span>
        <img class="glitch a" src={logo} alt="" />
        <img class="glitch b" src={logo} alt="" />
      </div>
      <div class="progress">
        <div class="track"><span></span></div>
        <div class="copy"><span>{status}</span><strong>{progress}%</strong></div>
      </div>
    </div>
    <div class="scanlines"></div>
    <div class="scan"></div>
    <div class="vignette"></div>
    <div class="boot"><i></i></div>
    <div class="tagline">Grab something real</div>
  </div>
{/if}

<style>
  .splash {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    overflow: hidden;
    isolation: isolate;
    background:
      radial-gradient(110% 76% at 50% 34%, rgba(80, 70, 220, 0.2), transparent 58%),
      linear-gradient(180deg, #08081a 0%, #04040c 68%, #030309 100%);
    color: #f4f6ff;
    transition: opacity 420ms ease;
  }
  .splash.hidden { opacity: 0; }
  .content { position: relative; z-index: 2; display: grid; justify-items: center; gap: 56px; }
  .emblem {
    position: relative;
    width: 400px;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 48px;
    background: #070717;
    box-shadow: 0 0 60px rgba(93, 77, 255, 0.38);
    animation: pulse 2.8s ease-in-out infinite;
  }
  .emblem img, .reveal { position: absolute; inset: 0; width: 100%; height: 100%; }
  .emblem img { display: block; object-fit: cover; }
  .muted { filter: grayscale(1) brightness(0.48); }
  .reveal { overflow: hidden; transition: clip-path 120ms linear; }
  .glitch { opacity: 0; mix-blend-mode: screen; }
  .glitch.a { filter: hue-rotate(42deg) saturate(1.55); animation: glitchA 3.3s steps(1) infinite; }
  .glitch.b { filter: hue-rotate(-48deg) saturate(1.55); animation: glitchB 4.1s steps(1) infinite; }
  .progress { width: 460px; display: grid; gap: 18px; }
  .track {
    position: relative;
    height: 8px;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
  }
  .track span {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(90deg, #38c8ff, #7a5cff 52%, #c93bff);
    box-shadow: 0 0 18px rgba(120, 100, 255, 0.78);
    transform: scaleX(var(--p));
    transform-origin: left center;
    transition: transform 120ms linear;
  }
  .track span::after {
    content: "";
    position: absolute;
    inset: -2px;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.8), transparent);
    transform: translateX(-120%);
    animation: shimmer 1.45s ease-in-out infinite;
  }
  .copy {
    display: flex;
    justify-content: center;
    align-items: baseline;
    gap: 14px;
    color: rgba(196, 204, 245, 0.8);
    font-size: 22px;
    font-weight: 750;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  .copy strong {
    min-width: 70px;
    color: #5edbff;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 0 12px rgba(56, 200, 255, 0.58);
  }
  .sparks { position: absolute; top: 200px; left: 50%; z-index: -1; width: 0; height: 0; }
  .sparks i {
    position: absolute;
    width: 10px;
    height: 10px;
    margin: -5px;
    border-radius: 50%;
    background: var(--spark);
    box-shadow: 0 0 16px var(--spark);
    animation: spark 2.1s ease-in var(--delay) infinite;
  }
  .scanlines, .scan, .vignette, .boot { position: absolute; inset: 0; pointer-events: none; }
  .scanlines {
    z-index: 4;
    opacity: 0.07;
    background: repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.28) 0 1px, transparent 1px 3px);
    animation: flicker 2.2s linear infinite;
  }
  .scan {
    z-index: 4;
    height: 160px;
    background: linear-gradient(180deg, transparent, rgba(120, 140, 255, 0.07), transparent);
    animation: scan 5.8s linear infinite;
  }
  .vignette { z-index: 5; background: radial-gradient(110% 110% at 50% 50%, transparent 54%, rgba(0, 0, 10, 0.58) 100%); }
  .boot { z-index: 6; display: grid; place-items: center; background: #000; animation: bootFade 720ms ease forwards; }
  .boot i {
    width: 100%;
    height: 3px;
    background: linear-gradient(90deg, transparent, #8fd8ff, #fff, #c990ff, transparent);
    box-shadow: 0 0 30px rgba(140, 180, 255, 0.9);
    animation: bootLine 720ms ease forwards;
  }
  .tagline {
    position: absolute;
    z-index: 3;
    inset-inline: 0;
    bottom: 64px;
    color: rgba(184, 193, 235, 0.68);
    font-size: 22px;
    font-weight: 750;
    letter-spacing: 0.3em;
    text-align: center;
    text-transform: uppercase;
    animation: tagline 4.8s steps(1) infinite;
  }
  @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.035); } }
  @keyframes shimmer {
    0% { transform: translateX(-120%); opacity: 0; }
    22% { opacity: 1; }
    100% { transform: translateX(120%); opacity: 0; }
  }
  @keyframes spark {
    0% { transform: translate(var(--dx), var(--dy)) scale(0.9); opacity: 0; }
    16% { opacity: 1; }
    100% { transform: translate(0, 0) scale(0.3); opacity: 0; }
  }
  @keyframes glitchA {
    0%, 88%, 94%, 100% { transform: translate(0); opacity: 0; }
    89% { transform: translate(-10px, 3px); opacity: 0.68; }
    91% { transform: translate(8px, -2px); opacity: 0.52; }
    93% { transform: translate(-5px, 2px); opacity: 0.4; }
  }
  @keyframes glitchB {
    0%, 90%, 96%, 100% { transform: translate(0); opacity: 0; }
    91% { transform: translate(10px, -3px); opacity: 0.62; }
    93% { transform: translate(-8px, 3px); opacity: 0.48; }
    95% { transform: translate(6px, 0); opacity: 0.34; }
  }
  @keyframes flicker {
    0%, 100% { opacity: 0.06; }
    50% { opacity: 0.09; }
    92% { opacity: 0.06; }
    93% { opacity: 0.14; }
    94% { opacity: 0.06; }
  }
  @keyframes scan { from { transform: translateY(-100%); } to { transform: translateY(1080px); } }
  @keyframes bootFade { 0%, 52% { opacity: 1; } 100% { opacity: 0; } }
  @keyframes bootLine {
    0% { transform: scaleX(0) scaleY(1); }
    48% { transform: scaleX(1) scaleY(1); opacity: 1; }
    100% { transform: scaleX(1) scaleY(360); opacity: 0; }
  }
  @keyframes tagline {
    0%, 94%, 97%, 100% { transform: translateX(0); opacity: 0.68; }
    95% { transform: translateX(3px); opacity: 0.9; }
    96% { transform: translateX(-3px); opacity: 0.76; }
  }
  @media (prefers-reduced-motion: reduce) {
    .splash *, .splash *::before, .splash *::after { animation: none !important; }
    .boot { display: none; }
  }
</style>
