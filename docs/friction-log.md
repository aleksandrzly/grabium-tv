# Friction log: Grabium on Fire TV (Vega OS)

Project: Grabium TV. It streams a real, remotely controlled claw machine to a
Vega OS app, and you play it with the TV remote. The app is a Svelte web UI
inside the Vega `vegaWebview` template, with a small React Native shell.

Environment: macOS 26.6 (Apple Silicon), Vega SDK 0.24.9914, Vega Virtual
Device (Kepler 1.2, WebView Chromium 144), RN 0.83 template. All entries are
from 2026-09-23 unless marked otherwise.

Severity scale: **Critical** (blocks the product), **High** (costs hours or
breaks a core flow silently), **Medium** (costs an hour or needs a
workaround), **Low** (annoyance).

At a glance:

| # | Area | Severity | One line |
| :- | :--- | :--- | :--- |
| 1 | Input | Critical | Adding any RN input listener reroutes Back away from the WebView and the app backgrounds itself |
| 2 | Input | High | The ≡ (Menu) key never reaches the WebView |
| 3 | Debugging | High | WebView and RN `console.*` do not show up in `loggingctl` on the VVD |
| 4 | Networking | High | The WebView on `file://` is CORS-blocked by any API that sends no CORS headers |
| 5 | Dev loop | Medium | Every install wipes the app's WebView storage, so the tester is signed out on every build |
| 6 | WebView bridge | Medium | `window.ReactNativeWebView` is not there yet when the page's first code runs |
| 7 | Input | Medium | A held D-pad key auto-repeats `keydown` with `event.repeat === false` |
| 8 | Packages | Medium | `vega project install` refuses AsyncStorage as "out of profile" without saying which profile fits |
| 9 | Debugging | Medium | `screenshooter` on the VVD writes a 0-byte PNG and stalls the dev shell |
| 10 | Onboarding | Low | The SDK installer is hard to find: the link sits in body text, behind sign-in |
| 11 | CLI | Low | `vega virtual-device start` prints `vvman` errors and a different SDK version on every run |
| 12 | Input | Low | Back arrives as `GoBack` / `BrowserBack` / keyCode 27, and nothing documents it |
| 13 | AWS account | High | A new-experience AWS "project" lists Bedrock models as available, but every call fails (403 / zero quotas) until "advanced features" are activated |
| 14 | AWS account | Medium | The Anthropic use-case form on Bedrock fails with "not authorized" and points to Support instead of the real cause |
| 15 | CLI | Low | `vega run-app <file>.vpkg` fails outside a project folder ("Couldn't find manifest.toml") |

---

## 1. Adding any RN input listener reroutes Back and backgrounds the app

- **Task:** Open a settings panel with the remote's ≡ button, and close it
  with Back.
- **Steps:** Added `useAddUserInputListenerCallback()` in the RN shell and
  subscribed to `UserInputEventName.Menu` to forward ≡ into the WebView
  (see entry 2). Rebuilt and ran it on the VVD.
- **Expected:** Only Menu changes. Back keeps arriving in the WebView as
  before, as `keydown` `GoBack`, which the page already handled.
- **Actual:** From then on Back never reached the page on any screen. The
  default handler put the app in the background instead, and reopening it
  showed the exact screen we had left. Before this change, Back from the game
  screen went back to the lobby correctly on the same device.
  `BackHandler.addEventListener('hardwareBackPress', () => true)` alone did
  not stop it.
- **Severity:** Critical. It silently breaks navigation for the whole app.
  It took three rebuilds to see that Menu handling was the trigger, not the
  settings panel.
- **Workaround:** Claim `UserInputEventName.Back` in RN as well (return
  `true`), and replay both keys into the page with
  `injectJavaScript("window.dispatchEvent(new KeyboardEvent(...))")`.
- **Suggestion:** Document that subscribing to one key moves key routing from
  the WebView to RN, or better, keep the routing per key. Alternatively, give
  `@amazon-devices/webview` a prop that forwards Menu (and other TV keys) to
  the page as DOM key events.

## 2. The ≡ (Menu) key never reaches the WebView

- **Task:** Open settings with ≡, the usual Fire TV pattern.
- **Steps:** Listened for `keydown` in the page and mapped `ContextMenu`,
  `Menu`, `MediaContextMenu` and keyCodes 82 and 93. Also added an on-screen
  readout of every unmapped key.
- **Expected:** Some DOM key event for ≡, the way arrows, OK and Back arrive.
- **Actual:** No DOM event of any kind, even with `allowSystemKeyEvents` set
  on the WebView.
- **Severity:** High. You cannot build a normal TV settings entry point in a
  web app without native code.
- **Workaround:** Catch `UserInputEventName.Menu` in RN and replay it into the
  page, which leads straight into entry 1.
- **Suggestion:** Forward Menu, Info, PlayPause and the other remote keys to
  the WebView as `keydown`/`keyup` with documented `key` values, or list in
  the WebView docs which remote keys the page receives and which it does not.

## 3. WebView and RN console output does not show up in device logs

- **Task:** Debug the web app and the RN bridge on the Virtual Device.
- **Steps:**
  1. Logged with `console.info('[probe] ...')` in the page and
     `console.warn('[bridge] ...')` in RN.
  2. Read logs with
     `vega device run-cmd -c 'loggingctl log -v com.grabium.tv'` and a plain
     `loggingctl log | grep`.
- **Expected:** Page and RN console lines in the app's log stream.
- **Actual:** Neither shows up. Only native lines appear (Chromium GPU
  errors, media metrics).
- **Severity:** High. Each question took a rebuild plus a screenshot from a
  human. To prove that token refresh worked, we had to query our own
  server's database.
- **Workaround:** A probe page that prints results on screen. We also checked
  results on the server side.
- **Suggestion:** Pipe WebView and Hermes console output into `loggingctl`
  under the package id, or document the supported remote-inspect path for the
  WebView (Chrome DevTools or similar), which we could not find.

## 4. The WebView on `file://` is CORS-blocked by our own API

- **Task:** Load machine lists and sign in from the bundled page
  (`file:///pkg/assets/index.html`, the template default).
- **Steps:** Called `fetch('https://<our-edge>/api/machines')` from the page.
- **Expected:** The same result as in a desktop browser opened on our domain.
- **Actual:** The page's origin is `file://` / `null`, so every API without
  `Access-Control-Allow-Origin` is blocked. Our WHEP video endpoint already
  sends CORS, so the video worked while the JSON did not. That made the
  failure confusing at first.
- **Severity:** High. Any existing web product that moves to Vega hits this.
- **Workaround:** A small allowlisted relay: the page posts requests to RN
  with `window.ReactNativeWebView.postMessage`, RN `fetch` (which has no CORS)
  calls the API, and `injectJavaScript` returns the response. We did not
  have to change the backend.
- **Suggestion:** In the `vegaWebview` template, explain the `file://` origin
  and the choices for APIs: host the page on your own origin, add CORS, or use
  a bridge like the one above. A WebView option to give bundled pages a real
  origin would remove the problem.

## 5. Every install wipes WebView storage

- **Task:** Iterate on the app while staying signed in.
- **Steps:** Signed in (the token was saved in `localStorage`), rebuilt, then
  installed with `vega run-app ...vpkg`. We also tried
  `vega device install-app -p ...vpkg` over the existing install.
- **Expected:** An update install keeps app data, as a real update would.
- **Actual:** After either command the app starts signed out.
  `terminate-app` + `launch-app` without an install keeps the data.
- **Severity:** Medium. Every UI tweak forced a new email sign-in code. It
  also hid a real refresh bug for a while, because every test began from a
  wiped state.
- **Workaround:** Relaunch with `vega device terminate-app` +
  `launch-app` when only testing session behaviour.
- **Suggestion:** A `--keep-data` flag, or keep data when the package id and
  signing key match, and say which behaviour applies in the CLI output.

## 6. `window.ReactNativeWebView` is not there yet at startup

- **Task:** Refresh the sign-in token as soon as the app starts.
- **Steps:** The page checked `window.ReactNativeWebView?.postMessage` on its
  first run to decide between the RN bridge and plain `fetch`.
- **Expected:** The bridge object is ready before page scripts run, since
  `onMessage` is set on the WebView.
- **Actual (our reading):** At that moment it was not ready. The startup
  request fell back to plain `fetch`, failed on CORS (entry 4) without a
  visible error, and the session never refreshed. It worked once the page
  waited for the object to appear (up to 3 s, polling every 50 ms).
- **Severity:** Medium.
- **Workaround:** Poll for the object when the user agent says `Kepler`.
- **Suggestion:** Document when the bridge is injected, or fire an event
  such as `ReactNativeWebViewReady`.

## 7. A held D-pad key auto-repeats with `event.repeat === false`

- **Task:** Move the claw while an arrow is held, and stop when it is let go.
- **Steps:** Logged `keydown`/`keyup` with `e.repeat` while holding an arrow
  for 3 s.
- **Expected:** One `keydown`, then repeats with `repeat: true`, then
  `keyup`.
- **Actual:** Many `keydown` events, all with `repeat: false`, then one
  `keyup`.
- **Severity:** Medium. Code that trusts `repeat` sends a new command for
  every repeat, and an overlay closed by the first press passes the repeats
  down to the screen beneath it.
- **Workaround:** Keep our own set of held keys, and hold a consumed key with
  the layer that took it until `keyup`.
- **Suggestion:** Set `repeat: true` on auto-repeat, as desktop Chromium does.

## 8. `vega project install` refuses AsyncStorage without saying why

- **Task:** Add persistent native storage to the RN shell.
- **Steps:**
  `vega project install @amazon-devices/react-native-async-storage__async-storage`.
- **Expected:** A version compatible with the project's OS 1.2 / RN 0.83 is
  installed, or a list of the combinations that are supported.
- **Actual:** "no packages to install (all requested packages were unknown or
  out of profile)". Meanwhile `npm view` lists a `2.1.9000000000-rn-83`
  version.
- **Severity:** Medium.
- **Workaround:** None used; we avoided native storage.
- **Suggestion:** Say which OS / RN profiles the package supports and which
  version would fit the current project.

## 9. `screenshooter` writes an empty file on the VVD

- **Task:** Take screenshots of the VVD from the CLI for automated checks.
- **Steps:** `vega device run-cmd -c 'screenshooter /tmp/shot.png'`, then
  `vega device copy-from`.
- **Expected:** A PNG of the screen.
- **Actual:** A 0-byte file, and the next commands failed with "No running
  instances of com.amazon.dev.shell.service" until the device shell recovered.
- **Severity:** Medium. Without it we could not automate visual checks.
- **Workaround:** A human took screenshots of the VVD window.
- **Suggestion:** A `vega device screenshot` command that works on the VVD.

## 10. The SDK installer is hard to find

- **Task:** Install the Vega SDK.
- **Steps:** Browsed the Fire TV and Vega sections of developer.amazon.com,
  then read "Install the Vega SDK".
- **Expected:** A clear download button.
- **Actual:** The only way in is the inline link "Vega SDK installer"
  (`/kepler/open/sdk`) in the body text, and it only works after sign-in.
  Our team member could not find it without help.
- **Severity:** Low.
- **Suggestion:** A visible "Download SDK" button at the top of the install
  page, with a note that sign-in is required.

## 11. `vega virtual-device start` prints confusing warnings

- **Task:** Start the VVD.
- **Steps:** `vega virtual-device start`.
- **Expected:** Quiet success.
- **Actual:** It works, but every run prints
  `vvman command not found or failed` and "SDK version 0.200.0" for a
  0.24.9914 install. We spent time checking whether the install was broken.
- **Severity:** Low.
- **Suggestion:** Hide these fallback lines unless `--verbose` is set, or
  make the two version numbers agree.

## 12. The Back key's DOM identity is undocumented

- **Task:** Handle Back in the page.
- **Steps:** Logged the key event.
- **Actual:** `key=GoBack`, `code=BrowserBack`, `keyCode=27`. Because
  keyCode 27 is Escape's, code that switches on keyCode treats Back as
  Escape.
- **Severity:** Low.
- **Suggestion:** A table in the WebView docs of remote button → `key` /
  `code` / `keyCode`.

## 13. Bedrock looks available in a new-experience project, but is not

- **Task:** Call Claude, then Amazon Nova, on Bedrock from our AI coach.
- **Steps:**
  1. Signed up with the "new AWS experience" and created a project
     (eu-north-1).
  2. Signed in the CLI with `aws login`.
  3. Ran `aws bedrock list-foundation-models`, which listed Claude, OpenAI
     and Nova models.
  4. Called Claude Opus 5 through the Anthropic SDK's Bedrock (Mantle)
     client, and Nova 2 Lite through `converse`.
- **Expected:** Either the calls work, or the catalog says up front that
  this account cannot use the models.
- **Actual:**
  - Claude returned `403 ... is not available for this account`.
  - Nova on-demand said to use an inference profile. The
    `eu.amazon.nova-2-lite-v1:0` profile then returned
    `ThrottlingException: Too many tokens per day` on the very first call.
  - Service Quotas shows 0 for every Nova tokens-per-minute and per-day
    quota.
  - `get-foundation-model-availability` reports `NOT_AUTHORIZED` for every
    model, while the region and the entitlement are `AVAILABLE`.
  - The real cause showed up only in the console home:
    "Service Amazon Bedrock (mantle endpoint) unavailable. Activate
    advanced features to access this service."
- **Severity:** High. Finding the cause took several API calls, a quota audit and a Support
  assistant session to find the actual cause.
- **Workaround:** None without activating advanced features (a billing
  decision), so the coach ships with a canned fallback and switches to
  Bedrock through one `.env` line.
- **Suggestion:** Have the Bedrock catalog, `list-foundation-models`, and
  the 403 / throttling errors say "not available in this AWS experience;
  activate advanced features", with a link. A zero daily quota should not
  surface as "too many tokens per day".

## 14. The Anthropic use-case form fails with a misleading error

- **Task:** Submit Anthropic's one-time use-case details in the Bedrock
  model catalog.
- **Steps:** Filled in company, website, industry, intended users and the
  use case, then pressed "Submit use case details".
- **Expected:** The form is accepted, or it explains why it can't be.
- **Actual:** "Your account is not authorized to perform this action. Please
  create a support case." The Support assistant then looked at suspension
  and payment verification, and offered no recommendation. The cause was
  the same as entry 13.
- **Severity:** Medium.
- **Suggestion:** Detect the new-experience restriction and say so on the
  form, instead of sending people to Support.

## 15. `vega run-app` with a package path needs a project folder

- **Task:** Tell testers how to install our released `.vpkg` on their Vega
  Virtual Device.
- **Steps:** Downloaded `grabiumtv_aarch64.vpkg` into an empty folder and
  ran `vega run-app grabiumtv_aarch64.vpkg`.
- **Expected:** Install and launch, since the package path is given.
- **Actual:** "Couldn't find manifest.toml file from /tmp/grabium-release".
  The same command works from inside the project.
- **Severity:** Low, but it breaks the obvious instructions for anyone
  installing a released package.
- **Workaround:** `vega device install-app -p <file>.vpkg`, then
  `vega device launch-app -a <app id>`.
- **Suggestion:** When given a `.vpkg`, read the app id from the package
  itself.

---

## What worked well

- **WebRTC in the WebView just works.** A WHEP stream from our MediaMTX
  server played in the WebView without TURN (ICE `srflx→srflx`, about 21 ms
  jitter buffer). That made live-camera play on a TV possible with the code
  we already had.
- **The `vegaWebview` template** got a web app on screen in minutes, and
  `vega run-app` builds and installs quickly.
- **The D-pad and OK arrive as standard DOM key events**, so a web UI can
  handle focus without native code.
- **The VVD remote** is easy to use for manual testing.
