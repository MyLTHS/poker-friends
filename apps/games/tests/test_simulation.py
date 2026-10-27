from hypothesis import given, settings
from hypothesis import strategies as st

from apps.games.engine.simulate import run_simulation


def test_simulation_runs_many_hands_without_violations():
    report = run_simulation(hands=300, players=6, seed=42)
    assert report.hands_played == 300
    assert report.violations == []


@settings(max_examples=40, deadline=None)
@given(
    players=st.integers(min_value=2, max_value=9),
    seed=st.integers(min_value=0, max_value=2**32),
    chips=st.integers(min_value=3, max_value=500),
)
def test_any_table_size_and_stack_keeps_invariants(players, seed, chips):
    report = run_simulation(hands=15, players=players, seed=seed, chips=chips)
    assert report.violations == []


def test_the_seven_deuce_bonus_keeps_invariants_and_is_really_exercised():
    # Heads-up, so bots often fold to each other and 7-2 bluffs actually happen.
    report = run_simulation(hands=400, players=2, seed=7, seven_deuce_bonus=150)
    assert report.violations == []
    assert report.seven_deuce_hands > 0


@settings(max_examples=40, deadline=None)
@given(
    players=st.integers(min_value=2, max_value=9),
    seed=st.integers(min_value=0, max_value=2**32),
    chips=st.integers(min_value=3, max_value=500),
    bonus=st.integers(min_value=1, max_value=600),
)
def test_any_seven_deuce_bonus_keeps_invariants(players, seed, chips, bonus):
    report = run_simulation(
        hands=15, players=players, seed=seed, chips=chips, seven_deuce_bonus=bonus
    )
    assert report.violations == []
