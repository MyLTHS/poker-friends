"""Persistence layer: accounts, rooms, seats, the chip ledger, hands and hand commands.

Chips belong to a room, not to a global wallet (see docs/spec.md). ``LedgerEntry`` is
append-only by construction: once created, a row is never updated or deleted, so the room's
chip history can always be replayed from the ledger alone.
"""

from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models

MAX_SEATS = 9


class User(AbstractUser):
    is_guest = models.BooleanField(default=False)


class Room(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        PLAYING = "playing", "Playing"
        CLOSED = "closed", "Closed"

    name = models.CharField(max_length=100)
    owner = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name="owned_rooms", null=True, blank=True
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    max_seats = models.PositiveSmallIntegerField(default=9)
    small_blind = models.PositiveIntegerField()
    big_blind = models.PositiveIntegerField()
    think_time_seconds = models.PositiveIntegerField(default=30)
    # Fixed chip bonus every other seated player (sit-out included) owes a showdown winner
    # holding a 7 and a 2 (any suits). 0 means the room has no seven-deuce bonus.
    seven_deuce_bonus = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(max_seats__gte=2, max_seats__lte=MAX_SEATS),
                name="room_max_seats_between_2_and_9",
            ),
            models.CheckConstraint(
                condition=models.Q(small_blind__gt=0, small_blind__lt=models.F("big_blind")),
                name="room_small_blind_positive_and_below_big_blind",
            ),
        ]

    def __str__(self) -> str:
        return self.name


class RoomSeat(models.Model):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="seats")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="room_seats")
    seat = models.PositiveSmallIntegerField()
    sitting_out = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["room", "seat"], name="unique_seat_per_room"),
            models.UniqueConstraint(fields=["room", "user"], name="unique_user_per_room"),
            models.CheckConstraint(
                condition=models.Q(seat__gte=1, seat__lte=MAX_SEATS),
                name="roomseat_seat_between_1_and_9",
            ),
        ]

    def save(self, *args, **kwargs):
        # The room's own limit lives in another table, so the database cannot check it.
        if self.seat > self.room.max_seats:
            raise ValidationError(f"Seat {self.seat} is beyond this room's {self.room.max_seats}.")
        super().save(*args, **kwargs)


class LedgerKind(models.TextChoices):
    GRANT = "grant", "Grant"
    HAND = "hand", "Hand"
    SEVEN_DEUCE = "seven_deuce", "Seven-deuce bonus"


class AppendOnlyError(ValueError):
    pass


class LedgerEntryQuerySet(models.QuerySet):
    """Blocks the bulk paths that skip ``LedgerEntry.save()``/``delete()``.

    A PostgreSQL trigger (migration 0003) rejects UPDATE/DELETE for everything else, raw SQL
    included.
    """

    def update(self, **kwargs):
        raise AppendOnlyError("LedgerEntry is append-only; create a new row instead.")

    def bulk_update(self, objs, fields, batch_size=None):
        raise AppendOnlyError("LedgerEntry is append-only; create a new row instead.")

    def delete(self):
        raise AppendOnlyError("LedgerEntry is append-only; it can never be deleted.")


class LedgerEntry(models.Model):
    """A chip change for one player in one room. Append-only: never update or delete a row."""

    room = models.ForeignKey(Room, on_delete=models.PROTECT, related_name="ledger_entries")
    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="ledger_entries")
    kind = models.CharField(max_length=11, choices=LedgerKind.choices)
    amount = models.IntegerField()
    # Set for hand results (hand / seven_deuce), empty for grants. Migration 0004 adds a
    # (room, hand) foreign key on PostgreSQL so the hand is always from the same room.
    hand = models.ForeignKey(
        "Hand", on_delete=models.PROTECT, related_name="ledger_entries", null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    objects = LedgerEntryQuerySet.as_manager()

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(amount=0), name="ledgerentry_amount_nonzero"
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(kind=LedgerKind.GRANT, hand__isnull=True)
                    | models.Q(
                        kind__in=[LedgerKind.HAND, LedgerKind.SEVEN_DEUCE], hand__isnull=False
                    )
                ),
                name="ledgerentry_hand_matches_kind",
            ),
        ]

    def save(self, *args, **kwargs):
        if self.pk is not None:
            raise AppendOnlyError("LedgerEntry is append-only; create a new row instead.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise AppendOnlyError("LedgerEntry is append-only; it can never be deleted.")


class Hand(models.Model):
    """One played hand: config and actions needed for ``HandEngine.replay()``."""

    room = models.ForeignKey(Room, on_delete=models.PROTECT, related_name="hands")
    hand_no = models.PositiveIntegerField()
    button_seat = models.PositiveSmallIntegerField()
    config = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["room", "hand_no"], name="unique_hand_no_per_room"),
            # Target of the ledger's (room, hand) foreign key; see LedgerEntry.hand.
            models.UniqueConstraint(fields=["room", "id"], name="unique_hand_id_per_room"),
        ]


class HandCommand(models.Model):
    """A player command already applied to a hand; ``command_id`` makes replays idempotent."""

    hand = models.ForeignKey(Hand, on_delete=models.CASCADE, related_name="commands")
    player = models.ForeignKey(User, on_delete=models.PROTECT, related_name="hand_commands")
    command_id = models.CharField(max_length=64)
    kind = models.CharField(max_length=10)
    amount = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["hand", "command_id"], name="unique_command_id_per_hand"
            ),
        ]
