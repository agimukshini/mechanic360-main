"""
Redis-backed response cache for marketplace read endpoints.

Uses a version counter so catalog writes invalidate all marketplace keys
without scanning Redis. Celery uses Redis DB 0; Django cache uses DB 1.
"""
from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from typing import TypeVar

from django.conf import settings
from django.core.cache import cache

CACHE_VERSION_KEY = "marketplace:cache_version"

T = TypeVar("T")


def marketplace_cache_enabled() -> bool:
    return bool(getattr(settings, "MARKETPLACE_CACHE_ENABLED", True))


def _cache_version() -> int:
    version = cache.get(CACHE_VERSION_KEY)
    if version is None:
        cache.add(CACHE_VERSION_KEY, 1, timeout=None)
        version = cache.get(CACHE_VERSION_KEY) or 1
    return int(version)


def invalidate_marketplace_cache() -> None:
    """Bump version so existing marketplace cache keys are ignored."""
    if not marketplace_cache_enabled():
        return
    try:
        cache.incr(CACHE_VERSION_KEY)
    except ValueError:
        cache.set(CACHE_VERSION_KEY, 1, timeout=None)


def marketplace_cache_key(namespace: str, **parts: object) -> str:
    payload = json.dumps(parts, sort_keys=True, default=str)
    digest = hashlib.sha256(payload.encode()).hexdigest()[:20]
    return f"mp:v{_cache_version()}:{namespace}:{digest}"


def cache_get(key: str):
    if not marketplace_cache_enabled():
        return None
    return cache.get(key)


def cache_set(key: str, value) -> None:
    if not marketplace_cache_enabled():
        return
    cache.set(key, value, timeout=settings.MARKETPLACE_CACHE_TTL)


def cache_get_or_set(key: str, producer: Callable[[], T]) -> T:
    cached = cache_get(key)
    if cached is not None:
        return cached
    value = producer()
    cache_set(key, value)
    return value
