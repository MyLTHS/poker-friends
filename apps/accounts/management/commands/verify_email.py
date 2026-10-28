"""Let a friend in: mark their email verified and their account approved by the owner.

Without EMAIL_URL the verification email only reaches the server log, and a link from an earlier
session points at that session's tunnel address. The owner can vouch for a friend instead:

    uv run python manage.py verify_email ban@example.com

(``scripts/play-online.sh verify ban@example.com`` runs it inside the server container.)
"""

from django.core.management.base import BaseCommand, CommandError

from apps.accounts.services import is_email_verified, mark_email_verified
from apps.games.models import User


class Command(BaseCommand):
    help = "Approve the account that uses this email (and mark the email verified)."

    def add_arguments(self, parser):
        parser.add_argument("email")
        parser.add_argument(
            "--show", action="store_true", help="only say which account it is, change nothing"
        )

    def handle(self, *args, email, **options):
        email = email.strip()
        if not email:
            raise CommandError("Cần một email.")
        # Guests have no email (""): only real, active accounts can be vouched for.
        accounts = User.objects.filter(email__iexact=email, is_active=True, is_guest=False)
        users = list(accounts[:2])
        if not users:
            raise CommandError(f"Không có tài khoản nào dùng email {email}.")
        if len(users) > 1:
            raise CommandError(f"Có nhiều tài khoản dùng email {email}; duyệt trong admin.")
        user = users[0]
        joined = user.date_joined.strftime("%d/%m/%Y %H:%M")
        who = f"{user.username} ({user.email}, đăng ký {joined})"
        if options["show"]:
            state = "đã duyệt" if user.approved and is_email_verified(user) else "chưa duyệt"
            self.stdout.write(f"{who}: {state}")
            return
        if user.approved and is_email_verified(user):
            self.stdout.write(f"{who} đã được duyệt từ trước.")
            return
        mark_email_verified(user)
        user.approved = True
        user.save(update_fields=["approved"])
        done = f"Đã duyệt {who}: người này đăng nhập và vào chơi được."
        self.stdout.write(self.style.SUCCESS(done))
