"""A cash-game table: seats, room-scoped chips and a sequence of hands.

Chips belong to the room, not to a global wallet: the host grants chips, every change is an
append-only ledger entry, and a player's stack is the sum of their entries. While a hand is
running, ``stacks`` shows balances from before that hand; results land on ``finish_hand``.
"""

from collections.abc import Callable
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from .cards import shuffled_deck
from .hand import HandConfig, HandEngine, Seat


class LedgerKind(StrEnum):
    GRANT = "grant"  # host/admin grant or adjustment (may be negative)
    HAND = "hand"  # net result of one hand
    SEVEN_DEUCE = "seven_deuce"  # bonus for taking a pot holding 7-2 after everyone folded


@dataclass(frozen=True)
class LedgerEntry:
    kind: LedgerKind
    player_id: str
    amount: int
    hand_no: int | None = None


@dataclass(frozen=True)
class SummaryRow:
    granted: int
    net: int
    stack: int


class TableError(Exception):
    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


class TableSession:
    def __init__(
        self,
        small_blind: int,
        big_blind: int,
        max_seats: int = 9,
        shuffle: Callable[[], tuple[str, ...]] = shuffled_deck,
        seven_deuce_bonus: int = 0,
        ante: int = 0,
        bomb_pot_every: int = 0,
        bomb_pot_amount: int = 0,
        run_it_twice: bool = False,
        rabbit_hunt: bool = False,
    ):
        self.small_blind = small_blind
        self.big_blind = big_blind
        self.max_seats = max_seats
        self.seven_deuce_bonus = seven_deuce_bonus
        self.ante = ante
        # Every bomb_pot_every-th hand of the room (by hand number) is a bomb pot; 0 = never.
        self.bomb_pot_every = bomb_pot_every
        self.bomb_pot_amount = bomb_pot_amount
        self.run_it_twice = run_it_twice
        self.rabbit_hunt = rabbit_hunt
        self._shuffle = shuffle
        self.seats: dict[int, str] = {}
        self.sitting_out: set[str] = set()
        self.ledger: list[LedgerEntry] = []
        self.history: list[dict[str, Any]] = []
        self.current_hand: HandEngine | None = None
        self.hand_no = 0
        self._button_seat: int | None = None

    # ---- chips -------------------------------------------------------------------------

    @property
    def stacks(self) -> dict[str, int]:
        totals: dict[str, int] = {}
        for entry in self.ledger:
            totals[entry.player_id] = totals.get(entry.player_id, 0) + entry.amount
        return totals

    def grant_chips(self, player_id: str, amount: int) -> None:
        if amount == 0:
            raise TableError("invalid_amount")
        if self._in_hand(player_id):
            raise TableError("player_in_hand")
        if self.stacks.get(player_id, 0) + amount < 0:
            raise TableError("negative_balance")
        self.ledger.append(LedgerEntry(LedgerKind.GRANT, player_id, amount))

    def summary(self) -> dict[str, SummaryRow]:
        """Per-player profit/loss for the room: net = stack - chips granted."""
        stacks = self.stacks
        rows = {}
        for player, stack in stacks.items():
            granted = sum(
                e.amount
                for e in self.ledger
                if e.player_id == player and e.kind == LedgerKind.GRANT
            )
            rows[player] = SummaryRow(granted=granted, net=stack - granted, stack=stack)
        return rows

    # ---- seats -------------------------------------------------------------------------

    def take_seat(self, player_id: str, seat: int) -> None:
        if not 1 <= seat <= self.max_seats:
            raise TableError("invalid_seat")
        if seat in self.seats:
            raise TableError("seat_taken")
        if player_id in self.seats.values():
            raise TableError("already_seated")
        self.seats[seat] = player_id

    def stand_up(self, player_id: str) -> None:
        if self._in_hand(player_id):
            raise TableError("player_in_hand")
        seat = self._seat_of(player_id)
        del self.seats[seat]
        self.sitting_out.discard(player_id)

    def sit_out(self, player_id: str) -> None:
        self._seat_of(player_id)
        self.sitting_out.add(player_id)

    def sit_in(self, player_id: str) -> None:
        self._seat_of(player_id)
        self.sitting_out.discard(player_id)

    def _seat_of(self, player_id: str) -> int:
        for seat, player in self.seats.items():
            if player == player_id:
                return seat
        raise TableError("not_seated")

    def _in_hand(self, player_id: str) -> bool:
        return self.current_hand is not None and player_id in self.current_hand.player_order

    # ---- hands -------------------------------------------------------------------------

    def start_hand(self) -> HandEngine:
        if self.current_hand is not None:
            raise TableError("hand_in_progress")
        stacks = self.stacks
        eligible = [
            Seat(seat=seat, player_id=player, stack=stacks.get(player, 0))
            for seat, player in sorted(self.seats.items())
            if player not in self.sitting_out and stacks.get(player, 0) > 0
        ]
        if len(eligible) < 2:
            raise TableError("not_enough_players")

        self._button_seat = self._next_button([s.seat for s in eligible])
        self.hand_no += 1
        bomb = self.is_bomb_pot(self.hand_no)
        self.current_hand = HandEngine(
            HandConfig(
                seats=tuple(eligible),
                button_seat=self._button_seat,
                small_blind=self.small_blind,
                big_blind=self.big_blind,
                deck=tuple(self._shuffle()),
                seven_deuce_bonus=self.seven_deuce_bonus,
                ante=0 if bomb else self.ante,
                bomb_pot=self.bomb_pot_amount if bomb else 0,
                run_it_twice=self.run_it_twice,
                rabbit_hunt=self.rabbit_hunt,
            )
        )
        return self.current_hand

    def is_bomb_pot(self, hand_no: int) -> bool:
        every = self.bomb_pot_every
        return every > 0 and self.bomb_pot_amount > 0 and hand_no % every == 0

    def finish_hand(self) -> HandEngine:
        hand = self.current_hand
        if hand is None:
            raise TableError("no_hand")
        if not hand.is_complete:
            raise TableError("hand_not_complete")
        for player, delta in hand.result().net.items():
            if delta:
                self.ledger.append(LedgerEntry(LedgerKind.HAND, player, delta, self.hand_no))
        self._apply_seven_deuce_bonus(hand)
        self.history.append(hand.record())
        self.current_hand = None
        return hand

    def _apply_seven_deuce_bonus(self, hand: HandEngine) -> None:
        """Every other seated player (sitting out or not) owes the bluffer the room's bonus.

        Runs after the pot is settled; a payer short of the bonus pays what they have left, so
        no stack goes negative, and the winner receives exactly what was paid.
        """
        # The hand's own config, not the table's current one: it is what the record replays.
        bonus = hand.config.seven_deuce_bonus
        winner = hand.seven_deuce_bluff_winner()
        if bonus <= 0 or winner is None:
            return
        stacks = self.stacks
        total = 0
        for payer in self.seats.values():
            paid = min(bonus, stacks.get(payer, 0))
            if payer == winner or paid <= 0:
                continue
            self.ledger.append(LedgerEntry(LedgerKind.SEVEN_DEUCE, payer, -paid, self.hand_no))
            total += paid
        if total:
            self.ledger.append(LedgerEntry(LedgerKind.SEVEN_DEUCE, winner, total, self.hand_no))

    def _next_button(self, eligible_seats: list[int]) -> int:
        if self._button_seat is None:
            return eligible_seats[0]
        later = [seat for seat in eligible_seats if seat > self._button_seat]
        return later[0] if later else eligible_seats[0]
