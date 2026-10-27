"""Keep every seat within its room's ``max_seats`` at the database level.

A CHECK constraint cannot look at another table, so two triggers do it: one on the seat (new
seat or moved seat) and one on the room (shrinking below a seat already taken). The seat
trigger locks the room row so the two cannot race. ``RoomSeat.save()`` still checks first for a
readable error; this catches ``bulk_create``, ``update()`` and raw SQL. Errors use the
check_violation code, so Django raises ``IntegrityError`` as for any constraint. PostgreSQL only.
"""

from django.db import migrations

CREATE = """
CREATE FUNCTION games_roomseat_within_max_seats() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    room_max smallint;
BEGIN
    SELECT max_seats INTO room_max FROM games_room WHERE id = NEW.room_id FOR SHARE;
    IF NEW.seat > room_max THEN
        RAISE EXCEPTION 'seat % is beyond the room''s % seats', NEW.seat, room_max
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER games_roomseat_within_max_seats
BEFORE INSERT OR UPDATE OF seat, room_id ON games_roomseat
FOR EACH ROW EXECUTE FUNCTION games_roomseat_within_max_seats();

CREATE FUNCTION games_room_keeps_occupied_seats() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM games_roomseat WHERE room_id = NEW.id AND seat > NEW.max_seats
    ) THEN
        RAISE EXCEPTION 'max_seats % is below an occupied seat', NEW.max_seats
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER games_room_keeps_occupied_seats
BEFORE UPDATE OF max_seats ON games_room
FOR EACH ROW EXECUTE FUNCTION games_room_keeps_occupied_seats();
"""

DROP = """
DROP TRIGGER games_room_keeps_occupied_seats ON games_room;
DROP FUNCTION games_room_keeps_occupied_seats();
DROP TRIGGER games_roomseat_within_max_seats ON games_roomseat;
DROP FUNCTION games_roomseat_within_max_seats();
"""


def run_on_postgres(sql):
    def run(apps, schema_editor):
        if schema_editor.connection.vendor == "postgresql":
            # params=None: the SQL contains literal % for RAISE, not placeholders.
            schema_editor.execute(sql, params=None)

    return run


class Migration(migrations.Migration):
    dependencies = [
        ("games", "0005_hand_result_and_command_sequence"),
    ]

    operations = [
        migrations.RunPython(run_on_postgres(CREATE), run_on_postgres(DROP)),
    ]
