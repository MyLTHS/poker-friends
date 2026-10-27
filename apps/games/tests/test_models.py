"""Persistence layer for B2: rooms, seats, the chip ledger, hands and hand commands.

The one invariant that must hold no matter what: a room's ledger total is always exactly the
chips granted to that room. Hand results redistribute chips among players (net zero across a
hand), they never create or destroy any.
"""

import pytest
from django.db import IntegrityError, transaction
from django.db.models import Sum

from apps.games.models import Hand, HandCommand, LedgerEntry, LedgerKind, Room, RoomSeat, User

pytestmark = pytest.mark.django_db


def make_room(**kwargs) -> Room:
    defaults = {"name": "Table 1", "small_blind": 1, "big_blind": 2}
    defaults.update(kwargs)
    return Room.objects.create(**defaults)


class TestRoomConfig:
    def test_seven_deuce_bonus_defaults_to_disabled(self):
        room = make_room()
        assert room.seven_deuce_bonus == 0

    def test_a_room_can_configure_a_seven_deuce_bonus(self):
        room = make_room(seven_deuce_bonus=50)
        assert Room.objects.get(pk=room.pk).seven_deuce_bonus == 50


def make_user(username: str, is_guest: bool = False) -> User:
    return User.objects.create_user(username=username, is_guest=is_guest)


class TestLedgerInvariant:
    def test_grant_only_sums_to_itself(self):
        room = make_room()
        alice, bob = make_user("alice"), make_user("bob")
        LedgerEntry.objects.create(room=room, user=alice, kind=LedgerKind.GRANT, amount=1000)
        LedgerEntry.objects.create(room=room, user=bob, kind=LedgerKind.GRANT, amount=1000)

        total = LedgerEntry.objects.filter(room=room).aggregate(total=Sum("amount"))["total"]
        assert total == 2000

    def test_hand_results_do_not_change_the_room_total(self):
        room = make_room()
        alice, bob = make_user("alice"), make_user("bob")
        LedgerEntry.objects.create(room=room, user=alice, kind=LedgerKind.GRANT, amount=1000)
        LedgerEntry.objects.create(room=room, user=bob, kind=LedgerKind.GRANT, amount=1000)
        granted = LedgerEntry.objects.filter(room=room).aggregate(total=Sum("amount"))["total"]

        # Alice wins 50 off Bob: a zero-sum pair of entries for the same hand.
        LedgerEntry.objects.create(
            room=room, user=alice, kind=LedgerKind.HAND, amount=50, hand_no=1
        )
        LedgerEntry.objects.create(room=room, user=bob, kind=LedgerKind.HAND, amount=-50, hand_no=1)

        total = LedgerEntry.objects.filter(room=room).aggregate(total=Sum("amount"))["total"]
        assert total == granted

    def test_seven_deuce_bonus_does_not_change_the_room_total_either(self):
        room = make_room()
        alice, bob = make_user("alice"), make_user("bob")
        LedgerEntry.objects.create(room=room, user=alice, kind=LedgerKind.GRANT, amount=1000)
        LedgerEntry.objects.create(room=room, user=bob, kind=LedgerKind.GRANT, amount=1000)
        granted = LedgerEntry.objects.filter(room=room).aggregate(total=Sum("amount"))["total"]

        LedgerEntry.objects.create(
            room=room, user=alice, kind=LedgerKind.SEVEN_DEUCE, amount=50, hand_no=1
        )
        LedgerEntry.objects.create(
            room=room, user=bob, kind=LedgerKind.SEVEN_DEUCE, amount=-50, hand_no=1
        )

        total = LedgerEntry.objects.filter(room=room).aggregate(total=Sum("amount"))["total"]
        assert total == granted

    def test_entries_from_another_room_are_not_counted(self):
        room_a, room_b = make_room(name="A"), make_room(name="B")
        alice = make_user("alice")
        LedgerEntry.objects.create(room=room_a, user=alice, kind=LedgerKind.GRANT, amount=500)
        LedgerEntry.objects.create(room=room_b, user=alice, kind=LedgerKind.GRANT, amount=300)

        total_a = LedgerEntry.objects.filter(room=room_a).aggregate(total=Sum("amount"))["total"]
        assert total_a == 500


class TestLedgerAppendOnly:
    def test_cannot_modify_an_existing_entry(self):
        room = make_room()
        alice = make_user("alice")
        entry = LedgerEntry.objects.create(
            room=room, user=alice, kind=LedgerKind.GRANT, amount=1000
        )

        entry.amount = 999999
        with pytest.raises(ValueError):
            entry.save()

    def test_cannot_delete_an_existing_entry(self):
        room = make_room()
        alice = make_user("alice")
        entry = LedgerEntry.objects.create(
            room=room, user=alice, kind=LedgerKind.GRANT, amount=1000
        )

        with pytest.raises(ValueError):
            entry.delete()


class TestRoomSeat:
    def test_a_seat_is_unique_within_a_room(self):
        room = make_room()
        alice, bob = make_user("alice"), make_user("bob")
        RoomSeat.objects.create(room=room, user=alice, seat=1)

        with pytest.raises(IntegrityError):
            with transaction.atomic():
                RoomSeat.objects.create(room=room, user=bob, seat=1)

    def test_a_user_cannot_sit_twice_in_the_same_room(self):
        room = make_room()
        alice = make_user("alice")
        RoomSeat.objects.create(room=room, user=alice, seat=1)

        with pytest.raises(IntegrityError):
            with transaction.atomic():
                RoomSeat.objects.create(room=room, user=alice, seat=2)


class TestHandCommandIdempotency:
    def test_the_same_command_id_cannot_be_applied_twice_to_a_hand(self):
        room = make_room()
        alice = make_user("alice")
        hand = Hand.objects.create(room=room, hand_no=1, config={}, button_seat=1)
        HandCommand.objects.create(
            hand=hand, player=alice, command_id="cmd-1", kind="call", amount=None
        )

        with pytest.raises(IntegrityError):
            with transaction.atomic():
                HandCommand.objects.create(
                    hand=hand, player=alice, command_id="cmd-1", kind="call", amount=None
                )


class TestGuestUpgrade:
    def test_a_guest_keeps_its_chips_and_history_after_upgrading(self):
        room = make_room()
        guest = make_user("guest-123", is_guest=True)
        LedgerEntry.objects.create(room=room, user=guest, kind=LedgerKind.GRANT, amount=500)

        guest.is_guest = False
        guest.email = "real@example.com"
        guest.save(update_fields=["is_guest", "email"])

        total = LedgerEntry.objects.filter(room=room, user=guest).aggregate(total=Sum("amount"))[
            "total"
        ]
        assert total == 500
        assert User.objects.get(pk=guest.pk).is_guest is False
