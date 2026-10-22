import random

from apps.games.engine.cards import FULL_DECK, shuffled_deck


def test_full_deck_has_52_unique_cards():
    assert len(FULL_DECK) == 52
    assert len(set(FULL_DECK)) == 52


def test_shuffled_deck_is_a_permutation_of_the_full_deck():
    deck = shuffled_deck()
    assert sorted(deck) == sorted(FULL_DECK)


def test_shuffled_deck_accepts_an_injected_rng_for_reproducibility():
    assert shuffled_deck(random.Random(7)) == shuffled_deck(random.Random(7))


def test_default_shuffle_is_not_the_identity():
    # 1/52! chance of a false failure.
    assert shuffled_deck() != FULL_DECK
