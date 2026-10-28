"""Hand.seven_deuce: the 7-2 award stored with the hand (rule #27).

Finished hands from before this change get it rebuilt from their seven_deuce ledger entries.
A hand whose bluffer was owed a bonus that nobody could pay has no entries, so it stays null.
"""

from collections import defaultdict

from django.db import migrations, models


def fill_in_seven_deuce(apps, schema_editor):
    Hand = apps.get_model("games", "Hand")
    LedgerEntry = apps.get_model("games", "LedgerEntry")
    rows_by_hand = defaultdict(list)
    entries = LedgerEntry.objects.filter(kind="seven_deuce", hand__isnull=False)
    for row in entries.values("hand_id", "user_id", "amount"):
        rows_by_hand[row["hand_id"]].append(row)
    for hand in Hand.objects.filter(pk__in=list(rows_by_hand), seven_deuce__isnull=True):
        rows = rows_by_hand[hand.pk]
        winners = [row for row in rows if row["amount"] > 0]
        if len(winners) != 1:
            continue  # not a settlement this rule produces; leave it for a person to look at
        payments = sorted(
            (
                {"player_id": str(row["user_id"]), "amount": -row["amount"]}
                for row in rows
                if row["amount"] < 0
            ),
            key=lambda payment: int(payment["player_id"]),
        )
        hand.seven_deuce = {
            "player_id": str(winners[0]["user_id"]),
            "bonus": hand.config.get("seven_deuce_bonus", 0),
            "payments": payments,
            "total": winners[0]["amount"],
        }
        hand.save(update_fields=["seven_deuce"])


class Migration(migrations.Migration):
    dependencies = [
        ("games", "0011_room_pending_settings_and_closing"),
    ]

    operations = [
        migrations.AddField(
            model_name="hand",
            name="seven_deuce",
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.RunPython(fill_in_seven_deuce, migrations.RunPython.noop),
    ]
