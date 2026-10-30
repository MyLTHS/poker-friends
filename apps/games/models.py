"""Persistence layer: accounts, rooms, seats, the chip ledger, hands and hand commands.

Chips belong to a room, not to a global wallet (see docs/spec.md). ``LedgerEntry`` and
``HandCommand`` are append-only: once created, a row is never updated or deleted, so a room's
chip history and every hand can always be replayed from them alone.
"""

from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

MAX_SEATS = 9
# A room made without a starting stack gives this many big blinds, up to the cap. The cap keeps a
# table of rebuys far below what a ledger amount (a 32-bit integer) can hold.
STARTING_STACK_BIG_BLINDS = 100
MAX_STARTING_STACK = 10_000_000
# Seconds between two hands the owner may pick (Room.hand_pause_seconds).
MIN_HAND_PAUSE, MAX_HAND_PAUSE = 6, 20


class User(AbstractUser):
    is_guest = models.BooleanField(default=False)


class Room(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        PLAYING = "playing", "Playing"  # never stored: clients get it while a hand runs
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
    # The break between two hands, in seconds: the result stays on the table (the web's end of
    # hand animations take up to about 5.5 s, hence at least 6).
    hand_pause_seconds = models.PositiveSmallIntegerField(default=10)
    # Hands are dealt only while the owner has the room running (Start / Pause); kept here so a
    # restart does not change it. A new room, and every room from before this, starts paused.
    running = models.BooleanField(default=False)
    # Fixed chip bonus every other seated player (sit-out included) owes a player who wins the
    # pot holding a 7 and a 2 (any suits) because everyone else folded: a successful bluff, a
    # walk included; never at showdown (spec.md #27). 0 means the room has no seven-deuce bonus.
    seven_deuce_bonus = models.PositiveIntegerField(default=0)
    # Dead money every player dealt in puts in before the blinds; 0 = no ante.
    ante = models.PositiveIntegerField(default=0)
    # Every bomb_pot_every-th hand (by hand number) is a bomb pot: everyone dealt in puts in
    # bomb_pot_amount, no blinds, no betting before the flop. 0 = no bomb pots.
    bomb_pot_every = models.PositiveIntegerField(default=0)
    bomb_pot_amount = models.PositiveIntegerField(default=0)
    # All in before the river with the betting over: deal the rest of the board twice, each
    # board deciding half of every pot.
    run_it_twice = models.BooleanField(default=False)
    # A hand won before the river shows the board cards that would have come (no chips move).
    rabbit_hunt = models.BooleanField(default=True)
    # Chips a player gets on sitting down with nothing in this room, and again on a rebuy once
    # busted; each time a grant in the ledger. Left out: STARTING_STACK_BIG_BLINDS big blinds
    # (at most MAX_STARTING_STACK).
    starting_stack = models.PositiveIntegerField()
    # Private rooms are hidden from the lobby; only the owner and members (who opened the invite
    # link) see them. The token is in the invite link; rotating it kills old links.
    is_private = models.BooleanField(default=False)
    invite_token = models.CharField(max_length=43, unique=True, null=True, blank=True)
    # Owner's changes made during a hand, applied when it ends (B7). Stored so a restart in
    # the middle of that hand does not forget them.
    pending_settings = models.JSONField(default=dict, blank=True)
    closing = models.BooleanField(default=False)
    # Since when nobody is seated (spectators do not count; a seated player sitting out or with
    # no chips does): set when the last seat is freed, and on creation; null while someone sits.
    # ROOM_IDLE_CLOSE_SECONDS after it the room closes itself (actor.py, "idle close").
    empty_since = models.DateTimeField(null=True, blank=True, default=timezone.now)
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
            models.CheckConstraint(
                condition=models.Q(starting_stack__gt=0), name="room_starting_stack_positive"
            ),
            models.CheckConstraint(
                condition=models.Q(bomb_pot_every=0) | models.Q(bomb_pot_amount__gt=0),
                name="room_bomb_pot_has_an_amount",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    hand_pause_seconds__gte=MIN_HAND_PAUSE, hand_pause_seconds__lte=MAX_HAND_PAUSE
                ),
                name="room_hand_pause_between_6_and_20",
            ),
        ]

    def __str__(self) -> str:
        return self.name

    def engine_rules(self) -> dict[str, int | bool]:
        """The room's house rules as ``TableSession`` keyword arguments."""
        return {
            "seven_deuce_bonus": self.seven_deuce_bonus,
            "ante": self.ante,
            "bomb_pot_every": self.bomb_pot_every,
            "bomb_pot_amount": self.bomb_pot_amount,
            "run_it_twice": self.run_it_twice,
            "rabbit_hunt": self.rabbit_hunt,
        }

    def save(self, *args, **kwargs):
        if self.starting_stack is None:
            self.starting_stack = min(
                STARTING_STACK_BIG_BLINDS * self.big_blind, MAX_STARTING_STACK
            )
        super().save(*args, **kwargs)


class RoomSeat(models.Model):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="seats")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="room_seats")
    seat = models.PositiveSmallIntegerField()
    sitting_out = models.BooleanField(default=False)
    # Asked to leave during a hand they are in: the row goes when that hand ends. Stored so a
    # restart before then does not forget it.
    leaving = models.BooleanField(default=False)

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
    # Rule #27 as settled for this hand, or null when there was no award:
    # {"player_id": bluffer, "bonus": room's bonus then, "payments": [{"player_id", "amount"}],
    #  "total": sum of payments}. Written with the result (services.save_completed_hand).
    seven_deuce = models.JSONField(null=True, blank=True)
    # Cards players chose to show the table after the hand (command.show_cards), in that order:
    # [{"player_id", "seat", "cards"}].
    shown_cards = models.JSONField(default=list, blank=True)
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


class ChatMessage(models.Model):
    """One chat line in a room (B8)."""

    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="chat_messages")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="chat_messages")
    text = models.CharField(max_length=300)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["room_id", "id"]


class OwnerAction(AppendOnlyModel):
    """Log of every owner power used in a room, by its owner or by staff (B8).

    Staff may act as the owner of any room through the same API, so this is also the admin's
    audit log. Append-only like the ledger, so nobody can tidy it up afterwards.
    """

    class Kind(models.TextChoices):
        GRANT = "grant", "Grant chips"
        SETTINGS = "settings", "Change settings"
        KICK = "kick", "Kick"
        CLOSE = "close", "Close room"
        INVITE = "invite", "Rotate invite link"
        START = "start", "Start room"
        PAUSE = "pause", "Pause room"
        # Not an owner power: the server closed a room nobody sat in for ROOM_IDLE_CLOSE_SECONDS.
        # Logged here so the room's history says why it closed; user is null (nobody did it).
        AUTO_CLOSE = "auto_close", "Closed automatically (empty)"

    room = models.ForeignKey(Room, on_delete=models.PROTECT, related_name="owner_actions")
    # null only for what the server did by itself (AUTO_CLOSE).
    user = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name="owner_actions", null=True, blank=True
    )
    by_staff = models.BooleanField(help_text="Done by staff in a room they do not own.")
    kind = models.CharField(max_length=10, choices=Kind.choices)
    details = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-id"]
