"""One row per error per fixed 10-minute window, enforced by the database (PR #29 review).

Rows already stored get the window their ``last_seen`` falls in, and a fingerprint that now also
covers ``release``. They cannot collide: the old rule only opened a new row more than 10 minutes
after the previous one's ``last_seen``, so the two land in different windows.
"""

import hashlib
from datetime import UTC, datetime

from django.db import migrations, models

WINDOW_SECONDS = 10 * 60  # apps/feedback/views.py DUPLICATE_WINDOW at the time of writing


def fill_windows(apps, schema_editor):
    ClientError = apps.get_model("feedback", "ClientError")
    for row in ClientError.objects.all():
        start = int(row.last_seen.timestamp()) // WINDOW_SECONDS * WINDOW_SECONDS
        row.window_start = datetime.fromtimestamp(start, tz=UTC)
        text = "\n".join((row.message, row.page, row.release))
        row.fingerprint = hashlib.sha256(text.encode()).hexdigest()
        row.save(update_fields=["window_start", "fingerprint"])


class Migration(migrations.Migration):
    dependencies = [
        ("feedback", "0001_initial"),
    ]

    operations = [
        migrations.RemoveIndex(
            model_name="clienterror",
            name="clienterror_recent",
        ),
        migrations.AddField(
            model_name="clienterror",
            name="window_start",
            field=models.DateTimeField(null=True),
        ),
        migrations.RunPython(fill_windows, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="clienterror",
            name="window_start",
            field=models.DateTimeField(),
        ),
        migrations.AlterField(
            model_name="clienterror",
            name="last_seen",
            field=models.DateTimeField(db_index=True),
        ),
        migrations.AddConstraint(
            model_name="clienterror",
            constraint=models.UniqueConstraint(
                fields=("fingerprint", "window_start"), name="clienterror_one_per_window"
            ),
        ),
    ]
