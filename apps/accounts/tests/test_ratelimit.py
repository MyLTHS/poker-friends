"""Fixed-window counters in the Django cache (no Redis needed)."""

import pytest
from django.core.cache import cache

from apps.accounts.ratelimit import RateLimit, RateLimited


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()


def test_allows_up_to_the_limit_then_refuses():
    limit = RateLimit("test", limit=3, window=60)
    for _ in range(3):
        limit.hit("1.2.3.4")
    with pytest.raises(RateLimited) as exc:
        limit.hit("1.2.3.4")
    assert 0 < exc.value.retry_after <= 60


def test_keys_are_counted_separately():
    limit = RateLimit("test", limit=1, window=60)
    limit.hit("a@example.com")
    limit.hit("b@example.com")
    with pytest.raises(RateLimited):
        limit.hit("a@example.com")


def test_keys_are_case_insensitive():
    limit = RateLimit("test", limit=1, window=60)
    limit.hit("A@Example.com")
    with pytest.raises(RateLimited):
        limit.hit("a@example.com")


def test_check_does_not_count():
    limit = RateLimit("test", limit=1, window=60)
    limit.check("k")
    limit.check("k")
    limit.hit("k")
    with pytest.raises(RateLimited):
        limit.check("k")


def test_reset_clears_the_counter():
    limit = RateLimit("test", limit=1, window=60)
    limit.hit("k")
    limit.reset("k")
    limit.hit("k")


def test_scopes_do_not_share_counters():
    RateLimit("one", limit=1, window=60).hit("k")
    RateLimit("two", limit=1, window=60).hit("k")
