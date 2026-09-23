<script>
  import { encode } from "uqr";

  let { value, size = 240 } = $props();

  // Drawn as one SVG path of dark modules on a white quiet zone, so it scans
  // in every theme (a themed dark background would break some readers).
  const qr = $derived(encode(value, { ecc: "M", border: 2 }));
  const path = $derived.by(() => {
    let d = "";
    qr.data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`;
      })
    );
    return d;
  });
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 {qr.size} {qr.size}"
  shape-rendering="crispEdges"
  role="img"
  aria-label={value}
>
  <rect width={qr.size} height={qr.size} fill="#fff" />
  <path d={path} fill="#000" />
</svg>

<style>
  svg { display: block; border-radius: 12px; }
</style>
