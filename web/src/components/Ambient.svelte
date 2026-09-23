<!--
  Background ambience shared by every TV screen, matching the Mini App's
  "Grabium Dark" skin (frontend/src/skins.css): deep gradient, a drifting
  arcade grid, and two slow neon glows. Only transform and opacity animate,
  so the WebView composites it without layout or paint work per frame.
-->
<div class="ambient" aria-hidden="true">
  <div class="grid"></div>
  <div class="glow magenta"></div>
  <div class="glow cyan"></div>
  <div class="glow amber"></div>
</div>

<style>
  .ambient {
    position: fixed;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent 24%),
      var(--bg-gradient);
  }
  .grid {
    position: absolute;
    /* Oversized so the drift never exposes an edge. */
    inset: -12%;
    background:
      linear-gradient(var(--grid-a) 1px, transparent 1px),
      linear-gradient(90deg, var(--grid-b) 1px, transparent 1px),
      radial-gradient(circle, var(--grid-dot) 0 1.5px, transparent 2.5px);
    background-size: 72px 72px, 72px 72px, 144px 144px;
    animation: drift 40s linear infinite alternate;
  }
  .glow {
    position: absolute;
    width: 1100px;
    height: 1100px;
    border-radius: 50%;
    will-change: transform, opacity;
  }
  .magenta {
    top: -520px;
    left: -380px;
    background: radial-gradient(circle, var(--glow-1), transparent 62%);
    animation: float-a 26s ease-in-out infinite alternate;
  }
  .cyan {
    top: -300px;
    right: -460px;
    background: radial-gradient(circle, var(--glow-2), transparent 62%);
    animation: float-b 32s ease-in-out infinite alternate;
  }
  .amber {
    bottom: -760px;
    left: 30%;
    background: radial-gradient(circle, var(--glow-3), transparent 60%);
    animation: float-c 38s ease-in-out infinite alternate;
  }
  @keyframes drift {
    from { transform: translate3d(-2%, -1.5%, 0); opacity: 0.55; }
    to { transform: translate3d(2%, 1.5%, 0); opacity: 0.9; }
  }
  @keyframes float-a {
    from { transform: translate3d(0, 0, 0) scale(1); opacity: 0.8; }
    to { transform: translate3d(260px, 180px, 0) scale(1.15); opacity: 1; }
  }
  @keyframes float-b {
    from { transform: translate3d(0, 0, 0) scale(1.1); opacity: 1; }
    to { transform: translate3d(-240px, 220px, 0) scale(0.95); opacity: 0.7; }
  }
  @keyframes float-c {
    from { transform: translate3d(-200px, 0, 0); opacity: 0.6; }
    to { transform: translate3d(220px, -120px, 0); opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .grid, .glow { animation: none; }
  }
</style>
