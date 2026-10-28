"""Hand.seven_deuce for the 7-2 wins migration 0012 could not see (review D).

0012 rebuilt each award from the hand's seven_deuce ledger entries, so a bluff that nobody paid
for has no entries and stayed null, while services.seven_deuce_award stores such a hand as
``{"player_id", "bonus", "payments": [], "total": 0}``. Here every finished hand that is still
null, had a bonus in its own config and has no seven_deuce entries is replayed from its command
log, and gets that record when the replay finds a 7-2 bluff winner: the award then agrees with
the ledger, as it does for new hands.

In play this should find nothing: whoever folds still has chips, so a bluff always has a payer.
It makes the two kinds of row agree in case one exists. Hands from before rule #27 have no bonus
in their config and are left alone; so are voided hands and hands with seven_deuce entries 0012
did not understand (a person looks at those). A hand that no longer replays is skipped.
"""

from django.db import migrations


def fill_in_unpaid_seven_deuce(apps, schema_editor):
    # The engine is plain Python (pokerkit, no Django models): safe to import in a migration.
    from apps.games.engine.hand import HandEngine

    Hand = apps.get_model("games", "Hand")
    HandCommand = apps.get_model("games", "HandCommand")
    LedgerEntry = apps.get_model("games", "LedgerEntry")
    with_entries = LedgerEntry.objects.filter(kind="seven_deuce", hand__isnull=False)
    hands = Hand.objects.filter(seven_deuce__isnull=True, completed_at__isnull=False).exclude(
        pk__in=with_entries.values("hand_id")
    )
    for hand in hands.iterator():
        if (hand.result or {}).get("voided") or not hand.config.get("seven_deuce_bonus"):
            continue
        commands = HandCommand.objects.filter(hand_id=hand.pk).order_by("sequence")
        record = {
            "config": hand.config,
            "actions": [
                {"player_id": str(c.player_id), "kind": c.kind, "amount": c.amount}
                for c in commands
            ],
        }
        try:
            engine = HandEngine.replay(record)
        except Exception:  # an engine change since: leave the hand as it is
            continue
        winner = engine.seven_deuce_bluff_winner()
        if winner is None:
            continue
        hand.seven_deuce = {
            "player_id": winner,
            "bonus": engine.config.seven_deuce_bonus,
            "payments": [],
            "total": 0,
        }
        hand.save(update_fields=["seven_deuce"])


class Migration(migrations.Migration):
    dependencies = [
        ("games", "0012_hand_seven_deuce"),
    ]

    operations = [
        migrations.RunPython(fill_in_unpaid_seven_deuce, migrations.RunPython.noop),
    ]
