"""Playing from home, links in emails follow the address the player used (the tunnel's address
changes on every start), not a fixed FRONTEND_URL."""

import re

import pytest
from django.core import mail
from django.test import override_settings

from .test_email_password import signup

pytestmark = pytest.mark.django_db
TUNNEL = "wild-words-here.trycloudflare.com"


def emailed_link():
    return re.search(r"https?://\S+", mail.outbox[-1].body).group(0)


@override_settings(FRONTEND_URL_FROM_REQUEST=True, ALLOWED_HOSTS=[".trycloudflare.com"])
def test_the_link_points_at_the_address_the_player_used(client):
    assert signup(client, HTTP_HOST=TUNNEL, secure=True).status_code == 201
    assert emailed_link().startswith(f"https://{TUNNEL}/account/verify?token=")


@override_settings(FRONTEND_URL_FROM_REQUEST=False, FRONTEND_URL="https://poker.example.vn")
def test_a_server_with_a_domain_keeps_its_fixed_address(client):
    assert signup(client).status_code == 201
    assert emailed_link().startswith("https://poker.example.vn/account/verify?token=")
