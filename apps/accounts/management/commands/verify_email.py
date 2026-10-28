"""Mark a player's email as verified by hand, for sessions without outgoing email.

Without EMAIL_URL the verification email only reaches the server log, and a link from an earlier
session points at that session's tunnel address. The owner can vouch for a friend instead:

    uv run python manage.py verify_email ban@example.com

(``scripts/play-online.sh verify ban@example.com`` runs it inside the server container.)
"""

from django.core.management.base import BaseCommand, CommandError

from apps.accounts.services import is_email_verified, mark_email_verified
from apps.games.models import User


class Command(BaseCommand):
    help = "Mark the email of the account that uses it as verified."

    def add_arguments(self, parser):
        parser.add_argument("email")

    def handle(self, *args, email, **options):
        users = list(User.objects.filter(email__iexact=email.strip(), is_active=True)[:2])
        if not users:
            raise CommandError(f"Không có tài khoản nào dùng email {email}.")
        if len(users) > 1:
            raise CommandError(f"Có nhiều tài khoản dùng email {email}; xác minh trong admin.")
        user = users[0]
        if is_email_verified(user):
            self.stdout.write(f"{user.username} ({user.email}) đã xác minh từ trước.")
            return
        mark_email_verified(user)
        done = f"Đã xác minh email cho {user.username} ({user.email})."
        self.stdout.write(self.style.SUCCESS(done))
