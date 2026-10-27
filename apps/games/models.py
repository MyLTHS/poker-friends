"""Persistence layer: accounts, rooms, seats, the chip ledger, hands and hand commands.

Chips belong to a room, not to a global wallet (see docs/spec.md). ``LedgerEntry`` and
``HandCommand`` are append-only: once created, a row is never updated or deleted, so a room's
chip history and every hand can always be replayed from them alone.
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
    # Private rooms are hidden from the lobby; only the owner and members (who opened the invite
    # link) see them. The token is in the invite link; rotating it kills old links.
    is_private = models.BooleanField(default=False)
    invite_token = models.CharField(max_length=43, unique=True, null=True, blank=True)
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
        # Readable early error; triggers from migration 0006 enforce the same rule in the DB.
        if self.seat > self.room.max_seats:
            raise ValidationError(f"Seat {self.seat} is beyond this room's {self.room.max_seats}.")
        super().save(*args, **kwargs)


class RoomMember(models.Model):
    """Someone allowed into a private room: joined through its invite link (or the owner)."""

    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="members")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="room_memberships")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["room", "user"], name="unique_member_per_room")
        ]


class RoomBan(models.Model):
    """Someone the owner kicked: they cannot see (if private), join or sit in the room again."""

    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="bans")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="room_bans")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["room", "user"], name="unique_ban_per_room")]


class LedgerKind(models.TextChoices):
    GRANT = "grant", "Grant"
    HAND = "hand", "Hand"
    SEVEN_DEUCE = "seven_deuce", "Seven-deuce bonus"


class AppendOnlyError(ValueError):
    pass


def _append_only(model, action: str) -> AppendOnlyError:
    return AppendOnlyError(f"{model.__name__} is append-only; a row can never be {action}.")


class AppendOnlyQuerySet(models.QuerySet):
    """Blocks the bulk paths that skip ``AppendOnlyModel.save()``/``delete()``."""

    def update(self, **kwargs):
        raise _append_only(self.model, "updated")

    def bulk_update(self, objs, fields, batch_size=None):
        raise _append_only(self.model, "updated")

    def delete(self):
        raise _append_only(self.model, "deleted")


class AppendOnlyModel(models.Model):
    """Rows are only ever inserted. PostgreSQL triggers (migrations 0003 and 0007) also reject
    UPDATE/DELETE from every other path, raw SQL included.
    """

    objects = AppendOnlyQuerySet.as_manager()

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if self.pk is not None:
            raise _append_only(type(self), "updated")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise _append_only(type(self), "deleted")


class LedgerEntry(AppendOnlyModel):
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


class Hand(models.Model):
    """One played hand: config and actions needed for ``HandEngine.replay()``.

    In the engine a player is identified by ``str(user.pk)``; ``config`` and ``result`` use
    that id too.
    """

    room = models.ForeignKey(Room, on_delete=models.PROTECT, related_name="hands")
    hand_no = models.PositiveIntegerField()
    button_seat = models.PositiveSmallIntegerField()
    config = models.JSONField()
    # ``HandResult`` as computed when the hand finished, kept to check replays against; or
    # ``{"voided": true, "reason": ...}`` for an unfinished hand voided by ``void_hand`` (B5).
    result = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["room_id", "hand_no"]
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(completed_at__isnull=True, result__isnull=True)
                    | models.Q(completed_at__isnull=False, result__isnull=False)
                ),
                name="hand_result_iff_completed",
            ),
            models.UniqueConstraint(fields=["room", "hand_no"], name="unique_hand_no_per_room"),
            # Target of the ledger's (room, hand) foreign key; see LedgerEntry.hand.
            models.UniqueConstraint(fields=["room", "id"], name="unique_hand_id_per_room"),
        ]

    def replay_record(self) -> dict:
        """The record ``HandEngine.replay()`` takes, rebuilt from the stored command log."""
        return {
            "config": self.config,
            "actions": [
                {"player_id": str(c.player_id), "kind": c.kind, "amount": c.amount}
                for c in self.commands.all()
            ],
        }


class HandCommand(AppendOnlyModel):
    """A player command already applied to a hand; ``command_id`` makes replays idempotent.

    ``sequence`` (1, 2, 3...) is the order the engine applied the commands in, which is the
    order a replay must use.
    """

    # The command log is how a hand is recovered: append-only, and PROTECT so deleting the
    # hand cannot take it along.
    hand = models.ForeignKey(Hand, on_delete=models.PROTECT, related_name="commands")
    player = models.ForeignKey(User, on_delete=models.PROTECT, related_name="hand_commands")
    sequence = models.PositiveIntegerField()
    command_id = models.CharField(max_length=64)
    kind = models.CharField(max_length=10)
    amount = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["hand_id", "sequence"]
        constraints = [
            models.UniqueConstraint(
                fields=["hand", "command_id"], name="unique_command_id_per_hand"
            ),
            models.UniqueConstraint(fields=["hand", "sequence"], name="unique_sequence_per_hand"),
        ]
