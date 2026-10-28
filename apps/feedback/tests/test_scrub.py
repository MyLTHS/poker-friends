"""What scrub() removes from text a browser sends, and what it leaves alone."""

import pytest

from apps.feedback.scrub import REDACTED, scrub


@pytest.mark.parametrize(
    ("text", "secret"),
    [
        # cookies, CSRF and link tokens
        ("Failed: sessionid=s3ss; csrftoken=c5rf", "s3ss"),
        ("Cookie: sessionid=s3ss; theme=dark", "s3ss"),
        ("X-CSRFToken: c5rf-header", "c5rf-header"),
        ("x-csrftoken:c5rf-header", "c5rf-header"),
        ("GET /account/reset?uid=4&token=r3set#top", "r3set"),
        # secret values in JSON or a JS object dump
        ('body {"invite_token":"inv1te"}', "inv1te"),
        ("{'invite_token': 'inv1te'}", "inv1te"),
        ('{invite_token: "inv1te"}', "inv1te"),
        ('{"token": "t0ken"}', "t0ken"),
        ('{"email":"a@b.vn","password":"hunter22"}', "hunter22"),
        ('{"sessionid":"s3ss"}', "s3ss"),
        # cards, under their key or as a bare list, in either quotes
        ('state {"cards":["As","Kd"]}', '"As"'),
        ("state {'hole_cards': ['As', 'Kd']}", "'As'"),
        ("hand ['As','Kd'] is null", "'Kd'"),
        ('board ["Qh", "Jc", "Td"]', '"Jc"'),
        ("seen ['??', '7c']", "'7c'"),
    ],
)
def test_secrets_are_redacted(text, secret):
    cleaned = scrub(text)
    assert secret not in cleaned
    assert REDACTED in cleaned


@pytest.mark.parametrize(
    "text",
    [
        "TypeError: hand is null at TableScreen (TableScreen.tsx:120:7)",
        'list ["a", "b"] and ["Ace", "King"]',
        "the token expired, ask for a new link",
        '{"kind":"bug","page":"/rooms/3/table"}',
    ],
)
def test_ordinary_text_stays(text):
    assert scrub(text) == text
