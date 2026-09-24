# Kiro Crew task: win replays on the TV

This feature is built with **Kiro Crew** for the AWS Builder mini
challenge. The rules say Kiro Crew qualifies on its own, so no Bedrock call
is needed. Keep the Kiro spec that this produces (`.kiro/specs/...`) in the
repo: it is the evidence.

## 1. Set up Kiro Crew (≈10 min)

1. Go to https://kiro.dev, download Kiro (macOS) or Kiro Crew, and sign in
   with **GitHub**. No AWS account is needed.
2. Open the folder `FireTv/web` from this repo as the workspace.
3. Start a new **spec** (not a quick chat) and paste the prompt below.
4. Let Kiro write requirements, then design, then tasks. Read each one
   before you approve it, and ask it to change things you don't like.
5. When it has finished, run `npm run lint && npm run build`, then
   `npm run vega` to try it on the Vega Virtual Device.

## 2. Prompt to paste into Kiro

```
Add "watch the replay" for recent wins to the Grabium TV app in this folder
(Svelte 5, runes only, Vite, single-file build). It runs on a Fire TV (Vega
OS WebView) with a D-pad remote, and in a desktop browser with a keyboard.

Context in this codebase:
- src/components/WinsTicker.svelte shows the "Recent grabs" ticker in the
  lobby (src/screens/Lobby.svelte). Each win from /api/recent-wins has
  win_id, name, machine, machine_id, ts, has_replay.
- Replay clip URL: url(`/api/wins/${win_id}/replay?machine_id=${machine_id}`)
  (url() is in src/lib/config.js). It returns video/mp4 (H.264, 320x240,
  10 fps, about 30 s), or 404 JSON {"code":"replay_not_found"}. No auth needed.
  It is a plain <video src>, so no CORS bridge is needed.
- Remote input goes through listenRemote() in src/lib/remote.js. Actions:
  up/down/left/right/ok/back/menu. A listener that returns true consumes the
  key (and its repeats) for the other listeners; pass {capture: true} for an
  overlay. See src/components/Settings.svelte for an overlay that does this.
- Theme colours are CSS variables in src/app.css (--surface, --panel,
  --text, --muted, --live, --focus, --radius ...). Use them, no hard-coded
  colours.

Requirements:
1. In the lobby, pressing Down from the machine cards moves focus to the
   Recent grabs row. Left/Right moves between wins; only wins with
   has_replay are focusable and show a small play badge. Up returns to the
   cards. While the row has focus the ticker stops scrolling and the focused
   win is kept in view.
2. OK on a focused win opens a replay player overlay: a centred card of
   about 800x600 (not full screen, because the clip is only 320x240), with
   the video (autoplay, muted, no controls), a caption such as
   "🏆 Alex · Basket Ball · 2 d ago", and a hint "OK replay · Back close".
3. In the player: OK restarts the clip; Back closes it and returns focus to
   the same win. When the clip ends, show "Watch again" and wait for OK or
   Back. If the clip 404s or fails to load, show "Replay not available"
   and let Back close it.
4. Only animate transform and opacity (open: fade plus a slight scale). Honour
   prefers-reduced-motion.
5. The lobby keeps working exactly as before when no wins have replays.
6. Arcade wording stays: say "grab", never promise a prize.
7. Keep `npm run lint` and `npm run build` clean. Don't add dependencies.
```

## 3. After Kiro is done

- Tell me, and I review the diff: runes only, focus handling, remote
  edge cases, lint and build. Then I test it on the VVD and in the browser,
  and commit **including** the `.kiro/` folder.
- For the submission, AWS Builder:
  "The replay viewer (lobby → Recent grabs → replay player) was built with
  Kiro Crew from a spec (`.kiro/specs/…`): requirements, design and tasks
  generated and executed in Kiro, then reviewed and tested on the Vega
  Virtual Device."
