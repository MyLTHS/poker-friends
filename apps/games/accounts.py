"""Temporary identity for B4: a guest account stored as soon as someone first connects (REST or
WebSocket), remembered in the Django session. Real accounts and upgrading a guest are B6.
"""

import uuid
from typing import Any

from .models import User

SESSION_KEY = "games_user_id"


async def aget_or_create_session_user(session: Any) -> User:
    user_id = await session.aget(SESSION_KEY)
    if user_id:
        try:
            return await User.objects.aget(pk=user_id)
        except User.DoesNotExist:
            pass
    user = await User.objects.acreate(username=f"guest-{uuid.uuid4().hex[:8]}", is_guest=True)
    await session.aset(SESSION_KEY, user.pk)
    await session.asave()
    return user
