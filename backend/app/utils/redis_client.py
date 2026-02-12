import asyncio
import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

import redis.asyncio as aioredis
import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_redis_client: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    """Return the singleton async Redis client, creating it if needed."""
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
        )
    return _redis_client


async def close_redis() -> None:
    """Close the Redis connection pool."""
    global _redis_client
    if _redis_client is not None:
        await _redis_client.aclose()
        _redis_client = None


def reset_redis() -> None:
    """Reset the Redis client without closing (for event loop changes)."""
    global _redis_client
    _redis_client = None


def _channel_name(job_id: str) -> str:
    return f"job:{job_id}:progress"


async def publish_progress(job_id: str, data: dict[str, Any]) -> None:
    """Publish a progress event for a job via Redis pub/sub and update frontend database."""
    r = await get_redis()
    channel = _channel_name(job_id)
    payload = json.dumps(data)
    await r.publish(channel, payload)
    # Also persist latest state in a hash for poll-based access
    await r.hset(f"job:{job_id}", mapping={
        "status": data.get("status", "unknown"),
        "current_step": data.get("current_step", ""),
        "progress": str(data.get("progress", 0)),
        "message": data.get("message", ""),
        "data": json.dumps(data.get("data") or {}),
    })

    # Update frontend PostgreSQL database via webhook
    frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.patch(
                f"{frontend_url}/api/jobs/{job_id}/progress",
                json={
                    "status": data.get("status"),
                    "currentStep": data.get("current_step"),
                    "progress": data.get("progress"),
                    "message": data.get("message"),
                    "data": data.get("data"),
                },
            )
        logger.debug(f"Updated frontend database for job {job_id}")
    except Exception as e:
        logger.warning(f"Failed to update frontend database for job {job_id}: {e}")


async def get_job_state(job_id: str) -> dict[str, Any] | None:
    """Retrieve the latest persisted job state from Redis."""
    r = await get_redis()
    raw = await r.hgetall(f"job:{job_id}")
    if not raw:
        return None
    return {
        "job_id": job_id,
        "status": raw.get("status", "unknown"),
        "current_step": raw.get("current_step", ""),
        "progress": int(raw.get("progress", 0)),
        "message": raw.get("message", ""),
        "data": json.loads(raw.get("data", "{}")),
    }


async def subscribe_progress(job_id: str) -> AsyncGenerator[dict[str, Any], None]:
    """Async generator that yields progress events for a job via pub/sub."""
    r = await get_redis()
    pubsub = r.pubsub()
    channel = _channel_name(job_id)
    await pubsub.subscribe(channel)
    try:
        while True:
            message = await pubsub.get_message(
                ignore_subscribe_messages=True,
                timeout=1.0,
            )
            if message is not None and message["type"] == "message":
                data = json.loads(message["data"])
                yield data
                if data.get("status") in ("completed", "failed", "cancelled"):
                    break
            else:
                await asyncio.sleep(0.1)
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.aclose()
