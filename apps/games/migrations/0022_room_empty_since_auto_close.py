"""Rooms close themselves after ROOM_IDLE_CLOSE_SECONDS with nobody seated (actor.py).

``Room.empty_since``: adding the column gives every existing room the time of the migration; then
rooms with someone seated, and closed rooms, go back to null. So an open room nobody sits in
closes ROOM_IDLE_CLOSE_SECONDS (5 minutes) after the deploy, never sooner. ``OwnerAction`` gets the
``auto_close`` kind, and ``user`` may be null for it: nobody did it, the server did.
"""

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models
from django.db.models import Exists, OuterRef, Q


def only_empty_open_rooms(apps, schema_editor):
    Room = apps.get_model("games", "Room")
    RoomSeat = apps.get_model("games", "RoomSeat")
    seated = Exists(RoomSeat.objects.filter(room=OuterRef("pk")))
    Room.objects.filter(Q(status="closed") | Q(seated)).update(empty_since=None)


class Migration(migrations.Migration):
    dependencies = [
        ("games", "0021_owneraction_start_pause"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="room",
            name="empty_since",
            field=models.DateTimeField(blank=True, default=django.utils.timezone.now, null=True),
        ),
        migrations.AlterField(
            model_name="owneraction",
            name="kind",
            field=models.CharField(
                choices=[
                    ("grant", "Grant chips"),
                    ("settings", "Change settings"),
                    ("kick", "Kick"),
                    ("close", "Close room"),
                    ("invite", "Rotate invite link"),
                    ("start", "Start room"),
                    ("pause", "Pause room"),
                    ("auto_close", "Closed automatically (empty)"),
                ],
                max_length=10,
            ),
        ),
        migrations.AlterField(
            model_name="owneraction",
            name="user",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="owner_actions",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        # Last: no ALTER TABLE after a data change in the same transaction (PostgreSQL refuses
        # one on a table with pending trigger events).
        migrations.RunPython(only_empty_open_rooms, migrations.RunPython.noop),
    ]
