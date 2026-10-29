"""Options shared by the commands that create a room and play in it (not a command itself)."""

from django.core.management.base import CommandError


def add_bomb_pot_arguments(parser) -> None:
    parser.add_argument("--bomb-pot-every", type=int, default=0)
    parser.add_argument(
        "--bomb-pot-amount", type=int, default=None, help="default: 2 big blinds when on"
    )


def bomb_pot_amount(options: dict, big_blind: int) -> int:
    """The room's bomb_pot_amount: 2 big blinds when --bomb-pot-every is on without an amount
    (a bomb pot needs one: Room's room_bomb_pot_has_an_amount)."""
    every, amount = options["bomb_pot_every"], options["bomb_pot_amount"]
    if amount is None:
        return 2 * big_blind if every else 0
    if every and amount < 1:
        raise CommandError("--bomb-pot-amount must be above 0 with --bomb-pot-every.")
    return amount
