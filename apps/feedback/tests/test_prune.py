"""manage.py prune_client_errors: old browser errors go, players' feedback stays."""

from datetime import timedelta
from io import StringIO

import pytest
from django.core.management import CommandError, call_command
from django.utils import timezone

from apps.feedback.models import ClientError, Feedback

pytestmark = pytest.mark.django_db


def error_seen(days_ago: float, message: str) -> ClientError:
    seen = timezone.now() - timedelta(days=days_ago)
    return ClientError.objects.create(
        fingerprint=message, window_start=seen, last_seen=seen, message=message
    )


def prune(*args: str) -> str:
    out = StringIO()
    call_command("prune_client_errors", *args, stdout=out)
    return out.getvalue()


def test_errors_not_seen_for_30_days_go_and_feedback_stays():
    error_seen(31, "old")
    error_seen(29, "recent")
    note = Feedback.objects.create(kind="bug", message="Bàn đứng hình.")
    Feedback.objects.filter(pk=note.pk).update(created_at=timezone.now() - timedelta(days=400))

    assert "Đã xoá 1 " in prune()
    assert list(ClientError.objects.values_list("message", flat=True)) == ["recent"]
    assert Feedback.objects.count() == 1


def test_days_can_be_shorter():
    error_seen(8, "last week")
    error_seen(1, "yesterday")
    prune("--days", "7")
    assert list(ClientError.objects.values_list("message", flat=True)) == ["yesterday"]


def test_days_must_be_at_least_one():
    error_seen(1, "yesterday")
    with pytest.raises(CommandError):
        prune("--days", "0")
    assert ClientError.objects.count() == 1
