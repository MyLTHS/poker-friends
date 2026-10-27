import re
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import pytest
from allauth.account.models import EmailAddress
from django.core import mail
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.games.models import User

PASSWORD = "sau-con-bai-dep"


# Inside one window of every rate limit (all windows divide 1_800_000_000).
FROZEN_NOW = 1_800_000_000 + 30


@pytest.fixture(autouse=True)
def _clear_cache():
    # Rate-limit counters live in the cache; every test starts from zero.
    cache.clear()


@pytest.fixture(autouse=True)
def _freeze_rate_limit_clock(monkeypatch):
    # Windows are fixed (e.g. :00-:10); a slow test crossing a boundary would see its counter
    # reset and fail now and then. Freezing the clock makes every test run in one window.
    monkeypatch.setattr("apps.accounts.ratelimit.time", SimpleNamespace(time=lambda: FROZEN_NOW))


@pytest.fixture(autouse=True)
def _fast_password_hashing(settings):
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def csrf_client():
    return APIClient(enforce_csrf_checks=True)


def make_verified_user(email="an@example.com", username="an", password=PASSWORD) -> User:
    user = User.objects.create_user(username=username, email=email, password=password)
    EmailAddress.objects.create(user=user, email=email, primary=True, verified=True)
    return user


def link_params(message) -> dict[str, str]:
    """Query parameters of the first web-app link in an email."""
    url = re.search(r"https?://\S+", message.body).group(0)
    return {key: values[0] for key, values in parse_qs(urlparse(url).query).items()}


def last_link_params() -> dict[str, str]:
    return link_params(mail.outbox[-1])
