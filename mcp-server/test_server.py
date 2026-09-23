"""MCP tool tests against canned edge payloads (no network)."""

from __future__ import annotations

import time

import pytest
import server

MACHINES = {
    "status": "ok",
    "machines": [
        {"id": "machine-01", "name": "Lucky Claw", "mode": "classic", "status": "ready", "watching": 2,
         "queue": {"size": 0}, "session": {"active_user": None}},
        {"id": "machine-02", "name": "Basket Ball", "mode": "freedrop", "status": "busy", "watching": 0,
         "queue": {"size": 1}, "session": {"active_user": {"id": "x"}}},
        {"id": "machine-03", "name": "Hidden", "mode": "classic", "status": "ready", "hidden": True},
    ],
}


@pytest.fixture
def edge(monkeypatch):
    payloads = {
        "/api/machines": MACHINES,
        "/api/recent-wins": {"wins": [{"name": "Alex", "machine": "Basket Ball", "ts": time.time() - 300}]},
        "/api/leaderboard/weekly": {"entries": [{"rank": 1, "display_name": "sam", "wins": 1}]},
    }

    async def fake_get(path):
        return payloads[path]

    monkeypatch.setattr(server, "_get", fake_get)
    return payloads


async def test_list_machines_counts_open_and_skips_hidden(edge):
    result = await server.list_machines()
    assert [m["name"] for m in result["machines"]] == ["Lucky Claw", "Basket Ball"]
    assert result["say"].startswith("1 of 2 machines are open.")
    assert "busy, with 1 in line" in result["say"]


@pytest.mark.parametrize("query", ["basket ball", "Basket-Ball", "machine two", "machine-02", "ball"])
async def test_machine_status_understands_spoken_names(edge, query):
    result = await server.machine_status(query)
    assert result["found"] and result["machine"]["id"] == "machine-02"


async def test_unknown_machine_lists_the_real_ones(edge):
    result = await server.machine_status("pinball")
    assert not result["found"]
    assert "Lucky Claw, Basket Ball" in result["say"]


async def test_recent_grabs_and_board_speak_arcade_wording(edge):
    grabs = await server.recent_grabs(limit=50)
    board = await server.weekly_board()
    assert grabs["say"] == "Alex landed a grab on Basket Ball 5 minutes ago."
    assert board["say"] == "This week's board: number 1, sam with 1 grab."
    assert "prize" not in grabs["say"] + board["say"]


async def test_how_to_play_modes():
    assert "Free Drop" in (await server.how_to_play("free drop"))["say"]
    assert "Fire TV" in (await server.how_to_play())["say"]


async def test_coach_tip_falls_back_when_coach_is_down(edge, monkeypatch):
    class Down:
        async def post(self, *args, **kwargs):
            raise server.httpx.ConnectError("down")

    monkeypatch.setattr(server, "_http", lambda: Down())
    result = await server.coach_tip("lucky claw")
    assert result["say"].startswith("The coach is taking a break. On Lucky Claw")


async def test_every_tool_is_read_only():
    tools = await server.mcp.list_tools()
    assert {t.name for t in tools} == {
        "list_machines", "machine_status", "recent_grabs", "weekly_board", "how_to_play"
    }, "coach_tip must stay hidden unless GRABIUM_MCP_COACH=1"
    assert all(t.annotations and t.annotations.read_only_hint for t in tools)
