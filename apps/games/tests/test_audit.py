"""Regression tests for the read-only audit of phase B, done before phase C.

Each test here failed before its fix: the audit's probes asserted the faulty behaviour.
"""

import logging

import pytest
from asgiref.sync import async_to_sync
from django.test import AsyncClient, Client

from apps.games import actor as actor_module
from apps.games.models import Hand, HandCommand, OwnerAction, Room, RoomMember, User

from .test_actor import (  # noqa: F401 (_slow_next_hand is an autouse fixture)
    _slow_next_hand,
    connect,
    drain,
    heads_up_room,
    run_async,
    send_act,
    started_hand,
)
from .test_rooms import _fresh_rate_limits, alogged_in, apost, closed_with, owned_one_player  # noqa: F401

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


class TestLockedAccount:
    """An account locked in the admin (is_active off) kept playing through its open socket."""

    def test_its_open_socket_is_closed_and_its_command_not_applied(self):
        room, a, b = heads_up_room()

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            to_act = started["payload"]["hand"]["actor"]
            conn, user = (ca, a) if to_act == str(a.pk) else (cb, b)
            await User.objects.filter(pk=user.pk).aupdate(is_active=False)
            await send_act(conn, room, started["hand_id"], "locked-account-fold", "fold")
            assert await closed_with(conn) == actor_module.KICKED_CLOSE_CODE
            assert not await HandCommand.objects.filter(command_id="locked-account-fold").aexists()

        run_async(body)


class TestKickRotatesThePrivateInvite:
    """A player kicked from a private room came back as a fresh guest through the old link."""

    def test_the_old_link_stops_working(self):
        room, owner, a = owned_one_player()
        room.is_private, room.invite_token = True, "invite-token-for-test"
        room.save()
        RoomMember.objects.create(room=room, user=a)

        async def body():
            client = await alogged_in(owner)
            kick = await apost(client, f"/api/rooms/{room.pk}/kick/", {"player_id": str(a.pk)})
            assert kick.status_code == 204
            # The same person, logged out or in a private window: a new guest, the old link.
            stranger = AsyncClient()
            join = await apost(
                stranger, "/api/rooms/join/", {"invite_token": "invite-token-for-test"}
            )
            assert join.status_code == 404

        run_async(body)
        room.refresh_from_db()
        assert room.invite_token not in (None, "invite-token-for-test")
        kick = OwnerAction.objects.get(room=room, kind=OwnerAction.Kind.KICK)
        assert kick.details == {"player_id": str(a.pk), "invite_rotated": True}

    def test_a_public_room_has_no_link_to_rotate(self):
        room, owner, a = owned_one_player()

        async def body():
            client = await alogged_in(owner)
            kick = await apost(client, f"/api/rooms/{room.pk}/kick/", {"player_id": str(a.pk)})
            assert kick.status_code == 204

        run_async(body)
        room = Room.objects.get(pk=room.pk)
        assert room.invite_token is None
        assert OwnerAction.objects.get(room=room).details == {"player_id": str(a.pk)}


class TestRejectedCommandsAreLogged:
    """ADR-001 mục 3: a rejected command is written nowhere but the log; it was not logged."""

    def test_the_log_line_has_room_hand_sender_command_and_code(self, caplog):
        caplog.set_level(logging.INFO, logger="games.actor")
        room, a, b = heads_up_room()
        seen = {}

        async def body():
            ca, cb = await connect(room, a), await connect(room, b)
            started, _ = await started_hand(ca, cb)
            a_to_act = started["payload"]["hand"]["actor"] == str(a.pk)
            conn, seen["waiting"] = (cb, b) if a_to_act else (ca, a)
            seen["hand_id"] = started["hand_id"]
            await send_act(conn, room, started["hand_id"], "out-of-turn-1", "fold")
            await drain(conn)

        run_async(body)
        [line] = [r.getMessage() for r in caplog.records if "out-of-turn-1" in r.getMessage()]
        for part in (f"room {room.pk}", f"hand {seen['hand_id']}", f"player {seen['waiting'].pk}"):
            assert part in line
        assert "not_your_turn" in line
