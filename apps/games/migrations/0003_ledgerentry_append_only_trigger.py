"""Make the ledger append-only at the database level.

The ORM guards in ``LedgerEntry`` stop normal code; this trigger also stops raw SQL, the base
manager and any other client. PostgreSQL only: local SQLite runs keep just the ORM guards.
"""

from django.db import migrations

CREATE = """
CREATE FUNCTION games_ledgerentry_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'games_ledgerentry is append-only: % is not allowed', TG_OP;
END;
$$;

CREATE TRIGGER games_ledgerentry_append_only
BEFORE UPDATE OR DELETE ON games_ledgerentry
FOR EACH ROW EXECUTE FUNCTION games_ledgerentry_append_only();
"""

DROP = """
DROP TRIGGER games_ledgerentry_append_only ON games_ledgerentry;
DROP FUNCTION games_ledgerentry_append_only();
"""


def run_on_postgres(sql):
    def run(apps, schema_editor):
        if schema_editor.connection.vendor == "postgresql":
            # params=None: the SQL contains a literal % for RAISE, not a placeholder.
            schema_editor.execute(sql, params=None)

    return run


class Migration(migrations.Migration):
    dependencies = [
        ("games", "0002_room_seven_deuce_bonus_alter_ledgerentry_kind"),
    ]

    operations = [
        migrations.RunPython(run_on_postgres(CREATE), run_on_postgres(DROP)),
    ]
