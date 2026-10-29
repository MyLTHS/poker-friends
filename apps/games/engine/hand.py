"""One hand of No-Limit Texas Hold'em, wrapping PokerKit.

PokerKit is the source of truth for the rules. This module adds what PokerKit leaves out:
mapping seats to PokerKit player indices, dealing from a server-shuffled deck, validating
player intents, per-viewer projections that never leak hidden cards, and replayable records.
"""

from dataclasses import asdict, dataclass
from enum import StrEnum
from typing import Any

from pokerkit import Automation, Card, ChipsPushing, Mode, NoLimitTexasHoldem

from .cards import FULL_DECK

AUTOMATIONS = (
    Automation.ANTE_POSTING,
    Automation.BET_COLLECTION,
    Automation.BLIND_OR_STRADDLE_POSTING,
    Automation.HOLE_CARDS_SHOWING_OR_MUCKING,
    Automation.HAND_KILLING,
    Automation.CHIPS_PUSHING,
    Automation.CHIPS_PULLING,
    Automation.RUNOUT_COUNT_SELECTION,
)
# Running it twice, the engine picks the number of runouts itself (see _advance).
RUN_IT_TWICE_AUTOMATIONS = tuple(a for a in AUTOMATIONS if a != Automation.RUNOUT_COUNT_SELECTION)

HIDDEN_CARD = "??"
# Config keys added after hands were first stored, with what a record without them means.
RECORD_DEFAULTS: dict[str, Any] = {
    "seven_deuce_bonus": 0,
    "ante": 0,
    "bomb_pot": 0,
    "run_it_twice": False,
    "rabbit_hunt": False,
}
SEVEN_DEUCE_RANKS = frozenset({"7", "2"})
RANK_ORDER = "23456789TJQKA"


class HandCategory(StrEnum):
    """A made hand, named after PokerKit's ``Label`` (the web shows its own words for it)."""

    HIGH_CARD = "high_card"
    ONE_PAIR = "one_pair"
    TWO_PAIR = "two_pair"
    THREE_OF_A_KIND = "three_of_a_kind"
    STRAIGHT = "straight"
    FLUSH = "flush"
    FULL_HOUSE = "full_house"
    FOUR_OF_A_KIND = "four_of_a_kind"
    STRAIGHT_FLUSH = "straight_flush"


STRAIGHTS = frozenset({HandCategory.STRAIGHT, HandCategory.STRAIGHT_FLUSH})


class ActionKind(StrEnum):
    FOLD = "fold"
    CHECK = "check"
    CALL = "call"
    RAISE = "raise"  # also covers an opening bet; amount is the total "raise to"


@dataclass(frozen=True)
class Seat:
    seat: int
    player_id: str
    stack: int


@dataclass(frozen=True)
class HandConfig:
    seats: tuple[Seat, ...]
    button_seat: int
    small_blind: int
    big_blind: int
    deck: tuple[str, ...]
    # The room's 7-2 bonus for this hand (rule #27); only decides whether the winner's 7-2 is
    # revealed here, the bonus itself is paid by ``TableSession``.
    seven_deuce_bonus: int = 0
    # Dead money every player dealt in puts in before the blinds (all of it if short).
    ante: int = 0
    # A bomb pot when above 0: every player dealt in puts in this much (all of it if short), no
    # blinds and no betting before the flop; the first bet is made on the flop, from the left of
    # the button. ``ante`` is not taken on top of it.
    bomb_pot: int = 0
    # When the betting is over with two or more players left, one of them all in and the board
    # not complete, the rest of the board is dealt twice: every pot is split in two halves (an
    # odd chip goes to the first), the first half by the first board, the second by the second.
    run_it_twice: bool = False
    # Once the hand is over before the river, show the board cards that would have come next
    # (``rabbit_cards``); only to look at, no chips move.
    rabbit_hunt: bool = False


@dataclass(frozen=True)
class Action:
    player_id: str
    kind: ActionKind
    amount: int | None = None


@dataclass(frozen=True)
class LegalActions:
    can_fold: bool
    can_check: bool
    call_amount: int
    min_raise_to: int | None
    max_raise_to: int | None


@dataclass(frozen=True)
class HandResult:
    final_stacks: dict[str, int]
    net: dict[str, int]


class IllegalAction(Exception):
    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


def same_config(stored: dict[str, Any], recorded: dict[str, Any]) -> bool:
    """Whether a stored hand config and a fresh ``HandEngine.record()`` describe the same hand.
    A key the stored one lacks (written before that rule existed) counts as its default, so a
    hand dealt before an upgrade and finished after it is still the same hand."""
    return {**RECORD_DEFAULTS, **stored} == {**RECORD_DEFAULTS, **recorded}


def deal_order(seats: tuple[Seat, ...], button_seat: int) -> list[str]:
    """Players in PokerKit index order: left of the button first, the button last.

    PokerKit posts the small blind from index 0 (the big blind in heads-up, where it
    puts the button on the small blind itself), so this ordering yields correct blinds.
    """
    ordered = sorted(seats, key=lambda s: s.seat)
    after_button = [s for s in ordered if s.seat > button_seat]
    up_to_button = [s for s in ordered if s.seat <= button_seat]
    return [s.player_id for s in after_button + up_to_button]


def card_code(card: Card) -> str:
    return repr(card)


def ordered_hand(category: HandCategory, cards: list[str]) -> list[str]:
    """The five cards of a made hand, most significant first: bigger groups, then higher ranks,
    so a client can name the hand from ``cards[0]`` (and ``cards[2]``/``cards[3]``) alone.
    A five-high straight (the wheel) counts its ace as one and puts it last."""
    ranks = [card[0] for card in cards]
    wheel = category in STRAIGHTS and set(ranks) == set("A2345")

    def value(rank: str) -> int:
        return -1 if wheel and rank == "A" else RANK_ORDER.index(rank)

    return sorted(cards, key=lambda card: (-ranks.count(card[0]), -value(card[0])))


class HandEngine:
    def __init__(self, config: HandConfig):
        if len(config.seats) < 2:
            raise ValueError("A hand needs at least two players.")
        if sorted(config.deck) != sorted(FULL_DECK):
            raise ValueError("The deck must be a permutation of the 52-card deck.")
        if config.button_seat not in {s.seat for s in config.seats}:
            raise ValueError("The button must be on an occupied seat.")

        self.config = config
        self.player_order = tuple(deal_order(config.seats, config.button_seat))
        self._index = {player: i for i, player in enumerate(self.player_order)}
        self._seat_of = {s.player_id: s.seat for s in config.seats}
        stack_of = {s.player_id: s.stack for s in config.seats}
        self._starting_stacks = tuple(stack_of[p] for p in self.player_order)
        self._deck = iter(config.deck)
        self._drawn = 0  # cards taken from the deck so far (holes, burns and boards)
        self._actions: list[Action] = []
        self._chip_total = sum(self._starting_stacks)
        bomb = config.bomb_pot > 0
        self._state = NoLimitTexasHoldem.create_state(
            RUN_IT_TWICE_AUTOMATIONS if config.run_it_twice else AUTOMATIONS,
            True,  # antes are trimmed like bets: a short ante only plays for what it matches
            config.bomb_pot if bomb else config.ante,
            (0, 0) if bomb else (config.small_blind, config.big_blind),
            config.big_blind,
            self._starting_stacks,
            len(self.player_order),
            mode=Mode.CASH_GAME,
        )
        self._advance()

    # ---- state -------------------------------------------------------------------------

    @property
    def is_complete(self) -> bool:
        return not self._state.status

    @property
    def actor(self) -> str | None:
        index = self._state.actor_index
        if self.is_complete or index is None:
            return None
        return self.player_order[index]

    def stacks(self) -> dict[str, int]:
        return {p: self._state.stacks[i] for i, p in enumerate(self.player_order)}

    def board(self, index: int = 0) -> tuple[str, ...]:
        """The board, or with ``index=1`` the second board of a hand run twice."""
        return tuple(card_code(c) for c in self._state.get_board_cards(index))

    @property
    def ran_twice(self) -> bool:
        return self._state.board_count > 1

    def runouts(self) -> list[dict[str, Any]] | None:
        """For a hand run twice, each board and what it paid to whom; ``None`` otherwise."""
        if not self.is_complete or not self.ran_twice:
            return None
        boards = self._state.board_count
        won: list[dict[str, int]] = [{} for _ in range(boards)]

        def pay(board: int, i: int, amount: int) -> None:
            player = self.player_order[i]
            won[board][player] = won[board].get(player, 0) + amount

        for operation in self._state.operations:
            if not isinstance(operation, ChipsPushing):
                continue
            for i, amount in enumerate(operation.amounts):
                if not amount:
                    continue
                if operation.board_index is not None:
                    pay(operation.board_index, i, amount)
                else:
                    # A pot one player took on every board: PokerKit killed the other hands (they
                    # lost on both) and pushed it whole. Halved like a split pot, odd chip first.
                    for board in range(boards):
                        pay(board, i, amount // boards + (1 if board < amount % boards else 0))
        return [
            {
                "board": list(self.board(index)),
                "winners": [
                    {"player_id": p, "seat": self._seat_of[p], "amount": amount}
                    for p, amount in sorted(paid.items(), key=lambda kv: self._seat_of[kv[0]])
                ],
            }
            for index, paid in enumerate(won)
        ]

    def seat_of(self, player_id: str) -> int:
        return self._seat_of[player_id]

    def hole_cards(self, player_id: str) -> list[str]:
        """The two cards dealt to ``player_id``, also after a fold (PokerKit drops those): hole
        cards come first in the deck, one per player in dealing order, then a second round."""
        i, n = self._index[player_id], len(self.player_order)
        return [self.config.deck[i], self.config.deck[n + i]]

    def cards_to_show(self, player_id: str) -> list[str]:
        """The cards ``player_id`` may show the table once the hand is over (they were dealt in
        and the table does not see them yet), or ``IllegalAction``."""
        if not self.is_complete:
            raise IllegalAction("hand_in_progress")
        if player_id not in self._index:
            raise IllegalAction("not_in_hand")
        public = next(p for p in self.view_for(None)["players"] if p["player_id"] == player_id)
        if public["cards"] and HIDDEN_CARD not in public["cards"]:
            raise IllegalAction("already_shown")
        return self.hole_cards(player_id)

    def rabbit_cards(self) -> list[str]:
        """The board cards a hand over before the river would have dealt next, burns skipped,
        when the room shows them (``rabbit_hunt``). Only once the hand is complete."""
        board = len(self.board())
        if not self.config.rabbit_hunt or not self.is_complete or self.ran_twice or board == 5:
            return []
        rest = self.config.deck[self._drawn :]
        cards: list[str] = []
        position = 0
        for street in (3, 1, 1)[{0: 0, 3: 1, 4: 2}[board] :]:
            position += 1  # the burn card
            cards += rest[position : position + street]
            position += street
        return cards

    def total_chips(self) -> int:
        # PokerKit's total pot already includes bets not yet collected.
        return sum(self._state.stacks) + self._state.total_pot_amount

    def result(self) -> HandResult:
        if not self.is_complete:
            raise IllegalAction("hand_not_complete")
        final = self.stacks()
        net = {p: final[p] - self._starting_stacks[i] for i, p in enumerate(self.player_order)}
        return HandResult(final_stacks=final, net=net)

    def seven_deuce_bluff_winner(self) -> str | None:
        """The player who took the pot holding a 7 and a 2 (any suits) because everyone else
        folded, or ``None``. A showdown win never counts, so there is at most one such player.

        Decided from the action log (not PokerKit's statuses), so a replay always agrees.
        A walk (everyone folds to the big blind) counts too (rule #27, decided 2026-10-27).
        """
        if not self.is_complete:
            return None
        folded = {a.player_id for a in self._actions if a.kind == ActionKind.FOLD}
        remaining = [p for p in self.player_order if p not in folded]
        if len(remaining) != 1:
            return None
        winner = remaining[0]
        ranks = {card_code(c)[0] for c in self._state.hole_cards[self._index[winner]]}
        return winner if ranks == SEVEN_DEUCE_RANKS else None

    def showdown_hands(self) -> list[dict[str, Any]]:
        """The made hand of each player whose cards are face up at a showdown, by board, then
        by seat (``board`` 1, and 2 as well for a hand run twice).

        Empty unless the hand went to a showdown (two or more players never folded), so a win
        by folds, including a revealed 7-2 bluff, names nobody's hand. A player who mucked has
        no face-up cards and no entry. Everything here is already public.
        """
        if not self.is_complete:
            return []
        folded = {a.player_id for a in self._actions if a.kind == ActionKind.FOLD}
        if len([p for p in self.player_order if p not in folded]) < 2:
            return []
        state = self._state
        hands = []
        for board in range(state.board_count):
            for i, player in enumerate(self.player_order):
                face_up = state.hole_card_statuses[i]
                if not state.statuses[i] or not face_up or not all(face_up):
                    continue
                made = state.get_hand(i, board, 0)
                if made is None:
                    continue
                category = HandCategory(made.entry.label.name.lower())
                hands.append(
                    {
                        "player_id": player,
                        "seat": self._seat_of[player],
                        "board": board + 1,
                        "category": str(category),
                        "cards": ordered_hand(category, [card_code(c) for c in made.cards]),
                    }
                )
        return sorted(hands, key=lambda h: (h["board"], h["seat"]))

    # ---- actions -----------------------------------------------------------------------

    def legal_actions(self, player_id: str) -> LegalActions:
        self._require_actor(player_id)
        state = self._state
        call_amount = state.checking_or_calling_amount or 0
        can_raise = state.can_complete_bet_or_raise_to()
        # Decided here, not by state.can_fold(): in cash-game mode PokerKit only *warns* about a
        # fold with a free check, so its answer depends on the process warning filters. Such
        # folds can leave a side pot with no eligible player and crash or burn chips.
        return LegalActions(
            can_fold=call_amount > 0,
            can_check=call_amount == 0,
            call_amount=call_amount,
            min_raise_to=state.min_completion_betting_or_raising_to_amount if can_raise else None,
            max_raise_to=state.max_completion_betting_or_raising_to_amount if can_raise else None,
        )

    def check(self, action: Action) -> None:
        """Raise ``IllegalAction`` unless ``action`` is legal right now; never changes state.

        Shared by the table actor's pre-check (ADR-001 step 1, before anything is written) and
        ``act()`` (step 3), so "passed the check but failed to apply" cannot happen for a reason
        this method could have caught.
        """
        legal = self.legal_actions(action.player_id)
        match action.kind:
            case ActionKind.FOLD:
                if not legal.can_fold:
                    raise IllegalAction("cannot_fold")
            case ActionKind.CHECK:
                if not legal.can_check:
                    raise IllegalAction("cannot_check")
            case ActionKind.CALL:
                if legal.can_check:
                    raise IllegalAction("nothing_to_call")
            case ActionKind.RAISE:
                if legal.min_raise_to is None or legal.max_raise_to is None:
                    raise IllegalAction("cannot_raise")
                amount = action.amount
                if not isinstance(amount, int) or not (
                    legal.min_raise_to <= amount <= legal.max_raise_to
                ):
                    raise IllegalAction("invalid_amount")
            case _:
                raise IllegalAction("unknown_action")

    def act(self, action: Action) -> None:
        self.check(action)
        state = self._state
        match action.kind:
            case ActionKind.FOLD:
                state.fold()
            case ActionKind.CHECK | ActionKind.CALL:
                state.check_or_call()
            case ActionKind.RAISE:
                state.complete_bet_or_raise_to(action.amount)
        self._actions.append(action)
        self._advance()
        if self.total_chips() != self._chip_total:
            raise RuntimeError(f"Chip conservation violated after {action}.")

    def timeout(self, player_id: str) -> Action:
        """Auto-act for a player whose clock ran out: check if free, otherwise fold."""
        legal = self.legal_actions(player_id)
        kind = ActionKind.CHECK if legal.can_check else ActionKind.FOLD
        action = Action(player_id, kind)
        self.act(action)
        return action

    def _require_actor(self, player_id: str) -> None:
        if self.is_complete:
            raise IllegalAction("hand_complete")
        if player_id != self.actor:
            raise IllegalAction("not_your_turn")

    def _draw(self, count: int) -> str:
        self._drawn += count
        return "".join(next(self._deck) for _ in range(count))

    def _advance(self) -> None:
        """Deal and burn from the server deck until a player must act or the hand ends.

        In a bomb pot nobody acts before the flop: with no blinds everyone checks, so the engine
        checks for them (these checks are not player actions and are not recorded).
        """
        state = self._state
        while state.status:
            if state.actor_index is not None:
                if not (self.config.bomb_pot > 0 and state.street_index == 0):
                    return
                state.check_or_call()
            elif state.can_select_runout_count():
                # Everyone left picks the same count, so it is 2 exactly when the room runs
                # it twice (PokerKit asks only when the board still has cards to come).
                state.select_runout_count(2 if self.config.run_it_twice else None)
            elif state.can_deal_hole():
                state.deal_hole(self._draw(1))
            elif state.can_burn_card():
                state.burn_card(self._draw(1))
            elif state.can_deal_board():
                state.deal_board(self._draw(state.board_dealing_count))
            else:
                raise RuntimeError("Hand is stuck: no actor and nothing to deal.")

    # ---- projection --------------------------------------------------------------------

    def view_for(self, viewer: str | None) -> dict[str, Any]:
        """State as seen by ``viewer`` (``None`` for a spectator). Safe to send to clients."""
        state = self._state
        # Rule #27: a bluff won with 7-2 is shown to the whole table when the bonus is on.
        revealed = self.seven_deuce_bluff_winner() if self.config.seven_deuce_bonus > 0 else None
        players = []
        for i, player in enumerate(self.player_order):
            players.append(
                {
                    "player_id": player,
                    "seat": self._seat_of[player],
                    "stack": state.stacks[i],
                    "bet": state.bets[i],
                    "in_hand": state.statuses[i],
                    "cards": self._visible_cards(i, own=player == viewer or player == revealed),
                }
            )
        players.sort(key=lambda p: p["seat"])
        actor = self.actor
        return {
            "button_seat": self.config.button_seat,
            "small_blind": self.config.small_blind,
            "big_blind": self.config.big_blind,
            "ante": self.config.ante,
            "bomb_pot": self.config.bomb_pot,
            "board": list(self.board()),
            "second_board": list(self.board(1)) if self.ran_twice else None,
            "pots": [
                {
                    "amount": pot.amount,
                    "eligible": [self.player_order[i] for i in pot.player_indices],
                }
                for pot in state.pots
            ],
            "players": players,
            "actor": actor,
            "legal_actions": (
                asdict(self.legal_actions(viewer))
                if viewer is not None and viewer == actor
                else None
            ),
            "complete": self.is_complete,
        }

    def _visible_cards(self, index: int, own: bool) -> list[str]:
        cards = self._state.hole_cards[index]
        face_up = self._state.hole_card_statuses[index]
        return [
            card_code(card) if own or up else HIDDEN_CARD
            for card, up in zip(cards, face_up, strict=True)
        ]

    # ---- persistence -------------------------------------------------------------------

    def record(self) -> dict[str, Any]:
        """Server-side record (contains the deck: never send it to clients)."""
        return {
            "config": {
                "seats": [asdict(s) for s in self.config.seats],
                "button_seat": self.config.button_seat,
                "small_blind": self.config.small_blind,
                "big_blind": self.config.big_blind,
                "deck": list(self.config.deck),
                "seven_deuce_bonus": self.config.seven_deuce_bonus,
                "ante": self.config.ante,
                "bomb_pot": self.config.bomb_pot,
                "run_it_twice": self.config.run_it_twice,
                "rabbit_hunt": self.config.rabbit_hunt,
            },
            "actions": [
                {"player_id": a.player_id, "kind": str(a.kind), "amount": a.amount}
                for a in self._actions
            ],
        }

    @classmethod
    def replay(cls, record: dict[str, Any]) -> "HandEngine":
        raw = record["config"]
        engine = cls(
            HandConfig(
                seats=tuple(Seat(**s) for s in raw["seats"]),
                button_seat=raw["button_seat"],
                small_blind=raw["small_blind"],
                big_blind=raw["big_blind"],
                deck=tuple(raw["deck"]),
                **{key: raw.get(key, default) for key, default in RECORD_DEFAULTS.items()},
            )
        )
        for a in record["actions"]:
            engine.act(Action(a["player_id"], ActionKind(a["kind"]), a["amount"]))
        return engine
