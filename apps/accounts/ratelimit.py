"""Fixed-window rate limits kept in the Django cache.

The default cache is per process memory, which is enough for one ASGI process (docs/spec.md,
decision #11). Point CACHES at Redis if the app ever runs more than one process.
"""

import hashlib
import time
from dataclasses import dataclass

from django.core.cache import cache


class RateLimited(Exception):
    def __init__(self, retry_after: int):
        super().__init__(f"Rate limited, retry after {retry_after}s")
        self.retry_after = retry_after


@dataclass(frozen=True)
class RateLimit:
    scope: str
    limit: int
    window: int  # seconds

    def _key(self, value: str) -> tuple[str, int]:
        # Hash so emails never sit in the cache in clear, and keys stay short and safe.
        digest = hashlib.sha256(value.strip().lower().encode()).hexdigest()[:32]
        window_start = int(time.time()) // self.window * self.window
        return f"ratelimit:{self.scope}:{digest}:{window_start}", window_start

    def _retry_after(self, window_start: int) -> int:
        return max(1, window_start + self.window - int(time.time()))

    def check(self, value: str) -> None:
        """Raise ``RateLimited`` if the limit is already used up, without counting a hit."""
        key, window_start = self._key(value)
        if cache.get(key, 0) >= self.limit:
            raise RateLimited(self._retry_after(window_start))

    def hit(self, value: str) -> None:
        """Count one hit; raise ``RateLimited`` (without counting) if the limit is used up."""
        self.check(value)
        key, _ = self._key(value)
        if not cache.add(key, 1, timeout=self.window):
            try:
                cache.incr(key)
            except ValueError:  # expired between add() and incr()
                cache.add(key, 1, timeout=self.window)

    def reset(self, value: str) -> None:
        cache.delete(self._key(value)[0])


# Every login attempt from one IP, whatever the outcome.
LOGIN_ATTEMPTS_PER_IP = RateLimit("login-ip", limit=20, window=10 * 60)
# Failed logins for one email: stops password guessing against a single account.
LOGIN_FAILURES_PER_EMAIL = RateLimit("login-email", limit=5, window=15 * 60)
PASSWORD_RESET_PER_IP = RateLimit("reset-ip", limit=5, window=60 * 60)
PASSWORD_RESET_PER_EMAIL = RateLimit("reset-email", limit=3, window=60 * 60)
# Sign-up, guest upgrade and "send the link again" all send an email.
EMAIL_SENDS_PER_IP = RateLimit("email-ip", limit=10, window=60 * 60)
GUESTS_PER_IP = RateLimit("guest-ip", limit=20, window=60 * 60)
