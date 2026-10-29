from apps.games.engine.cards import FULL_DECK
from apps.games.engine.hand import Action, ActionKind, HandConfig, HandEngine, Seat, deal_order


def split_cards(cards: str) -> list[str]:
    cards = cards.replace(" ", "")
    return [cards[i : i + 2] for i in range(0, len(cards), 2)]


def make_deck(
    order: list[str], holes: dict[str, str], board: str = "", second_board: str = ""
) -> tuple[str, ...]:
    """Stack a deck so each player gets ``holes[player]`` and the board runs out as given.

    ``second_board``: for a hand run twice, the second run of the cards still to come when the
    all-in closed the betting (the whole board for an all-in before the flop, the turn and
    river for one on the flop...). Burn cards and the rest of the deck are unused cards.
    """
    hole_cards = {player: split_cards(holes[player]) for player in order}
    board_cards = split_cards(board)
    second = split_cards(second_board)
    used = {card for cards in hole_cards.values() for card in cards}
    used |= set(board_cards) | set(second)
    fillers = iter(card for card in FULL_DECK if card not in used)

    deck = [hole_cards[player][0] for player in order]
    deck += [hole_cards[player][1] for player in order]
    for street in (board_cards[:3], board_cards[3:4], board_cards[4:5]):
        if street:
            deck += [next(fillers), *street]
    first_street = {5: 0, 2: 1, 1: 2, 0: 3}[len(second)]
    for street in (3, 1, 1)[first_street:] if second else ():
        deck += [next(fillers), *second[:street]]
        second = second[street:]
    deck += list(fillers)
    return tuple(deck)


def build_hand(
    seats: list[tuple[int, str, int]],
    button_seat: int,
    holes: dict[str, str] | None = None,
    board: str = "",
    small_blind: int = 1,
    big_blind: int = 2,
    seven_deuce_bonus: int = 0,
    ante: int = 0,
    bomb_pot: int = 0,
    second_board: str = "",
    run_it_twice: bool = False,
    rabbit_hunt: bool = False,
) -> HandEngine:
    seat_objs = tuple(Seat(seat=s, player_id=p, stack=stack) for s, p, stack in seats)
    order = deal_order(seat_objs, button_seat)
    if holes is None:
        deck = FULL_DECK
    else:
        deck = make_deck(order, holes, board, second_board)
    config = HandConfig(
        seats=seat_objs,
        button_seat=button_seat,
        small_blind=small_blind,
        big_blind=big_blind,
        deck=deck,
        seven_deuce_bonus=seven_deuce_bonus,
        ante=ante,
        bomb_pot=bomb_pot,
        run_it_twice=run_it_twice,
        rabbit_hunt=rabbit_hunt,
    )
    return HandEngine(config)


def fold(player: str) -> Action:
    return Action(player, ActionKind.FOLD)


def check(player: str) -> Action:
    return Action(player, ActionKind.CHECK)


def call(player: str) -> Action:
    return Action(player, ActionKind.CALL)


def raise_to(player: str, amount: int) -> Action:
    return Action(player, ActionKind.RAISE, amount)


def check_down(engine: HandEngine) -> None:
    while not engine.is_complete:
        engine.act(check(engine.actor))
