import random
import secrets

RANKS = "23456789TJQKA"
SUITS = "cdhs"
FULL_DECK: tuple[str, ...] = tuple(rank + suit for suit in SUITS for rank in RANKS)


def shuffled_deck(rng: random.Random | None = None) -> tuple[str, ...]:
    """Return a shuffled 52-card deck.

    Uses the OS CSPRNG by default; pass ``rng`` only for tests and simulations.
    """
    cards = list(FULL_DECK)
    (rng or secrets.SystemRandom()).shuffle(cards)
    return tuple(cards)
