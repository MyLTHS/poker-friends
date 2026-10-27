"""Void an unfinished hand whose replay fails, so its room can play again (ADR-001 mục 5.4).

Chips only move when a hand completes (``save_completed_hand``), so an unfinished hand has no
ledger entries: voiding it puts every player back to their balance before the hand. The
``HandCommand`` log stays untouched (append-only) for investigation. The running server keeps
the room suspended in memory: restart it afterwards so the room is rebuilt from the database.
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.games.engine.hand import HandEngine
from apps.games.models import Hand


class Command(BaseCommand):
    help = "Void an unfinished hand (replay failed). Restart the server afterwards."

    def add_arguments(self, parser):
        parser.add_argument("hand_id", type=int)
        parser.add_argument("--reason", required=True, help="Why, kept in Hand.result.")
        parser.add_argument(
            "--force",
            action="store_true",
            help="Void even a hand that replays fine. Only with the server stopped: the running "
            "table would otherwise finish that hand and fail to store it.",
        )

    def handle(self, *args, **options):
        hand_id = options["hand_id"]
        with transaction.atomic():
            hand = Hand.objects.select_for_update().filter(pk=hand_id).first()
            if hand is None:
                raise CommandError(f"No hand {hand_id}.")
            if hand.completed_at is not None:
                raise CommandError(f"Hand {hand_id} is already finished.")
            if hand.ledger_entries.exists():
                raise CommandError(f"Hand {hand_id} has ledger entries; it is not unfinished.")
            if not options["force"] and _replays(hand):
                raise CommandError(
                    f"Hand {hand_id} replays fine, so the server can resume it: restart the "
                    "server instead. To void it anyway, stop the server and add --force."
                )
            hand.completed_at = timezone.now()
            hand.result = {"voided": True, "reason": options["reason"]}
            hand.save(update_fields=["completed_at", "result"])
        self.stdout.write(
            self.style.SUCCESS(
                f"Voided hand {hand_id} of room {hand.room_id}. Restart the server so the room "
                "reloads from the database."
            )
        )


def _replays(hand: Hand) -> bool:
    try:
        HandEngine.replay(hand.replay_record())
    except Exception:
        return False
    return True
