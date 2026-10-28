"""Remove secrets from text a browser sends us before it is stored.

Error messages and stacks can quote whatever the page held: a cookie header, a session id, a
password-reset link, a request body, the table state with hole cards. None of that may end up in
the database.
"""

import re

REDACTED = "[đã xoá]"

# keys whose value is a secret wherever it is written as "key": "value"
_SECRET_KEYS = "sessionid|csrftoken|csrfmiddlewaretoken|token|invite_token|password"
# one card as the engine writes it ("As", "Td", "??" for a face-down card), in either quotes
_CARD = r"""["'](?:[2-9TJQKA][shdc]|\?\?)["']"""

_PATTERNS = [
    # session and CSRF values, in a cookie string or a query
    (re.compile(r"(?i)\b(sessionid|csrftoken|csrfmiddlewaretoken)=[^;\s&\"']+"), rf"\1={REDACTED}"),
    # a whole header line that carries one
    (
        re.compile(r"(?i)\b(set-cookie|cookie|x-csrftoken|authorization)\s*:[^\n]*"),
        rf"\1: {REDACTED}",
    ),
    # link tokens: password reset, email verification, invite
    (re.compile(r"(?i)([?&](?:token|uid|invite_token|key)=)[^&#\s\"']+"), rf"\1{REDACTED}"),
    # secret values in JSON or a JS object dump: "invite_token":"…", 'password': '…', token: "…"
    (
        re.compile(rf"""(?i)(["']?)\b({_SECRET_KEYS})\1(\s*:\s*)(["'])(?:(?!\4).)*\4"""),
        rf"\1\2\1\3\4{REDACTED}\4",
    ),
    # cards under their key: a player's hand or the deck
    (
        re.compile(r"""(["'])(cards|deck|burn|burned|hole_cards)\1\s*:\s*\[[^\]]*\]"""),
        rf'"\2":"{REDACTED}"',
    ),
    # any other list of cards: ['As','Kd'], ["Qh", "Jc", "Td"]
    (re.compile(rf"\[\s*{_CARD}(?:\s*,\s*{_CARD})*\s*\]"), REDACTED),
]


def scrub(text: str) -> str:
    for pattern, replacement in _PATTERNS:
        text = pattern.sub(replacement, text)
    return text
