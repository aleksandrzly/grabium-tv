# Demo video script: Grabium TV (target 2:45, hard limit 3:00)

Rules this follows (Devpost): under 3 minutes, English, public on
YouTube/Vimeo, shows the app **running on the Vega Virtual Device**, no
third-party trademarks or copyrighted music. Judges may stop at 3:00, so
the best material comes first.

## Before recording

1. Machine **Basket Ball** (machine-02) is `Open now`, and the camera is
   on and lit. Use Basket Ball on camera: the plush toys in Lucky Claw may
   be licensed characters (third-party trademarks).
2. VVD running the latest build (`cd FireTv/web && npm run vega`), theme
   **Grabium Dark**, **Music Off** (the background track's licence is
   unknown). Sound effects can stay on.
3. Sign in **before** recording, with a player that has credits. The sign-in
   screen is shown later as a short cut, not typed live.
4. Recorder: QuickTime (File > New Screen Recording > window) or OBS at
   1920x1080, 30 fps. Record the VVD window, including the on-screen remote,
   so viewers see the buttons being pressed.
5. Second capture for the MCP part: MCP Inspector
   (`npx @modelcontextprotocol/inspector`) connected to
   `https://mcp.freeskillclaw.cc/mcp` (Streamable HTTP).
6. Record the voice separately (a quiet room, a phone is fine) and lay it
   over the footage. It is easier to hit the timings than talking live.

## Shots

| Time | On screen | Voice-over (English) |
| :--- | :--- | :--- |
| 0:00–0:08 | Launch Grabium on the VVD: the neon logo fills in, then the lobby | "This is Grabium: real claw machines you play live from your TV." |
| 0:08–0:20 | Lobby. Press ▶ onto Basket Ball, and hold a beat on the live preview cards, wallet and weekly board | "Every card is a live camera on a real cabinet. Pick one with the remote." |
| 0:20–0:30 | OK. The play screen opens, and live WebRTC video fills the left side | "The stream is WebRTC, played straight in the Vega WebView." |
| 0:30–1:05 | OK to start. The timer counts down. **Hold** the arrows to steer, then OK to drop. The claw goes down, grabs and lifts | "Hold an arrow and the real claw moves; let go and it stops. Press OK to drop. What you see is what's happening in the cabinet right now." |
| 1:05–1:15 | Result card ("Great grab!" or "So close!"). The wallet ticks down by one | "Rounds cost credits, and new players get ten free ones. It's an arcade: grabs count on the weekly board, no prizes are shipped." |
| 1:15–1:25 | Back to the lobby. Press ≡: Settings slide in. Switch theme to Parlor Light and back | "The Menu button opens settings: sound, themes, account, and QR codes for the rules." |
| 1:25–1:35 | Quick cut of the sign-in screen (pre-recorded) | "Sign-in is a one-time email code, the same Grabium account as on the web." |
| 1:35–2:05 | MCP Inspector: list tools, then call `list_machines` and `machine_status` ("basket ball"); show the `say` text | "For Alexa+, a read-only MCP server over Streamable HTTP answers questions like 'which machine is free?' and 'who's winning this week?'. Voice can't move a claw; that needs a player watching the camera." |
| 2:05–2:25 | The browser at `tv.freeskillclaw.cc`, the same lobby; open a machine | "Judges without a Fire TV can try the same app in a browser." |
| 2:25–2:45 | The GitHub repo: README, then `docs/friction-log.md` | "Everything here, the Vega app, the TV UI and the MCP server, was built during the hackathon. It's open source, with a 17-entry friction log on building for Vega." |
| 2:45–2:50 | The lobby again, with the logo | "Grabium. Grab something real." |

## Keep in mind

- Show the remote presses. Hovering or clicking the VVD remote on screen
  makes it obvious that it runs on the device.
- If a round fails on camera (a busy machine, a refusal), cut and retake;
  do not narrate over errors.
- Do not show the email address or wallet history in close-ups. Blur the
  "Signed in as" line in the lobby footer.
- Do not claim the AI coach in the video: it is switched off until Bedrock
  access works (friction log #13–#14).
- Export 1080p, upload to YouTube as **Public** (not Unlisted), in English,
  and put the link in the Devpost form.
