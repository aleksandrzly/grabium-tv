"""Grabium TV coach: one-line aiming tips and round recaps from Claude on Amazon Bedrock.

The TV app asks for a tip when a round starts and for a recap when it ends.
The service pulls the machine's current camera frame from the public edge,
asks Claude for a single short line, and caches it briefly, so every viewer
of the same machine shares one model call.

Run: python coach.py  (settings below come from the environment).
"""

from __future__ import annotations

import asyncio
import base64
import logging
import os
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Any, Protocol

import aiohttp
from aiohttp import web

log = logging.getLogger("coach")


def _env_int(name: str, default: int, low: int, high: int) -> int:
    """Read an int setting and clamp it, so a typo cannot disable a limit."""
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        log.warning("%s is not an integer, using %s", name, default)
        return default
    return max(low, min(high, value))


@dataclass(frozen=True)
class Settings:
    port: int = _env_int("COACH_PORT", 8090, 1, 65535)
    edge_origin: str = os.getenv("COACH_EDGE_ORIGIN", "https://play.freeskillclaw.cc").rstrip("/")
    aws_region: str = os.getenv("AWS_REGION", "us-east-1")
    model: str = os.getenv("COACH_MODEL", "anthropic.claude-opus-5")
    fallback_model: str = os.getenv("COACH_FALLBACK_MODEL", "anthropic.claude-opus-4-8")
    # Seconds a tip is reused for everyone watching the same machine.
    cache_seconds: int = _env_int("COACH_CACHE_SECONDS", 8, 0, 300)
    # Requests per client IP per minute; one round asks twice.
    rate_per_minute: int = _env_int("COACH_RATE_PER_MINUTE", 12, 1, 600)
    allowed_machines: frozenset[str] = frozenset(
        m.strip() for m in os.getenv("COACH_MACHINES", "machine-01,machine-02").split(",") if m.strip()
    )
    # "1" answers with canned lines and never calls AWS: local dev and CI.
    fake: bool = os.getenv("COACH_FAKE", "0") == "1"


SYSTEM_PROMPT = """You are the coach in Grabium, an arcade where people steer a real claw machine over a live camera from their TV.

You see one frame from the machine's front camera. Answer with exactly one short line (at most 18 words) that a player can act on. No preamble, quotes, emoji or markdown.

- For a tip: say which item looks easiest to grab and where to line the claw up, using words a player sees on screen (left, right, front, back, near the glass, in the corner).
- For a recap: react to how the round ended in a warm, specific way and suggest one thing for the next try.

This is an arcade: never promise or mention winning a physical prize, shipping or money. If you cannot make out the items, give a general claw tip instead."""

MODE_NOTES = {
    "classic": "Classic mode: the player steers, then drops the claw once.",
    "freedrop": "FreeDrop mode: the player aims and grabs, then picks where to drop the item.",
}

CANNED = {
    "hint": "Line up over an item with space around it, then drop straight down.",
    "recap_win": "Clean grab! Try the same line-up on the next item.",
    "recap_lose": "So close. Center the claw a touch more before you drop.",
}


class Coach(Protocol):
    async def line(self, image_jpeg: bytes, instruction: str) -> str: ...


class FakeCoach:
    """Stands in for Bedrock when COACH_FAKE=1."""

    async def line(self, image_jpeg: bytes, instruction: str) -> str:
        if "recap" in instruction:
            return CANNED["recap_win"] if "WIN" in instruction else CANNED["recap_lose"]
        return CANNED["hint"]


class BedrockCoach:
    """Claude on Amazon Bedrock through the Anthropic SDK's Mantle client."""

    def __init__(self, settings: Settings) -> None:
        import anthropic

        # Refusals on Bedrock are handled client-side: the middleware retries a
        # declined request once on the fallback model.
        self._client = anthropic.AsyncAnthropicBedrockMantle(
            aws_region=settings.aws_region,
            timeout=20.0,
            max_retries=1,
            middleware=[anthropic.BetaRefusalFallbackMiddleware([{"model": settings.fallback_model}])],
        )
        self._anthropic = anthropic
        self._model = settings.model

    async def line(self, image_jpeg: bytes, instruction: str) -> str:
        anthropic = self._anthropic
        try:
            response = await self._client.beta.messages.create(
                model=self._model,
                max_tokens=1024,
                # A one-line tip needs little reasoning, and the player is
                # waiting at the start of a 30-second round.
                output_config={"effort": "low"},
                system=SYSTEM_PROMPT,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/jpeg",
                                    "data": base64.standard_b64encode(image_jpeg).decode("ascii"),
                                },
                            },
                            {"type": "text", "text": instruction},
                        ],
                    }
                ],
            )
        except anthropic.RateLimitError as exc:
            raise CoachUnavailable(f"rate limited: {exc.message}") from exc
        except anthropic.APIStatusError as exc:
            raise CoachUnavailable(f"bedrock {exc.status_code}: {exc.message}") from exc
        except anthropic.APIConnectionError as exc:
            raise CoachUnavailable(f"bedrock unreachable: {exc}") from exc

        if response.stop_reason == "refusal":
            raise CoachUnavailable("refused by every model in the chain")
        text = " ".join(block.text for block in response.content if block.type == "text").strip()
        if not text:
            raise CoachUnavailable(f"empty answer (stop_reason={response.stop_reason})")
        return _one_line(text)


class CoachUnavailable(Exception):
    """The model could not produce a line; the caller answers with a canned one."""


def _one_line(text: str, limit: int = 160) -> str:
    line = " ".join(text.split())
    return line if len(line) <= limit else line[: limit - 1].rstrip() + "…"


class RateLimiter:
    """Sliding one-minute window per client key."""

    def __init__(self, per_minute: int) -> None:
        self._per_minute = per_minute
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        hits = self._hits[key]
        while hits and now - hits[0] > 60:
            hits.popleft()
        if len(hits) >= self._per_minute:
            return False
        hits.append(now)
        return True


class LineCache:
    """Shares one answer per (machine, kind) for a few seconds.

    Concurrent callers for the same key wait on one in-flight model call
    instead of each starting their own.
    """

    def __init__(self, ttl: float) -> None:
        self._ttl = ttl
        self._values: dict[tuple[str, str], tuple[float, str]] = {}
        self._inflight: dict[tuple[str, str], asyncio.Future[str]] = {}

    async def get(self, key: tuple[str, str], produce: Any) -> tuple[str, bool]:
        hit = self._values.get(key)
        if hit and time.monotonic() - hit[0] < self._ttl:
            return hit[1], True
        if key in self._inflight:
            return await asyncio.shield(self._inflight[key]), True
        future: asyncio.Future[str] = asyncio.get_running_loop().create_future()
        self._inflight[key] = future
        try:
            value = await produce()
            self._values[key] = (time.monotonic(), value)
            future.set_result(value)
            return value, False
        except BaseException as exc:
            future.set_exception(exc)
            # Waiters get the exception; retrieve it here too so an unawaited
            # future does not log "exception was never retrieved".
            future.exception()
            raise
        finally:
            self._inflight.pop(key, None)


def client_key(request: web.Request) -> str:
    # Behind cloudflared every request comes from the tunnel; the real client
    # is in CF-Connecting-IP.
    return request.headers.get("CF-Connecting-IP") or request.remote or "unknown"


async def fetch_frame(session: aiohttp.ClientSession, settings: Settings, machine_id: str) -> tuple[bytes, str]:
    """Current camera frame and game mode from the public edge API."""
    base = f"{settings.edge_origin}/api/machines/{machine_id}"
    timeout = aiohttp.ClientTimeout(total=6)
    async with session.get(f"{base}/status", timeout=timeout) as response:
        response.raise_for_status()
        status = await response.json(content_type=None)
    async with session.get(f"{base}/preview.jpg", timeout=timeout) as response:
        response.raise_for_status()
        frame = await response.read()
    mode = str((status.get("machine") or {}).get("mode") or "")
    return frame, mode


def build_app(settings: Settings, coach: Coach | None = None) -> web.Application:
    app = web.Application(client_max_size=4096)
    coach = coach or (FakeCoach() if settings.fake else BedrockCoach(settings))
    limiter = RateLimiter(settings.rate_per_minute)
    cache = LineCache(settings.cache_seconds)

    async def on_startup(app: web.Application) -> None:
        app["http"] = aiohttp.ClientSession(headers={"User-Agent": "grabium-coach/0.1"})

    async def on_cleanup(app: web.Application) -> None:
        await app["http"].close()

    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)

    async def health(_: web.Request) -> web.Response:
        return web.json_response({"status": "ok", "fake": settings.fake, "model": settings.model})

    async def answer(request: web.Request, kind: str) -> web.Response:
        if not limiter.allow(client_key(request)):
            return web.json_response({"status": "rate_limited"}, status=429)
        try:
            body = await request.json()
        except (ValueError, aiohttp.ContentTypeError):
            return web.json_response({"status": "error", "message": "expected JSON"}, status=400)
        machine_id = str(body.get("machine_id", ""))
        if machine_id not in settings.allowed_machines:
            return web.json_response({"status": "error", "message": "unknown machine"}, status=400)

        if kind == "hint":
            instruction_tail = "Give a tip for the round that is starting now."
            canned = CANNED["hint"]
            cache_kind = "hint"
        else:
            result = "WIN" if str(body.get("result", "")).upper() == "WIN" else "LOSE"
            instruction_tail = f"Recap: the round just ended with result {result}."
            canned = CANNED["recap_win" if result == "WIN" else "recap_lose"]
            cache_kind = f"recap_{result}"

        async def produce() -> str:
            frame, mode = await fetch_frame(request.app["http"], settings, machine_id)
            instruction = f"{MODE_NOTES.get(mode, '')} {instruction_tail}".strip()
            return await coach.line(frame, instruction)

        try:
            line, cached = await cache.get((machine_id, cache_kind), produce)
            return web.json_response({"status": "ok", "line": line, "cached": cached})
        except (CoachUnavailable, aiohttp.ClientError, asyncio.TimeoutError) as exc:
            log.warning("coach %s for %s fell back: %s: %s", kind, machine_id, type(exc).__name__, exc)
            return web.json_response({"status": "ok", "line": canned, "fallback": True})

    async def hint(request: web.Request) -> web.Response:
        return await answer(request, "hint")

    async def recap(request: web.Request) -> web.Response:
        return await answer(request, "recap")

    app.router.add_get("/health", health)
    app.router.add_post("/coach/hint", hint)
    app.router.add_post("/coach/recap", recap)
    return app


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    settings = Settings()
    log.info("coach on :%s model=%s fake=%s", settings.port, settings.model, settings.fake)
    web.run_app(build_app(settings), port=settings.port, print=None)


if __name__ == "__main__":
    main()
