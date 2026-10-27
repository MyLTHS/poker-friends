"""Persistence layer: accounts, rooms, seats, the chip ledger, hands and hand commands.

Chips belong to a room, not to a global wallet (see docs/spec.md). ``LedgerEntry`` is
append-only by construction: once created, a row is never updated or deleted, so the room's
chip history can always be replayed from the ledger alone.
"""

from django.contrib.auth.models import AbstractUser
from django.db import models


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
    created_at = models.DateTimeField(auto_now_add=True)

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
        ]


class LedgerKind(models.TextChoices):
    GRANT = "grant", "Grant"
    HAND = "hand", "Hand"


class AppendOnlyError(ValueError):
    pass


class LedgerEntry(models.Model):
    """A chip change for one player in one room. Append-only: never update or delete a row."""

    room = models.ForeignKey(Room, on_delete=models.PROTECT, related_name="ledger_entries")
    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="ledger_entries")
    kind = models.CharField(max_length=10, choices=LedgerKind.choices)
    amount = models.IntegerField()
    hand_no = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

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
