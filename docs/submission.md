# Devpost submission draft: Grabium TV

Copy each section into the matching Devpost field. Everything here is
factual as of 2026-09-24; update the numbers if they change before
submitting.

---

## Project name

Grabium TV

## Tagline (≤ 200 chars)

Play a real claw machine from your couch: live WebRTC video on Fire TV
(Vega OS), steered with the remote. It comes with an Alexa+ MCP server for
machine status by voice.

## Tracks and mini challenges

- **Primary track:** Fire TV (Vega OS)
- **Mini challenges:** Open Source, AWS Builder (Kiro Crew)

## Links

- Code (MIT): https://github.com/aleksandrzly/grabium-tv
- Try in a browser: https://tv.freeskillclaw.cc
- Vega packages: https://github.com/aleksandrzly/grabium-tv/releases
- Alexa+ MCP server (Streamable HTTP): https://mcp.freeskillclaw.cc/mcp
- Demo video: *(YouTube link)*

---

## Description

### Inspiration

Grabium runs real claw machines that people play remotely. The cabinets
stream live, and a player steers a physical claw over the internet. So far
that happened on phones, in a Telegram Mini App. A claw machine belongs on a
big screen, though, and a TV remote's D-pad is a natural joystick. We wanted
the living-room version.

### What it does

- **Lobby.** It shows every cabinet as a live card with its status, game
  mode, viewer count and line length. A side panel has the weekly board, the
  weekly challenge and how to play, and a ticker scrolls the latest grabs.
- **Play.** OK opens a machine and live WebRTC (WHEP) video fills the
  screen. Holding an arrow moves the real claw and letting go stops it. OK
  drops the claw once. The result, the round timer and the wallet update
  live.
- **Account.** The player signs in with a one-time email code, the same
  Grabium account as on the web. New players get 10 free credits (one round
  each) plus free daily Classic plays. It is an arcade: grabs count on the
  weekly board, no prizes are shipped, and the app says so wherever prizes
  would appear.
- **Settings (the ≡ button).** Sound, music, three themes (Grabium Dark,
  Parlor Light, Candy Toy), account and sign-out, QR codes for the rules,
  and the version.
- **Alexa+ MCP server.** A read-only server answers "which machine is free?",
  "what's on Basket Ball?", "who's winning this week?" and "how do I play Free
  Drop?". Every answer carries a ready-to-speak `say` line. Voice cannot move
  a claw: a round needs a signed-in player who is watching the camera.
- **Win replays.** In the lobby, Down moves to the Recent grabs row; any
  grab with a clip shows a play badge, and OK plays the real camera replay
  of that grab.
- **Browser build.** Judges without a Fire TV can play the same UI at
  tv.freeskillclaw.cc: arrows move, Enter is OK, Esc is Back.

### How we built it

- **Vega OS app.** Amazon's `vegaWebview` template (React Native 0.83 on
  Kepler) hosts a Svelte 5 TV UI, bundled into a single HTML file so that
  it loads from `file://` without a local server.
- **A small React Native bridge**, which does three jobs:
  - It relays HTTP from the WebView. The page runs on `file://`, so our
    APIs, which send no CORS headers, would be blocked; RN `fetch` has no
    CORS. An allowlist limits it to our own routes.
  - It carries the sign-in refresh credential.
  - It replays the remote's Menu and Back keys into the page, because Vega
    delivers them to RN, not to the WebView.
- **Video** is WHEP (WebRTC) straight into the WebView, falling back to HLS.
  On the Vega Virtual Device it connected without TURN.
- **Controls** reuse the protocol of our existing web client over a
  WebSocket. A held direction is re-sent every 100 ms as a dead-man switch
  and released with a safe stop. We track held keys ourselves, because Vega
  auto-repeats `keydown` with `repeat: false`.
- **MCP server:** the official Python `mcp` SDK, Streamable HTTP (protocol
  2025-11-25, and 2026-07-28 when the client offers it), stateless, every
  tool annotated `readOnlyHint`. It runs in Docker behind a Cloudflare
  tunnel.
- **Replay viewer, built with Kiro Crew:** we wrote the feature request,
  Kiro generated a spec (`.kiro/specs/replay-viewer/`: requirements,
  design and tasks). We reviewed it and changed six points, including
  moving the ticker with transforms instead of `scrollIntoView` and
  making Back return to the cards instead of exiting. Kiro then
  implemented the tasks, and a review caught one bug (a paused CSS
  animation overriding the inline transform), which Kiro fixed.
- **AI coach:** a small aiohttp service that sends the current camera frame
  to Claude on Amazon Bedrock (Anthropic SDK, Mantle client) for a one-line
  aiming tip and a round recap. Answers are shared per machine for a few
  seconds, requests are rate-limited, and the service fails soft. It is
  built, tested and deployed, but switched off; see Challenges.

### Challenges we ran into

We logged all of these in a 17-entry friction log (`docs/friction-log.md`).
The biggest:
- **Adding an RN input listener for the Menu key silently rerouted Back
  away from the WebView**, and the app backgrounded itself from every
  screen.
- **No console output from the WebView or RN in device logs**, so we
  debugged with an on-screen probe page and with server-side checks.
- **`file://` origin and CORS**, solved with an allowlisted bridge instead of
  changing the backend.
- **Every dev install wipes WebView storage**, which masked a real sign-in
  refresh bug for a while.
- **Bedrock in a new-experience AWS project:** models are listed as
  available, but every call fails (403, zero quotas) until "advanced
  features" are activated. So the AI coach ships switched off rather than
  pretending with canned lines.

### Accomplishments that we're proud of

- A full, playable round of a physical claw machine from a TV remote on the
  Vega Virtual Device: live video, steering, drop and result.
- A safe split of responsibilities: voice can only read, a round needs a
  signed-in player who sees the camera, and the arcade economy never
  promises prizes.
- None of our existing backend had to change: the TV is a new client and
  new services only.

### What we learned

- Vega's WebView is a capable Chromium, and WebRTC just works in it. The
  friction is at the edges: key routing, logs, origin and storage.
- Building an honest friction log while you build is cheap, and it made
  the Bedrock dead end easy to explain.

### What's next for Grabium TV

- Test on a physical Fire TV stick and publish to the Appstore.
- Turn the AI coach on once Bedrock access is sorted.
- Sign in with a code shown on the TV and confirmed on a phone, instead of
  typing an email with the remote.
- Hook the MCP server into Alexa+ once there is access.

### Built during the hackathon

Grabium's platform (the edge server, machine firmware and the Telegram
Mini App) existed before the hackathon and was not changed for it.
Everything in the repository was built during the submission window,
starting on 2026-09-23:
- the Vega OS app and its RN bridge;
- the Svelte TV UI;
- the browser build and its host;
- the MCP server;
- the AI coach service;
- the friction log.

### Built with

Vega SDK · Vega Virtual Device · React Native (Kepler) · @amazon-devices/webview ·
Svelte 5 · Vite · WebRTC (WHEP) · HLS · TypeScript · JavaScript · Python ·
aiohttp · MCP Python SDK · Anthropic SDK · Amazon Bedrock · AWS CLI ·
Docker · nginx · Cloudflare Tunnel

---

## Testing instructions (for judges)

1. **Easiest: in a browser.** Go to https://tv.freeskillclaw.cc. Arrows
   choose, Enter opens a machine, Esc goes back and M opens settings.
2. **On Vega:** download `grabiumtv_aarch64.vpkg` (Virtual Device on Apple
   Silicon) or `grabiumtv_x86_64.vpkg` from Releases, then run
   `vega device install-app -p grabiumtv_<arch>.vpkg` and
   `vega device launch-app -a com.grabium.tv.main`.
3. **To play:** open a machine and press OK. Sign in with any email; the
   code arrives by email (our sending domain is new, so please check your
   **Spam** folder; the code is in the subject line). New accounts get 10
   free credits. The machines
   are real cabinets, so a round moves a real claw you watch live.
4. **MCP:** in MCP Inspector, connect with Streamable HTTP to
   https://mcp.freeskillclaw.cc/mcp and run `list_machines`.

If a machine shows "Taking a break", the cabinet is being serviced; try the
other one.

---

## Product feedback

**Vega SDK and CLI (`vega`)**
- *Used for:* creating the project from `vegaWebview`, building, installing,
  device logs and screenshots.
- *Worked well:* the template ran within minutes, and `vega run-app` is fast.
- *Needs work:*
  - `vega virtual-device start` prints `vvman` errors and a different SDK
    version on every run.
  - Installs wipe app storage.
  - `screenshooter` writes empty files on the VVD.
  - `vega project install` refuses AsyncStorage as "out of profile" without
    saying which profile fits.
- *Onboarding:* the SDK installer link is only in the body text, behind
  sign-in, and was hard to find.
- *Build with it again?* Yes.

**Vega Virtual Device**
- *Used for:* all development and the demo.
- *Worked well:* it is fast to boot, the on-screen remote is handy, and
  WebRTC and HLS play.
- *Needs work:*
  - We found no way to see WebView or RN console output.
  - The screenshot tool failed.
- *Build with it again?* Yes.

**@amazon-devices/webview and the `vegaWebview` template**
- *Used for:* hosting the whole TV UI.
- *Worked well:* it is a capable Chromium 144 with WebRTC, MSE and native
  HLS, and D-pad keys arrive as DOM events.
- *Needs work:*
  - `window.ReactNativeWebView` is not ready at the page's first script.
  - The Menu key never reaches the page.
  - Registering an RN input listener reroutes Back.
  - The `file://` origin runs into CORS; this deserves a paragraph in the
    template README.
- *Build with it again?* Yes, for web-first teams it is the fastest path to
  Vega.

**React Native for Vega (`UserInputManager`, `BackHandler`)**
- *Used for:* catching the Menu and Back keys and exiting from the lobby.
- *Worked well:* the APIs are small and clear.
- *Needs work:* it is undocumented that subscribing to one key changes where
  other keys go.

**AWS CLI (`aws login`) and the Agent Toolkit setup**
- *Used for:* signing in to our AWS project from the terminal for Bedrock
  checks.
- *Worked well:* browser sign-in with no access keys, and 12-hour sessions
  renewable for 90 days.
- *Needs work:* profiles from `aws login` need `botocore[crt]` in Python
  apps, and the error only says so at call time.

**Kiro Crew**
- *Used for:* the win replay viewer, from spec to implementation, in our
  Svelte TV app.
- *Worked well:* the spec-first flow (requirements, design, tasks) made it
  easy to review the plan before any code was written, and it followed our
  existing patterns (runes, theme variables, the remote-key handler).
- *Needs work:* the first design proposed `scrollIntoView` on a
  transform-animated list, and pausing a CSS animation to apply an inline
  transform. Both were caught in review, not by the tool.
- *Onboarding:* quick: GitHub sign-in, no AWS account needed.
- *Build with it again?* Yes, for well-scoped UI features.

**Amazon Bedrock**
- *Used for:* the AI coach (Claude, vision, through the Anthropic SDK's
  Bedrock Mantle client), and a fallback test with Amazon Nova through
  `converse`.
- *Worked well:* the SDK integration was straightforward.
- *Needs work:* in a new-experience project the catalog and
  `list-foundation-models` show models as available, but calls fail with
  403 or "Too many tokens per day" because quotas are 0. The Anthropic
  use-case form fails with "not authorized", and the real cause appears
  only on the console home page: "activate advanced features".
- *Onboarding:* confusing, and the main reason the coach is not live.
- *Build with it again?* Yes, once account access is clear.

---

## Feature requests (optional)

| Request | Why | Urgency |
| :--- | :--- | :--- |
| Forward all remote keys (Menu, Info, media) to the WebView as DOM events | web apps can't build a normal settings entry without native code | important |
| WebView and RN console output in `loggingctl`, or a documented remote inspector | debugging a WebView app on the VVD is slow | critical |
| `--keep-data` for `vega run-app` / `install-app` | every build signs testers out | important |
| Bedrock: say "not available in this AWS experience" in the catalog and in errors | a 403 or zero quota with no reason cost hours | important |

## Open Source mini challenge

- **Contribution URL:** https://github.com/aleksandrzly/vega-webview-bridge
- **Project repository:** https://github.com/aleksandrzly/grabium-tv
- **GitHub username:** aleksandrzly
- **What we did:** we published `vega-webview-bridge`, a new MIT-licensed
  library that packages the fixes we needed to run a web app well inside
  the Vega OS WebView. It lets any team using the `vegaWebview` template:
  - call APIs without CORS headers, through an allowlisted relay over React
    Native `fetch`;
  - receive the remote's Menu and Back keys in the page, since Vega delivers
    them to React Native, and registering one listener reroutes Back and
    backgrounds the app;
  - avoid a startup race on `window.ReactNativeWebView`;
  - optionally carry one session cookie across restarts.

  It has tests for the allowlist, header filtering, cookie carry and script
  escaping, and its example typechecks against the Vega SDK types. It
  matters because each of these cost us hours (friction log #1, #2, #4,
  #6), and they will hit every web-first team moving to Vega.
