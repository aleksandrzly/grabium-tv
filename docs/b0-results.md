# B0 probe results (2026-09-23, Vega Virtual Device, SDK 0.24.9914)

Probe page: `FireTv/vega/assets/index.html`, app `com.grabium.tv`.

| Check | Result |
| :--- | :--- |
| WebView engine | Chromium 144 (`Kepler 1.2`, `wv`) |
| `RTCPeerConnection` | yes; canvas → pc1 → pc2 → `<video>` loopback renders live frames |
| MSE + H.264 | yes |
| Native HLS | `canPlayType` = "maybe"; public test stream plays |
| WebSocket | yes |
| Screen | 1920×1080 @1 |
| Remote keys | arrive as normal `keydown`/`keyup`: ArrowLeft=37, ArrowUp=38, Enter(OK)=13 |

Decision: stream over WHEP (same as Mini App), HLS stays as fallback.
Remote handling lives in the web bundle via plain key events; no RN key bridge needed.

Live check (same day, both machines ready):
- WHEP machine-02, STUN only: `connected`, 640x480, jitter buffer ~21 ms, ICE `srflx→srflx`.
  First frame ~4.8 s, mostly our 3 s ICE-gathering wait; trickle or a shorter wait will cut it.
- HLS machine-01: native HLS plays.
- Holding an arrow: repeated `keydown` (interval not measured) with `e.repeat === false`, one `keyup` on release.
  The client must dedupe itself (track held keys): send `L/R/U/D` once on first down, `S` on up.
- Back: `key=GoBack code=BrowserBack keyCode=27` reaches JS; the app does not close.
  We own Back navigation, and must exit the app ourselves from the lobby.

Tooling notes (friction log candidates):
- `console.*` from WebView does not reach `loggingctl log -v <pkg>`.
- `screenshooter /tmp/x.png` on VVD writes a 0-byte file and hangs the dev shell for a while.
- WebView on `file://` gets CORS-blocked on any API without CORS headers; we relay through RN `fetch` (bridge.ts).
- `window.ReactNativeWebView` is injected after the page starts running, so the first requests must wait for it.
- `vega run-app` / `vega device install-app` wipe the app's WebView storage on every install, so every dev build signs the tester out.
- RN `fetch` exposes `Set-Cookie` and keeps a cookie jar within a run. Whether the jar survives an app restart was not isolated (the first test also hit the bridge-timing bug), so the refresh cookie is carried by hand.
- RN `console.*` also does not show up in `loggingctl`; we verified server-side instead (the platform session table).
- The ≡ (Menu) key never reaches the WebView; it arrives only via RN `UserInputManager` (`MENU`).
- Registering any RN `UserInputManager` listener reroutes Back away from the WebView to RN, where the default handler backgrounds the app. Fix: RN claims `BACK` and `MENU` and replays them into the page as key events.
