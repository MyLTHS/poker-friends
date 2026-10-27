"""Create a room for trying the table actor by hand (room creation through the API is B7).

With ``--players N`` it also seats N guest players with chips and prints a ``sessionid`` cookie
for each, so a WebSocket client can connect as that player. Granting chips through the running
server is B7, so run this **before** the server touches the room. Development only.
"""

from django.contrib.sessions.backends.db import SessionStore
from django.core.management.base import BaseCommand, CommandError

from apps.games.accounts import SESSION_KEY
from apps.games.models import LedgerEntry, LedgerKind, Room, RoomSeat, User


class Command(BaseCommand):
    help = "Create (or reuse) a demo room; optionally seat guest players with chips."

    def add_arguments(self, parser):
        parser.add_argument("--name", default="Bàn demo")
        parser.add_argument("--small-blind", type=int, default=5)
        parser.add_argument("--big-blind", type=int, default=10)
        parser.add_argument("--think-time", type=int, default=30)
        parser.add_argument("--seven-deuce-bonus", type=int, default=0)
        parser.add_argument("--players", type=int, default=0)
        parser.add_argument("--chips", type=int, default=1000)

    def handle(self, *args, **options):
        room, created = Room.objects.get_or_create(
            name=options["name"],
            defaults={
                "small_blind": options["small_blind"],
                "big_blind": options["big_blind"],
                "think_time_seconds": options["think_time"],
                "seven_deuce_bonus": options["seven_deuce_bonus"],
            },
        )
        verb = "Created" if created else "Reusing"
        self.stdout.write(self.style.SUCCESS(f"{verb} room {room.pk} ({room.name})"))
        players = options["players"]
        if not players:
            return
        if not created:
            raise CommandError("--players needs a new room; pass another --name.")
        if not 2 <= players <= room.max_seats:
            raise CommandError(f"--players must be between 2 and {room.max_seats}.")
        for seat in range(1, players + 1):
            user = User.objects.create(username=f"demo-{room.pk}-{seat}", is_guest=True)
            RoomSeat.objects.create(room=room, user=user, seat=seat)
            LedgerEntry.objects.create(
                room=room, user=user, kind=LedgerKind.GRANT, amount=options["chips"]
            )
            session = SessionStore()
            session[SESSION_KEY] = user.pk
            session.create()
            self.stdout.write(f"seat {seat}: player {user.pk} sessionid={session.session_key}")
