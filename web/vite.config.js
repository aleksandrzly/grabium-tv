import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { viteSingleFile } from "vite-plugin-singlefile";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// The Vega WebView loads the app from file:///pkg/assets/index.html, and
// Chromium refuses <script type="module" src> over file://. Inlining the whole
// bundle into one HTML file sidesteps that without a local web server.
const ORIGIN = process.env.GRABIUM_ORIGIN || "https://play.freeskillclaw.cc";
// Must match COACH_ORIGIN in FireTv/vega/src/bridge.ts (the bridge allowlist).
const COACH_ORIGIN = process.env.GRABIUM_COACH_ORIGIN || "https://coach.freeskillclaw.cc";
// Off until the coach runs on real Bedrock: canned lines must not be shown
// under an "AI coach" label. Build with GRABIUM_COACH=1 to turn it on.
const COACH_ENABLED = process.env.GRABIUM_COACH === "1";

export default defineConfig({
  plugins: [svelte(), viteSingleFile()],
  define: {
    __GRABIUM_ORIGIN__: JSON.stringify(ORIGIN),
    __GRABIUM_COACH_ORIGIN__: JSON.stringify(COACH_ORIGIN),
    __GRABIUM_COACH_ENABLED__: JSON.stringify(COACH_ENABLED),
    __APP_VERSION__: JSON.stringify(version),
    __APP_BUILT__: JSON.stringify(new Date().toISOString().slice(0, 10))
  },
  build: {
    outDir: "../vega/assets",
    emptyOutDir: false,
    target: "chrome120"
  },
  server: {
    // In the desktop browser the dev server proxies the edge so /api is
    // same-origin; the TV build talks to ORIGIN directly.
    proxy: {
      "/api": { target: ORIGIN, changeOrigin: true },
      "/cam": { target: ORIGIN, changeOrigin: true },
      "/ws": { target: ORIGIN.replace(/^http/, "ws"), ws: true, changeOrigin: true }
    }
  }
});
