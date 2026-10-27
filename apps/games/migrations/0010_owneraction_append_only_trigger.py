"""Make the owner/admin action log append-only at the database level, like the ledger (0003)
and the hand command log (0007): an audit log nobody can tidy up afterwards. PostgreSQL only.
"""

from django.db import migrations

CREATE = """
CREATE FUNCTION games_owneraction_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'games_owneraction is append-only: % is not allowed', TG_OP;
END;
$$;

CREATE TRIGGER games_owneraction_append_only
BEFORE UPDATE OR DELETE ON games_owneraction
FOR EACH ROW EXECUTE FUNCTION games_owneraction_append_only();
"""

DROP = """
DROP TRIGGER games_owneraction_append_only ON games_owneraction;
DROP FUNCTION games_owneraction_append_only();
"""


def run_on_postgres(sql):
    def run(apps, schema_editor):
        if schema_editor.connection.vendor == "postgresql":
            # params=None: the SQL contains a literal % for RAISE, not a placeholder.
            schema_editor.execute(sql, params=None)

    return run


class Migration(migrations.Migration):
    dependencies = [
        ("games", "0009_chat_and_owner_actions"),
    ]

    operations = [
        migrations.RunPython(run_on_postgres(CREATE), run_on_postgres(DROP)),
    ]
