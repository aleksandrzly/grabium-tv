<!--
  "Grabium" as a 3D, iridescent wordmark.
  - Depth: stacked copies of the text, offset down-right, form the extrusion.
  - Iridescence: the face gradient's stop colours cycle (a colour animation).
  - Shine: a light band slides across, clipped to the letters (transform).
  Only colour and transform animate, per AGENTS.md.
-->
<script>
  let { height = 96 } = $props();
  const DEPTH = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  const id = `wm${Math.random().toString(36).slice(2, 8)}`;
</script>

<svg class="wordmark" viewBox="0 0 480 124" style="height: {height}px" role="img" aria-label="Grabium">
  <defs>
    <linearGradient id="{id}-face" x1="0" y1="0" x2="1" y2="0.4">
      <stop class="s1" offset="0%" />
      <stop class="s2" offset="50%" />
      <stop class="s3" offset="100%" />
    </linearGradient>
    <linearGradient id="{id}-side" x1="0" y1="0" x2="0" y2="1">
      <stop class="side-top" offset="0%" />
      <stop class="side-bottom" offset="100%" />
    </linearGradient>
    <linearGradient id="{id}-shine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#fff" stop-opacity="0" />
      <stop offset="50%" stop-color="#fff" stop-opacity="0.75" />
      <stop offset="100%" stop-color="#fff" stop-opacity="0" />
    </linearGradient>
    <clipPath id="{id}-clip">
      <text x="6" y="88" class="glyphs">Grabium</text>
    </clipPath>
  </defs>

  <!-- extrusion, back to front -->
  {#each DEPTH as d (d)}
    <text x={6 + d * 0.8} y={88 + d * 0.9} class="glyphs" fill="url(#{id}-side)" opacity={1 - d * 0.04}>Grabium</text>
  {/each}
  <!-- face -->
  <text x="6" y="88" class="glyphs face" fill="url(#{id}-face)">Grabium</text>
  <!-- thin top highlight -->
  <text x="6" y="87" class="glyphs rim">Grabium</text>
  <!-- moving shine, clipped to the letters -->
  <g clip-path="url(#{id}-clip)">
    <rect class="shine" x="-160" y="0" width="140" height="118" fill="url(#{id}-shine)" />
  </g>
</svg>

<style>
  .wordmark { display: block; width: auto; overflow: visible; }
  .glyphs {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 104px;
    font-weight: 900;
    letter-spacing: -3px;
  }
  /* Colours come from the theme (app.css --wm-*), so the mark suits Dark,
     Parlor Light and Candy Toy alike. */
  .face { filter: drop-shadow(0 0 16px var(--wm-glow)); }
  .wordmark { filter: drop-shadow(0 12px 16px var(--wm-shadow)); }
  .rim { fill: none; stroke: var(--wm-rim); stroke-width: 1; }
  .side-top { stop-color: var(--wm-side-top); }
  .side-bottom { stop-color: var(--wm-side-bottom); }
  .s1 { stop-color: var(--wm-a1); animation: hue1 7s ease-in-out infinite; }
  .s2 { stop-color: var(--wm-b1); animation: hue2 7s ease-in-out infinite; }
  .s3 { stop-color: var(--wm-c1); animation: hue3 7s ease-in-out infinite; }
  .shine { animation: sweep 4.8s ease-in-out 1s infinite; }
  @keyframes hue1 {
    0%, 100% { stop-color: var(--wm-a1); }
    50% { stop-color: var(--wm-a2); }
  }
  @keyframes hue2 {
    0%, 100% { stop-color: var(--wm-b1); }
    50% { stop-color: var(--wm-b2); }
  }
  @keyframes hue3 {
    0%, 100% { stop-color: var(--wm-c1); }
    50% { stop-color: var(--wm-c2); }
  }
  @keyframes sweep {
    0%, 55% { transform: translateX(0); }
    100% { transform: translateX(660px); }
  }
  @media (prefers-reduced-motion: reduce) {
    .s1, .s2, .s3, .shine { animation: none; }
  }
</style>
