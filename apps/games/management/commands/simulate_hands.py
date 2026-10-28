"""Fill the database with a room of random-bot hands, stored the way the server stores them.

For the CI restore drill (backup -> restore -> ``check_ledger``) and for trying admin pages on
real-looking data. Each hand goes through the same writes as the table actor: a ``Hand`` row
at the deal, one ``HandCommand`` per action, then ``save_completed_hand``. Never run it on
production, nor while the server is running: the server would not know about these hands.
"""

import random

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.games.engine.cards import shuffled_deck
from apps.games.engine.simulate import random_action
from apps.games.engine.table import TableSession
from apps.games.models import Hand, HandCommand, LedgerEntry, LedgerKind, Room, RoomSeat, User
from apps.games.services import save_completed_hand


class Command(BaseCommand):
    help = "Create a room and play random hands into the database. Development and CI only."

    def add_arguments(self, parser):
        parser.add_argument("--name", default="Bàn mô phỏng")
        parser.add_argument("--hands", type=int, default=20)
        parser.add_argument("--players", type=int, default=4)
        parser.add_argument("--chips", type=int, default=200)
        parser.add_argument("--seven-deuce-bonus", type=int, default=0)
        parser.add_argument("--seed", type=int, default=0)
        parser.add_argument(
            "--leave-unfinished",
            action="store_true",
            help="Deal one more hand and stop it midway, like a server that died mid-hand.",
        )

    def handle(self, *args, **options):
        players, hands = options["players"], options["hands"]
        if not 2 <= players <= 9:
            raise CommandError("--players must be between 2 and 9.")
        if hands < 1 or options["chips"] < 1:
            raise CommandError("--hands and --chips must be positive.")
        rng = random.Random(options["seed"])
        with transaction.atomic():
            room = Room.objects.create(
                name=options["name"],
                small_blind=1,
                big_blind=2,
                seven_deuce_bonus=options["seven_deuce_bonus"],
            )
            session = TableSession(
                room.small_blind,
                room.big_blind,
                shuffle=lambda: shuffled_deck(rng),
                seven_deuce_bonus=room.seven_deuce_bonus,
            )
            for seat in range(1, players + 1):
                user = User.objects.create_user(username=f"sim-{room.pk}-{seat}", is_guest=True)
                RoomSeat.objects.create(room=room, user=user, seat=seat)
                session.take_seat(str(user.pk), seat)
            for _ in range(hands):
                _top_up(room, session, options["chips"])
                _play_hand(room, session, rng, finish=True)
            if options["leave_unfinished"]:
                _top_up(room, session, options["chips"])
                _play_hand(room, session, rng, finish=False)
        self.stdout.write(
            self.style.SUCCESS(f"Room {room.pk}: {session.hand_no} hands, {players} players.")
        )


def _top_up(room: Room, session: TableSession, chips: int) -> None:
    """The owner grants chips to anyone who went bust, as in the engine simulation."""
    for player in session.seats.values():
        if session.stacks.get(player, 0) == 0:
            session.grant_chips(player, chips)
            LedgerEntry.objects.create(
                room=room, user_id=int(player), kind=LedgerKind.GRANT, amount=chips
            )


def _play_hand(room: Room, session: TableSession, rng: random.Random, finish: bool) -> None:
    engine = session.start_hand()
    hand = Hand.objects.create(
        room=room,
        hand_no=session.hand_no,
        button_seat=engine.config.button_seat,
        config=engine.record()["config"],
    )
    sequence = 0
    while not engine.is_complete:
        if not finish and sequence == 1:
            return  # one command recorded, then the "server" dies
        action = random_action(engine, rng)
        sequence += 1
        HandCommand.objects.create(
            hand=hand,
            player_id=int(action.player_id),
            sequence=sequence,
            command_id=f"sim-{hand.pk}-{sequence}",
            kind=str(action.kind),
            amount=action.amount,
        )
        engine.act(action)
    before = len(session.ledger)
    session.finish_hand()
    save_completed_hand(room, hand.hand_no, engine, session.ledger[before:])
