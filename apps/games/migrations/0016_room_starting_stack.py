"""Room.starting_stack: chips a player gets on sitting down with nothing, and on a rebuy.

Rooms from before this change get 100 big blinds, what a new room gets when left out.
"""

from django.db import migrations, models


def fill_in_starting_stack(apps, schema_editor):
    Room = apps.get_model("games", "Room")
    Room.objects.update(starting_stack=models.F("big_blind") * 100)


class Migration(migrations.Migration):
    dependencies = [
        ("games", "0015_remove_user_approved"),
    ]

    operations = [
        migrations.AddField(
            model_name="room",
            name="starting_stack",
            field=models.PositiveIntegerField(default=0),
            preserve_default=False,
        ),
        migrations.RunPython(fill_in_starting_stack, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="room",
            constraint=models.CheckConstraint(
                condition=models.Q(starting_stack__gt=0), name="room_starting_stack_positive"
            ),
        ),
    ]
