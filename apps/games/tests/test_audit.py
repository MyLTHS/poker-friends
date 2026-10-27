"""Regression tests for the read-only audit of phase B, done before phase C.

Each test here failed before its fix: the audit's probes asserted the faulty behaviour.
"""

import pytest
from asgiref.sync import async_to_sync
from django.test import Client

from apps.games import actor as actor_module
from apps.games.models import Hand, User

from .test_actor import (  # noqa: F401 (_slow_next_hand is an autouse fixture)
    _slow_next_hand,
    connect,
    drain,
    heads_up_room,
    run_async,
    send_act,
    started_hand,
)

pytestmark = [pytest.mark.django_db(transaction=True)]


class TestAdminHidesTheDeck:
    """The admin page of a running hand showed its config, deck included (spec.md: nobody sees
    face-down cards)."""

    def admin_page(self, hand) -> str:
        admin = User.objects.create_superuser("boss", "boss@example.com", "pw-123456789")
        client = Client()
        client.force_login(admin)
        page = client.get(f"/admin/games/hand/{hand.pk}/change/")
        assert page.status_code == 200
        return page.content.decode()

    def test_a_running_hands_deck_is_not_shown(self):
        room, a, b = heads_up_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            await started_hand(ca, cb)

        async_to_sync(body)()  # no run_async: the hand keeps running while staff look at it
        try:
            hand = Hand.objects.get(room=room)
            assert hand.completed_at is None
            html = self.admin_page(hand)
            assert "deck" not in html
            assert [card for card in hand.config["deck"] if f"&quot;{card}&quot;" in html] == []
        finally:
            async_to_sync(actor_module.reset_registry_for_tests)()

    def test_a_finished_hands_config_is_shown(self):
        room, a, b = heads_up_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            conn = ca if started["payload"]["hand"]["actor"] == str(a.pk) else cb
            await send_act(conn, room, started["hand_id"], "fold-to-finish", "fold")
            await drain(conn)

        run_async(body)
        hand = Hand.objects.get(room=room)
        assert hand.completed_at is not None
        assert "deck" in self.admin_page(hand)
