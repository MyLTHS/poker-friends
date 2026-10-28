"""Remove secrets from text a browser sends us before it is stored.

Error messages and stacks can quote whatever the page held: a cookie header, a session id, a
password-reset link, the table state with hole cards. None of that may end up in the database.
"""

import re

REDACTED = "[đã xoá]"

_PATTERNS = [
    # session and CSRF values, in a cookie string or a query
    (re.compile(r"(?i)\b(sessionid|csrftoken|csrfmiddlewaretoken)=[^;\s&\"']+"), rf"\1={REDACTED}"),
    # a whole Cookie / Set-Cookie header line
    (re.compile(r"(?i)\b(set-cookie|cookie)\s*:[^\n]*"), rf"\1: {REDACTED}"),
    # link tokens: password reset, email verification, invite
    (re.compile(r"(?i)([?&](?:token|uid|invite_token|key)=)[^&#\s\"']+"), rf"\1{REDACTED}"),
    # cards: a player's hand or the deck, as JSON
    (re.compile(r'"(cards|deck|burn|burned|hole_cards)"\s*:\s*\[[^\]]*\]'), rf'"\1":"{REDACTED}"'),
]


def scrub(text: str) -> str:
    for pattern, replacement in _PATTERNS:
        text = pattern.sub(replacement, text)
    return text
