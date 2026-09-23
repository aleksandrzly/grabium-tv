"""Coach service tests: no AWS and no real edge (both are replaced)."""

from __future__ import annotations

import asyncio

import coach as coach_mod
import pytest
from coach import CANNED, CoachUnavailable, LineCache, RateLimiter, Settings, build_app


class CountingCoach:
    def __init__(self, reply: str = "Aim at the duck near the glass.", fail: bool = False) -> None:
        self.calls: list[str] = []
        self.reply = reply
        self.fail = fail

    async def line(self, image_jpeg: bytes, instruction: str) -> str:
        self.calls.append(instruction)
        await asyncio.sleep(0.01)
        if self.fail:
            raise CoachUnavailable("boom")
        return self.reply


@pytest.fixture
def fake_edge(monkeypatch):
    async def fetch_frame(session, settings, machine_id):
        return b"\xff\xd8jpeg", "freedrop"

    monkeypatch.setattr(coach_mod, "fetch_frame", fetch_frame)


def settings(**overrides) -> Settings:
    base = dict(cache_seconds=30, rate_per_minute=100, allowed_machines=frozenset({"machine-02"}), fake=False)
    base.update(overrides)
    return Settings(**base)


async def test_hint_uses_mode_and_is_shared_between_viewers(aiohttp_client, fake_edge):
    model = CountingCoach()
    client = await aiohttp_client(build_app(settings(), model))
    first, second = await asyncio.gather(
        client.post("/coach/hint", json={"machine_id": "machine-02"}),
        client.post("/coach/hint", json={"machine_id": "machine-02"}),
    )
    bodies = [await first.json(), await second.json()]
    assert all(b["line"] == "Aim at the duck near the glass." for b in bodies)
    assert len(model.calls) == 1, "concurrent viewers must share one model call"
    assert "FreeDrop mode" in model.calls[0]


async def test_recap_is_keyed_by_result(aiohttp_client, fake_edge):
    model = CountingCoach()
    client = await aiohttp_client(build_app(settings(), model))
    await client.post("/coach/recap", json={"machine_id": "machine-02", "result": "WIN"})
    await client.post("/coach/recap", json={"machine_id": "machine-02", "result": "lose"})
    assert len(model.calls) == 2
    assert "result WIN" in model.calls[0] and "result LOSE" in model.calls[1]


async def test_model_failure_answers_with_canned_line(aiohttp_client, fake_edge):
    client = await aiohttp_client(build_app(settings(), CountingCoach(fail=True)))
    response = await client.post("/coach/hint", json={"machine_id": "machine-02"})
    body = await response.json()
    assert response.status == 200
    assert body["line"] == CANNED["hint"] and body["fallback"] is True


async def test_unknown_machine_and_bad_json_are_rejected(aiohttp_client, fake_edge):
    model = CountingCoach()
    client = await aiohttp_client(build_app(settings(), model))
    unknown = await client.post("/coach/hint", json={"machine_id": "../../admin"})
    bad = await client.post("/coach/hint", data="not json", headers={"Content-Type": "application/json"})
    assert unknown.status == 400 and bad.status == 400
    assert model.calls == []


async def test_rate_limit_per_client_ip(aiohttp_client, fake_edge):
    client = await aiohttp_client(build_app(settings(rate_per_minute=2, cache_seconds=0), CountingCoach()))
    headers = {"CF-Connecting-IP": "203.0.113.7"}
    codes = [
        (await client.post("/coach/hint", json={"machine_id": "machine-02"}, headers=headers)).status
        for _ in range(3)
    ]
    other = await client.post("/coach/hint", json={"machine_id": "machine-02"}, headers={"CF-Connecting-IP": "203.0.113.8"})
    assert codes == [200, 200, 429]
    assert other.status == 200


def test_rate_limiter_window_slides():
    limiter = RateLimiter(1)
    assert limiter.allow("a", now=0)
    assert not limiter.allow("a", now=30)
    assert limiter.allow("a", now=61)


async def test_line_cache_expires():
    cache = LineCache(ttl=0)
    calls = 0

    async def produce():
        nonlocal calls
        calls += 1
        return "x"

    await cache.get(("m", "hint"), produce)
    await cache.get(("m", "hint"), produce)
    assert calls == 2


def test_env_int_clamps(monkeypatch):
    monkeypatch.setenv("COACH_RATE_PER_MINUTE", "999999")
    assert coach_mod._env_int("COACH_RATE_PER_MINUTE", 12, 1, 600) == 600
    monkeypatch.setenv("COACH_RATE_PER_MINUTE", "-5")
    assert coach_mod._env_int("COACH_RATE_PER_MINUTE", 12, 1, 600) == 1
    monkeypatch.setenv("COACH_RATE_PER_MINUTE", "lots")
    assert coach_mod._env_int("COACH_RATE_PER_MINUTE", 12, 1, 600) == 12


def test_one_line_trims():
    assert coach_mod._one_line("  a\n b  ") == "a b"
    assert len(coach_mod._one_line("x" * 500)) == 160


async def test_health(aiohttp_client):
    client = await aiohttp_client(build_app(settings(fake=True)))
    body = await (await client.get("/health")).json()
    assert body == {"status": "ok", "fake": True, "model": Settings().model}
