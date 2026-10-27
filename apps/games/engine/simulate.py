"""Random-bot simulation that checks engine invariants over many hands.

python -m apps.games.engine.simulate --hands 5000 --players 9
python -m apps.games.engine.simulate --hands 2000 --players 2 --seven-deuce-bonus 150
"""

import argparse
import json
import random
import time
from dataclasses import dataclass, field

from .cards import shuffled_deck
from .hand import Action, ActionKind, HandEngine
from .table import LedgerKind, TableSession


@dataclass
class SimulationReport:
    hands_played: int = 0
    actions: int = 0
    seven_deuce_hands: int = 0  # hands that paid the 7-2 bonus
    violations: list[str] = field(default_factory=list)


def random_action(hand: HandEngine, rng: random.Random) -> Action:
    player = hand.actor
    legal = hand.legal_actions(player)
    options = [Action(player, ActionKind.CHECK if legal.can_check else ActionKind.CALL)]
    if legal.can_fold:
        options.append(Action(player, ActionKind.FOLD))
    if legal.min_raise_to is not None:
        options.append(
            Action(player, ActionKind.RAISE, rng.randint(legal.min_raise_to, legal.max_raise_to))
        )
        options.append(Action(player, ActionKind.RAISE, legal.max_raise_to))  # all-in
    return rng.choice(options)


def _leaks(hand: HandEngine) -> list[str]:
    """Hole cards of each player that appear in any other player's (or a spectator's) view."""
    own = {}
    for player in hand.player_order:
        seats = hand.view_for(player)["players"]
        own[player] = next(x["cards"] for x in seats if x["player_id"] == player)
    problems = []
    for viewer in (*hand.player_order, None):
        text = json.dumps(hand.view_for(viewer))
        for player, cards in own.items():
            if player != viewer and any(f'"{card}"' in text for card in cards):
                problems.append(f"{viewer} can see {player}'s cards")
    return problems


def run_simulation(
    hands: int,
    players: int,
    seed: int,
    chips: int = 200,
    small_blind: int = 1,
    big_blind: int = 2,
    seven_deuce_bonus: int = 0,
) -> SimulationReport:
    rng = random.Random(seed)
    table = TableSession(
        small_blind,
        big_blind,
        shuffle=lambda: shuffled_deck(rng),
        seven_deuce_bonus=seven_deuce_bonus,
    )
    ids = [f"P{i}" for i in range(1, players + 1)]
    for player, seat in zip(ids, rng.sample(range(1, 10), players), strict=True):
        table.take_seat(player, seat)

    report = SimulationReport()
    granted = 0
    for hand_no in range(1, hands + 1):
        for player in ids:  # the host tops up anyone who went bust
            if table.stacks.get(player, 0) == 0:
                table.grant_chips(player, chips)
                granted += chips

        hand = table.start_hand()
        expected = hand.total_chips()
        while not hand.is_complete:
            report.violations += [f"hand {hand_no}: {p}" for p in _leaks(hand)]
            hand.act(random_action(hand, rng))
            report.actions += 1
            if (total := hand.total_chips()) != expected:
                report.violations.append(f"hand {hand_no}: chips {total} != {expected}")

        replayed = HandEngine.replay(json.loads(json.dumps(hand.record())))
        if replayed.result() != hand.result():
            report.violations.append(f"hand {hand_no}: replay result differs")
        if replayed.view_for(None) != hand.view_for(None):
            report.violations.append(f"hand {hand_no}: replay view differs")

        ledger_before = len(table.ledger)
        table.finish_hand()
        if any(e.kind == LedgerKind.SEVEN_DEUCE for e in table.ledger[ledger_before:]):
            report.seven_deuce_hands += 1
        if sum(table.stacks.values()) != granted:
            report.violations.append(f"hand {hand_no}: room chips {sum(table.stacks.values())}")
        if (low := min(table.stacks.values())) < 0:
            report.violations.append(f"hand {hand_no}: negative stack {low}")
        report.hands_played += 1
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hands", type=int, default=5000)
    parser.add_argument("--players", type=int, default=9)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--seven-deuce-bonus", type=int, default=0)
    args = parser.parse_args()

    started = time.perf_counter()
    report = run_simulation(
        args.hands, args.players, args.seed, seven_deuce_bonus=args.seven_deuce_bonus
    )
    elapsed = time.perf_counter() - started
    print(
        f"{report.hands_played} hands, {report.actions} actions, "
        f"{report.seven_deuce_hands} seven-deuce bonuses, "
        f"{len(report.violations)} violations in {elapsed:.1f}s"
    )
    for violation in report.violations[:20]:
        print(" -", violation)


if __name__ == "__main__":
    main()
