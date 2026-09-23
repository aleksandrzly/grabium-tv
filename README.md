# Grabium TV

Play a **real claw machine** from your couch. Grabium streams live cabinets
over WebRTC, and this app turns a Fire TV into the controller: the D-pad
steers the claw and OK drops it.

Built for the Amazon Developer Hackathon 2026 (Fire TV track, plus the AWS
Builder and Alexa+ MCP extras).

| Part | Folder | What it is |
| :--- | :--- | :--- |
| TV app | [`web/`](web) | Svelte 5 UI for a 10-foot screen: lobby, live stream, remote play, sign-in, settings |
| Vega OS shell | [`vega/`](vega) | React Native app from Amazon's `vegaWebview` template: WebView, HTTP bridge, remote key routing |
| AI coach | [`ai-coach/`](ai-coach) | Claude on **Amazon Bedrock** looks at the camera frame and gives a one-line aiming tip and a round recap |
| Alexa+ MCP server | [`mcp-server/`](mcp-server) | Read-only MCP server (Streamable HTTP, protocol 2025-11-25+): machine status, recent grabs, weekly board, coach tips by voice |
| Notes | [`docs/`](docs) | [Friction log](docs/friction-log.md), device probe results, the probe page |

## How it fits together

```
 Fire TV (Vega OS)                              Grabium service (not in this repo)
 ┌──────────────────────────────┐
 │ vega/  React Native shell    │  HTTP relay   ┌─────────────────────────────┐
 │  ├─ WebView ── web/ bundle ──┼──────────────►│ /api/*   machines, grabs    │
 │  │    · WHEP video ──────────┼──────────────►│ /cam/*/whep  live camera    │
 │  │    · WebSocket play ──────┼──────────────►│ /ws/<machine>  claw control │
 │  └─ Menu/Back key relay      │               │ /platform/auth/*  sign-in   │
 └──────────────┬───────────────┘               └──────────────▲──────────────┘
                │ POST /coach/*                                │ frames, modes
                ▼                                              │
        ai-coach/ ── Amazon Bedrock (Claude) ◄─────────────────┘
                ▲
                │ coach_tip
 Alexa+ ── mcp-server/ ── /api/* (read-only)
```

- **Video:** WHEP (WebRTC), with native HLS as fallback. On the Vega Virtual
  Device, WHEP plays without TURN with about 21 ms of jitter buffer.
- **Controls:** the Mini App's protocol. While a D-pad key is held the client
  re-sends the direction every 100 ms, and it sends `H` (safe stop) on
  release. OK drops the claw, once. [`web/src/lib/remote.js`](web/src/lib/remote.js)
  works around Vega's auto-repeat, which sends `repeat: false`.
- **Sign-in:** an email code gives an access token, then a one-shot ticket
  opens the play socket. The refresh credential is carried by the RN bridge,
  because the page runs on `file://`
  ([friction log #4–#6](docs/friction-log.md)).
- **Arcade mode:** while the service reports `prize_fulfillment_enabled:
  false`, the app never promises prizes. It shows game modes and "grabs"
  instead.

## Run it

You need Node 20+ and, for the TV build, the
[Vega SDK](https://developer.amazon.com/docs/vega/0.21/install-vega-sdk.html)
with the Vega Virtual Device. The app talks to the public Grabium service by
default. `GRABIUM_ORIGIN` and `GRABIUM_COACH_ORIGIN` point it somewhere else.

```bash
# TV UI in a desktop browser (arrow keys, Enter, Esc work as the remote)
cd web && npm install && npm run dev

# TV UI on the Vega Virtual Device
vega virtual-device start
cd web && npm run vega          # builds web/, then vega/, installs, launches
```

AI coach (Python 3.12). `COACH_FAKE=1` answers without AWS:

```bash
cd ai-coach
python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q
COACH_FAKE=1 .venv/bin/python coach.py          # :8090
# Real Bedrock: set AWS credentials and COACH_FAKE=0 (see .env.example)
```

MCP server:

```bash
cd mcp-server
python -m venv .venv && .venv/bin/pip install -r requirements.txt pytest pytest-asyncio
.venv/bin/python -m pytest -q
.venv/bin/python server.py                      # Streamable HTTP on :8096/mcp
npx @modelcontextprotocol/inspector             # connect to http://localhost:8096/mcp
```

Both services ship with a `Dockerfile` (with `HEALTHCHECK`) and a
`docker-compose.yml`.

## Safety choices

- **Voice can't control a cabinet.** Every MCP tool is annotated
  `readOnlyHint`, and a round needs a signed-in player who can see the
  camera.
- **The HTTP bridge is an allowlist, not a proxy.** It allows GET `/api/*`,
  POST `/platform/auth/*` and POST `/coach/*` on known hosts, and forwards
  only `Authorization` and `Content-Type`.
- **The coach fails soft.** It rate-limits per IP and shares one answer per
  machine for a few seconds. If Bedrock refuses or is down, it answers with
  a canned tip, and the TV hides the card when the coach is unreachable.
- **No secrets in this repo.** AWS keys live only in the server's `.env`.

## Built during the hackathon

Everything in this repository was written during the submission window,
starting on 2026-09-23. It is a new client and new services for Grabium's
existing claw machine platform. The platform (edge server, machine firmware
and the Telegram Mini App) is not part of this repository and was not
changed for it.

## License

[MIT](LICENSE)
