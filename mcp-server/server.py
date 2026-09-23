"""Grabium MCP server for Alexa+: live claw machine status by voice.

Read-only on purpose. It answers "which machine is free", "what is on
Basket Ball" and "who is winning this week" (plus an AI coach tip when
GRABIUM_MCP_COACH=1 and the coach runs on Bedrock),
but it cannot start a round or move a claw: controlling a real cabinet
needs a signed-in player on a screen that shows the live camera.

Transport: Streamable HTTP at /mcp (MCP protocol 2025-11-25 or later,
negotiated by the official `mcp` Python SDK).

Run: python server.py  (settings come from the environment, see below).
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any

import httpx
from mcp.server.mcpserver import MCPServer
from mcp.types import ToolAnnotations

log = logging.getLogger("grabium-mcp")


def _env_int(name: str, default: int, low: int, high: int) -> int:
    """Read an int setting and clamp it, so a typo cannot disable a limit."""
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        log.warning("%s is not an integer, using %s", name, default)
        return default
    return max(low, min(high, value))


EDGE = os.getenv("GRABIUM_EDGE_ORIGIN", "https://play.freeskillclaw.cc").rstrip("/")
COACH = os.getenv("GRABIUM_COACH_ORIGIN", "https://coach.freeskillclaw.cc").rstrip("/")
PORT = _env_int("GRABIUM_MCP_PORT", 8096, 1, 65535)
HTTP_TIMEOUT = _env_int("GRABIUM_MCP_HTTP_TIMEOUT", 8, 1, 30)
# The coach_tip tool is only offered while the coach runs on real Bedrock;
# otherwise Alexa would present a canned line as an AI tip.
COACH_TOOL = os.getenv("GRABIUM_MCP_COACH", "0") == "1"

READ_ONLY = ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=True)

MODE_SPOKEN = {"classic": "Classic", "freedrop": "Free Drop"}

HOW_TO_PLAY = {
    "classic": (
        "In Classic mode you steer the claw with the arrows, then drop it once. "
        "Line up over one item with space around it before you drop."
    ),
    "freedrop": (
        "In Free Drop mode you aim and grab, the claw lifts on its own, "
        "then you pick where to release the item."
    ),
}

mcp = MCPServer(
    name="grabium",
    title="Grabium claw machines",
    description="Live status of Grabium's real, remotely played claw machines.",
    instructions=(
        "Use these tools to tell people about Grabium's live claw machines: which one is free, "
        "what each machine is, recent grabs and the weekly board. Each result "
        "has a 'say' field that is ready to speak. Grabium runs as an arcade: do not promise "
        "physical prizes. Playing happens on the Grabium TV app, on the web or in Telegram, "
        "not by voice."
    ),
    version="0.1.0",
)

_client: httpx.AsyncClient | None = None


def _http() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=HTTP_TIMEOUT, headers={"User-Agent": "grabium-mcp/0.1"})
    return _client


async def _get(path: str) -> dict[str, Any]:
    response = await _http().get(f"{EDGE}{path}")
    response.raise_for_status()
    return response.json()


def _status_phrase(machine: dict[str, Any]) -> str:
    if machine.get("maintenance") or machine.get("status") == "maintenance":
        return "taking a break"
    if (machine.get("session") or {}).get("active_user"):
        line = (machine.get("queue") or {}).get("size") or 0
        return f"busy, with {line} in line" if line else "busy right now"
    if machine.get("status") == "ready":
        return "open to play"
    return "getting ready"


def _machine_summary(machine: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": machine.get("id"),
        "name": machine.get("name"),
        "mode": MODE_SPOKEN.get(machine.get("mode", ""), machine.get("mode") or "arcade"),
        "status": _status_phrase(machine),
        "open": machine.get("status") == "ready"
        and not machine.get("maintenance")
        and not (machine.get("session") or {}).get("active_user"),
        "watching": machine.get("watching") or 0,
        "queue": (machine.get("queue") or {}).get("size") or 0,
    }


def _match_machine(machines: list[dict[str, Any]], query: str) -> dict[str, Any] | None:
    """Find a machine by id or spoken name ("basket ball", "lucky claw", "machine two")."""
    q = "".join(ch for ch in query.lower() if ch.isalnum())
    numbers = {"one": "01", "two": "02", "1": "01", "2": "02"}
    for word, digits in numbers.items():
        if q.endswith(word) and q.startswith("machine"):
            q = f"machine{digits}"
    for machine in machines:
        name = "".join(ch for ch in str(machine.get("name", "")).lower() if ch.isalnum())
        mid = "".join(ch for ch in str(machine.get("id", "")).lower() if ch.isalnum())
        if q and (q == mid or q in name):
            return machine
    return None


async def _machines() -> list[dict[str, Any]]:
    data = await _get("/api/machines")
    return [m for m in data.get("machines", []) if not m.get("hidden")]


@mcp.tool(title="List machines", annotations=READ_ONLY)
async def list_machines() -> dict[str, Any]:
    """List Grabium's live claw machines with their game mode and whether each is open to play right now."""
    machines = [_machine_summary(m) for m in await _machines()]
    if not machines:
        return {"say": "No Grabium machines are online right now.", "machines": []}
    parts = [f"{m['name']}, {m['mode']}, is {m['status']}" for m in machines]
    open_count = sum(1 for m in machines if m["open"])
    lead = f"{open_count} of {len(machines)} machines are open." if open_count else "All machines are busy right now."
    return {"say": f"{lead} " + ". ".join(parts) + ".", "machines": machines}


@mcp.tool(title="Machine status", annotations=READ_ONLY)
async def machine_status(machine: str) -> dict[str, Any]:
    """Status of one machine, by name (for example "Basket Ball" or "Lucky Claw") or id (machine-01).

    Args:
        machine: The machine's name or id as the person said it.
    """
    machines = await _machines()
    found = _match_machine(machines, machine)
    if not found:
        names = ", ".join(str(m.get("name")) for m in machines) or "none"
        return {"say": f"I couldn't find a machine called {machine}. The machines are: {names}.", "found": False}
    summary = _machine_summary(found)
    say = f"{summary['name']} is a {summary['mode']} machine and it's {summary['status']}."
    if summary["watching"]:
        say += f" {summary['watching']} watching now."
    return {"say": say, "found": True, "machine": summary}


@mcp.tool(title="Recent grabs", annotations=READ_ONLY)
async def recent_grabs(limit: int = 3) -> dict[str, Any]:
    """The most recent successful grabs across all machines.

    Args:
        limit: How many to return, 1 to 10.
    """
    limit = max(1, min(10, limit))
    wins = (await _get("/api/recent-wins")).get("wins", [])[:limit]
    if not wins:
        return {"say": "No grabs yet today. Be the first!", "grabs": []}
    now = time.time()

    def ago(ts: float) -> str:
        minutes = int((now - ts) // 60)
        if minutes < 60:
            return f"{max(1, minutes)} minutes ago"
        hours = minutes // 60
        return f"{hours} hours ago" if hours < 48 else f"{hours // 24} days ago"

    grabs = [{"player": w.get("name"), "machine": w.get("machine"), "when": ago(w.get("ts", now))} for w in wins]
    say = "; ".join(f"{g['player']} landed a grab on {g['machine']} {g['when']}" for g in grabs)
    return {"say": say + ".", "grabs": grabs}


@mcp.tool(title="Weekly board", annotations=READ_ONLY)
async def weekly_board(limit: int = 3) -> dict[str, Any]:
    """This week's top players by successful grabs.

    Args:
        limit: How many players to return, 1 to 10.
    """
    limit = max(1, min(10, limit))
    entries = (await _get("/api/leaderboard/weekly")).get("entries", [])[:limit]
    if not entries:
        return {"say": "Nobody is on this week's board yet.", "entries": []}
    board = [{"rank": e.get("rank"), "player": e.get("display_name"), "grabs": e.get("wins", 0)} for e in entries]
    say = ", ".join(
        f"number {b['rank']}, {b['player']} with {b['grabs']} grab{'s' if b['grabs'] != 1 else ''}" for b in board
    )
    return {"say": f"This week's board: {say}.", "entries": board}


@mcp.tool(title="How to play", annotations=READ_ONLY)
async def how_to_play(mode: str = "") -> dict[str, Any]:
    """Explain how Grabium works, or one game mode ("classic" or "free drop").

    Args:
        mode: Optional game mode to explain.
    """
    key = "".join(ch for ch in mode.lower() if ch.isalpha())
    if key in HOW_TO_PLAY:
        return {"say": HOW_TO_PLAY[key]}
    return {
        "say": (
            "Grabium streams real claw machines live. Open Grabium on your Fire TV, pick a machine, "
            "and steer the claw with your remote. It's an arcade: grabs count on the weekly board. "
            + HOW_TO_PLAY["classic"]
        )
    }


async def coach_tip(machine: str) -> dict[str, Any]:
    """Ask Grabium's AI coach (Claude on Amazon Bedrock, looking at the live camera) for an aiming tip on one machine.

    Args:
        machine: The machine's name or id as the person said it.
    """
    found = _match_machine(await _machines(), machine)
    if not found:
        return {"say": f"I couldn't find a machine called {machine}.", "found": False}
    try:
        response = await _http().post(f"{COACH}/coach/hint", json={"machine_id": found.get("id")})
        response.raise_for_status()
        line = str(response.json().get("line", "")).strip()
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("coach unavailable: %s: %s", type(exc).__name__, exc)
        line = ""
    if not line:
        return {"say": f"The coach is taking a break. On {found.get('name')}, line up over one item before you drop."}
    return {"say": f"Coach tip for {found.get('name')}: {line}", "found": True}


if COACH_TOOL:
    mcp.tool(title="Coach tip", annotations=READ_ONLY)(coach_tip)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    log.info("grabium mcp on :%s/mcp edge=%s", PORT, EDGE)
    # Stateless JSON responses: every tool is a single read, and stateless
    # mode lets any replica answer any request behind the tunnel.
    mcp.run("streamable-http", host="0.0.0.0", port=PORT, stateless_http=True, json_response=True)


if __name__ == "__main__":
    main()
