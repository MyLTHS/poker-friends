"""Persistence layer for B2: rooms, seats, the chip ledger, hands and hand commands.

The one invariant that must hold no matter what: a room's ledger total is always exactly the
chips granted to that room. Hand results redistribute chips among players (net zero across a
hand), they never create or destroy any.
"""

import pytest
from django.core.exceptions import ValidationError
from django.db import DatabaseError, IntegrityError, connection, transaction
from django.db.models import Sum

from apps.games.models import (
    AppendOnlyError,
    Hand,
    HandCommand,
    LedgerEntry,
    LedgerKind,
    Room,
    RoomSeat,
    User,
)

pytestmark = pytest.mark.django_db

# Triggers and cross-table foreign keys only exist on PostgreSQL (what CI and Docker run).
postgres_only = pytest.mark.skipif(
    connection.vendor != "postgresql", reason="needs the PostgreSQL-only constraints"
)


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


def make_hand(room: Room, hand_no: int = 1) -> Hand:
    return Hand.objects.create(room=room, hand_no=hand_no, button_seat=1, config={})


def make_grant(amount: int = 1000) -> LedgerEntry:
    return LedgerEntry.objects.create(
        room=make_room(), user=make_user("alice"), kind=LedgerKind.GRANT, amount=amount
    )


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
        hand = make_hand(room)
        LedgerEntry.objects.create(
            room=room, user=alice, kind=LedgerKind.HAND, amount=50, hand=hand
        )
        LedgerEntry.objects.create(room=room, user=bob, kind=LedgerKind.HAND, amount=-50, hand=hand)

        total = LedgerEntry.objects.filter(room=room).aggregate(total=Sum("amount"))["total"]
        assert total == granted

    def test_seven_deuce_bonus_does_not_change_the_room_total_either(self):
        room = make_room()
        alice, bob = make_user("alice"), make_user("bob")
        LedgerEntry.objects.create(room=room, user=alice, kind=LedgerKind.GRANT, amount=1000)
        LedgerEntry.objects.create(room=room, user=bob, kind=LedgerKind.GRANT, amount=1000)
        granted = LedgerEntry.objects.filter(room=room).aggregate(total=Sum("amount"))["total"]

        hand = make_hand(room)
        LedgerEntry.objects.create(
            room=room, user=alice, kind=LedgerKind.SEVEN_DEUCE, amount=50, hand=hand
        )
        LedgerEntry.objects.create(
            room=room, user=bob, kind=LedgerKind.SEVEN_DEUCE, amount=-50, hand=hand
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

    def test_queryset_update_is_blocked(self):
        entry = make_grant()

        with pytest.raises(AppendOnlyError):
            LedgerEntry.objects.filter(pk=entry.pk).update(amount=999999)
        assert LedgerEntry.objects.get(pk=entry.pk).amount == 1000

    def test_queryset_delete_is_blocked(self):
        entry = make_grant()

        with pytest.raises(AppendOnlyError):
            LedgerEntry.objects.filter(pk=entry.pk).delete()
        assert LedgerEntry.objects.filter(pk=entry.pk).exists()

    def test_bulk_update_is_blocked(self):
        entry = make_grant()
        entry.amount = 999999

        with pytest.raises(AppendOnlyError):
            LedgerEntry.objects.bulk_update([entry], ["amount"])
        assert LedgerEntry.objects.get(pk=entry.pk).amount == 1000

    @postgres_only
    def test_the_database_rejects_a_raw_update(self):
        entry = make_grant()

        with pytest.raises(DatabaseError, match="append-only"):
            with transaction.atomic(), connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE games_ledgerentry SET amount = 999999 WHERE id = %s", [entry.pk]
                )
        assert LedgerEntry.objects.get(pk=entry.pk).amount == 1000

    @postgres_only
    def test_the_database_rejects_a_raw_delete(self):
        entry = make_grant()

        with pytest.raises(DatabaseError, match="append-only"):
            with transaction.atomic(), connection.cursor() as cursor:
                cursor.execute("DELETE FROM games_ledgerentry WHERE id = %s", [entry.pk])
        assert LedgerEntry.objects.filter(pk=entry.pk).exists()

    @postgres_only
    def test_the_base_manager_cannot_bypass_the_database_either(self):
        entry = make_grant()

        with pytest.raises(DatabaseError, match="append-only"):
            with transaction.atomic():
                LedgerEntry._base_manager.filter(pk=entry.pk).update(amount=999999)
        assert LedgerEntry.objects.get(pk=entry.pk).amount == 1000


def assert_rejected(create) -> None:
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            create()


class TestRoomConstraints:
    @pytest.mark.parametrize("max_seats", [0, 1, 10])
    def test_max_seats_is_between_2_and_9(self, max_seats):
        assert_rejected(lambda: make_room(max_seats=max_seats))

    def test_small_blind_must_be_positive(self):
        assert_rejected(lambda: make_room(small_blind=0, big_blind=2))

    @pytest.mark.parametrize("small_blind", [2, 3])
    def test_small_blind_is_below_big_blind(self, small_blind):
        assert_rejected(lambda: make_room(small_blind=small_blind, big_blind=2))


class TestRoomSeatConstraints:
    @pytest.mark.parametrize("seat", [0, 10])
    def test_seat_is_between_1_and_9(self, seat):
        room, alice = make_room(), make_user("alice")
        # bulk_create skips save(), so this proves the database itself rejects the row.
        assert_rejected(
            lambda: RoomSeat.objects.bulk_create([RoomSeat(room=room, user=alice, seat=seat)])
        )

    def test_seat_must_fit_the_room(self):
        room, alice = make_room(max_seats=6), make_user("alice")

        with pytest.raises(ValidationError):
            RoomSeat.objects.create(room=room, user=alice, seat=7)
        assert not RoomSeat.objects.exists()

    def test_the_last_seat_of_the_room_is_fine(self):
        room, alice = make_room(max_seats=6), make_user("alice")
        RoomSeat.objects.create(room=room, user=alice, seat=6)


class TestLedgerConstraints:
    def test_amount_cannot_be_zero(self):
        room, alice = make_room(), make_user("alice")
        assert_rejected(
            lambda: LedgerEntry.objects.create(
                room=room, user=alice, kind=LedgerKind.GRANT, amount=0
            )
        )

    @pytest.mark.parametrize("kind", [LedgerKind.HAND, LedgerKind.SEVEN_DEUCE])
    def test_hand_results_need_a_hand(self, kind):
        room, alice = make_room(), make_user("alice")
        assert_rejected(
            lambda: LedgerEntry.objects.create(room=room, user=alice, kind=kind, amount=50)
        )

    def test_a_grant_does_not_belong_to_a_hand(self):
        room, alice = make_room(), make_user("alice")
        hand = make_hand(room)
        assert_rejected(
            lambda: LedgerEntry.objects.create(
                room=room, user=alice, kind=LedgerKind.GRANT, amount=50, hand=hand
            )
        )

    def test_kind_must_be_known(self):
        room, alice = make_room(), make_user("alice")
        assert_rejected(
            lambda: LedgerEntry.objects.create(room=room, user=alice, kind="gift", amount=50)
        )

    @postgres_only
    def test_the_hand_must_be_in_the_same_room(self):
        room, other_room, alice = make_room(name="A"), make_room(name="B"), make_user("alice")
        other_hand = make_hand(other_room)

        with pytest.raises(IntegrityError, match="games_ledgerentry_hand_same_room"):
            with transaction.atomic():
                LedgerEntry.objects.create(
                    room=room, user=alice, kind=LedgerKind.HAND, amount=50, hand=other_hand
                )


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
