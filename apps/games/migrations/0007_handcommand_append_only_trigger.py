"""Make the hand command log append-only at the database level, like the ledger (0003).

The log is what ``HandEngine.replay()`` recovers a hand from, so rewriting or deleting a command
would change history. PostgreSQL only: local SQLite runs keep just the ORM guards.
"""

from django.db import migrations

CREATE = """
CREATE FUNCTION games_handcommand_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'games_handcommand is append-only: % is not allowed', TG_OP;
END;
$$;

CREATE TRIGGER games_handcommand_append_only
BEFORE UPDATE OR DELETE ON games_handcommand
FOR EACH ROW EXECUTE FUNCTION games_handcommand_append_only();
"""

DROP = """
DROP TRIGGER games_handcommand_append_only ON games_handcommand;
DROP FUNCTION games_handcommand_append_only();
"""


def run_on_postgres(sql):
    def run(apps, schema_editor):
        if schema_editor.connection.vendor == "postgresql":
            # params=None: the SQL contains a literal % for RAISE, not a placeholder.
            schema_editor.execute(sql, params=None)

    return run


class Migration(migrations.Migration):
    dependencies = [
        ("games", "0006_roomseat_within_max_seats_trigger"),
    ]

    operations = [
        migrations.RunPython(run_on_postgres(CREATE), run_on_postgres(DROP)),
    ]
