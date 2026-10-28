"""Delete browser errors not seen for a while (docs/runbook.md, "Sau buổi chơi: phản hồi và lỗi").

Only ``ClientError`` rows go, by ``last_seen``: what players wrote (``Feedback``) is kept.
"""

from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.feedback.models import ClientError


class Command(BaseCommand):
    help = "Delete browser errors (ClientError) not seen for --days days (default 30)."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=30)

    def handle(self, *args, **options):
        days = options["days"]
        if days < 1:
            raise CommandError("--days must be at least 1.")
        cutoff = timezone.now() - timedelta(days=days)
        deleted, _ = ClientError.objects.filter(last_seen__lt=cutoff).delete()
        self.stdout.write(f"Đã xoá {deleted} lỗi trình duyệt không gặp lại trong {days} ngày.")
