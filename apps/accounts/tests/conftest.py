import re
from urllib.parse import parse_qs, urlparse

import pytest
from allauth.account.models import EmailAddress
from django.core import mail
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.games.models import User

PASSWORD = "sau-con-bai-dep"


@pytest.fixture(autouse=True)
def _clear_cache():
    # Rate-limit counters live in the cache; every test starts from zero.
    cache.clear()


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
