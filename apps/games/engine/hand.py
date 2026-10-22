"""One hand of No-Limit Texas Hold'em, wrapping PokerKit.

PokerKit is the source of truth for the rules. This module adds what PokerKit leaves out:
mapping seats to PokerKit player indices, dealing from a server-shuffled deck, validating
player intents, per-viewer projections that never leak hidden cards, and replayable records.
"""

from dataclasses import asdict, dataclass
from enum import StrEnum
from typing import Any

from pokerkit import Automation, Card, Mode, NoLimitTexasHoldem

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

HIDDEN_CARD = "??"


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
        self._actions: list[Action] = []
        self._chip_total = sum(self._starting_stacks)
        self._state = NoLimitTexasHoldem.create_state(
            AUTOMATIONS,
            True,
            0,
            (config.small_blind, config.big_blind),
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

    def board(self) -> tuple[str, ...]:
        return tuple(card_code(c) for c in self._state.get_board_cards(0))

    def total_chips(self) -> int:
        # PokerKit's total pot already includes bets not yet collected.
        return sum(self._state.stacks) + self._state.total_pot_amount

    def result(self) -> HandResult:
        if not self.is_complete:
            raise IllegalAction("hand_not_complete")
        final = self.stacks()
        net = {p: final[p] - self._starting_stacks[i] for i, p in enumerate(self.player_order)}
        return HandResult(final_stacks=final, net=net)

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

    def act(self, action: Action) -> None:
        legal = self.legal_actions(action.player_id)
        state = self._state
        match action.kind:
            case ActionKind.FOLD:
                if not legal.can_fold:
                    raise IllegalAction("cannot_fold")
                state.fold()
            case ActionKind.CHECK:
                if not legal.can_check:
                    raise IllegalAction("cannot_check")
                state.check_or_call()
            case ActionKind.CALL:
                if legal.can_check:
                    raise IllegalAction("nothing_to_call")
                state.check_or_call()
            case ActionKind.RAISE:
                if legal.min_raise_to is None or legal.max_raise_to is None:
                    raise IllegalAction("cannot_raise")
                amount = action.amount
                if not isinstance(amount, int) or not (
                    legal.min_raise_to <= amount <= legal.max_raise_to
                ):
                    raise IllegalAction("invalid_amount")
                state.complete_bet_or_raise_to(amount)
            case _:
                raise IllegalAction("unknown_action")
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
        return "".join(next(self._deck) for _ in range(count))

    def _advance(self) -> None:
        """Deal and burn from the server deck until a player must act or the hand ends."""
        state = self._state
        while state.status and state.actor_index is None:
            if state.can_deal_hole():
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
        players = []
        for i, player in enumerate(self.player_order):
            players.append(
                {
                    "player_id": player,
                    "seat": self._seat_of[player],
                    "stack": state.stacks[i],
                    "bet": state.bets[i],
                    "in_hand": state.statuses[i],
                    "cards": self._visible_cards(i, own=player == viewer),
                }
            )
        players.sort(key=lambda p: p["seat"])
        actor = self.actor
        return {
            "button_seat": self.config.button_seat,
            "small_blind": self.config.small_blind,
            "big_blind": self.config.big_blind,
            "board": list(self.board()),
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
            )
        )
        for a in record["actions"]:
            engine.act(Action(a["player_id"], ActionKind(a["kind"]), a["amount"]))
        return engine
