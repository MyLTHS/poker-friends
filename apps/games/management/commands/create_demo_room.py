"""Create a room for trying the table actor by hand (room creation through the API is B7).

With ``--players N`` it also seats N guest players with chips and prints a ``sessionid`` cookie
for each, so a WebSocket client can connect as that player. Granting chips through the running
server is B7, so run this **before** the server touches the room. Development only.
"""

from django.conf import settings
from django.contrib.auth import BACKEND_SESSION_KEY, HASH_SESSION_KEY, SESSION_KEY
from django.contrib.sessions.backends.db import SessionStore
from django.core.management.base import BaseCommand, CommandError

from apps.accounts.services import MODEL_BACKEND, mark_email_verified
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
        seated = seat_guest_players(room, players, options["chips"])
        for seat, (user, session_key) in enumerate(seated, start=1):
            self.stdout.write(f"seat {seat}: player {user.pk} sessionid={session_key}")


def seat_guest_players(room: Room, players: int, chips: int) -> list[tuple[User, str]]:
    """Seat ``players`` new players in seats 1..players with ``chips`` each, logged in.

    Guests where guests may play; otherwise accounts with a verified made-up email, so they pass
    the members-only check too. Returns each with a ``sessionid`` cookie value a WebSocket
    client can connect with.
    """
    seated = []
    for seat in range(1, players + 1):
        name = f"demo-{room.pk}-{seat}"
        if settings.GUESTS_ALLOWED:
            user = User.objects.create_user(username=name, is_guest=True)
        else:
            user = User.objects.create_user(
                username=name, email=f"{name}@bots.invalid", approved=True
            )
            mark_email_verified(user)
        RoomSeat.objects.create(room=room, user=user, seat=seat)
        LedgerEntry.objects.create(room=room, user=user, kind=LedgerKind.GRANT, amount=chips)
        session = SessionStore()
        # A Django-auth login session, the same as POST /api/auth/guest/ would create.
        session[SESSION_KEY] = str(user.pk)
        session[BACKEND_SESSION_KEY] = MODEL_BACKEND
        session[HASH_SESSION_KEY] = user.get_session_auth_hash()
        session.create()
        seated.append((user, session.session_key))
    return seated
