from apps.games.engine.cards import FULL_DECK
from apps.games.engine.hand import Action, ActionKind, HandConfig, HandEngine, Seat, deal_order


def split_cards(cards: str) -> list[str]:
    cards = cards.replace(" ", "")
    return [cards[i : i + 2] for i in range(0, len(cards), 2)]


def make_deck(order: list[str], holes: dict[str, str], board: str = "") -> tuple[str, ...]:
    """Stack a deck so each player gets ``holes[player]`` and the board runs out as given.

    Burn cards and the rest of the deck are filled with unused cards.
    """
    hole_cards = {player: split_cards(holes[player]) for player in order}
    board_cards = split_cards(board)
    used = {card for cards in hole_cards.values() for card in cards} | set(board_cards)
    fillers = iter(card for card in FULL_DECK if card not in used)

    deck = [hole_cards[player][0] for player in order]
    deck += [hole_cards[player][1] for player in order]
    for street in (board_cards[:3], board_cards[3:4], board_cards[4:5]):
        if street:
            deck += [next(fillers), *street]
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
) -> HandEngine:
    seat_objs = tuple(Seat(seat=s, player_id=p, stack=stack) for s, p, stack in seats)
    order = deal_order(seat_objs, button_seat)
    if holes is None:
        deck = FULL_DECK
    else:
        deck = make_deck(order, holes, board)
    config = HandConfig(
        seats=seat_objs,
        button_seat=button_seat,
        small_blind=small_blind,
        big_blind=big_blind,
        deck=deck,
        seven_deuce_bonus=seven_deuce_bonus,
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
