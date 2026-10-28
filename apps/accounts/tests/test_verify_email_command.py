"""``manage.py verify_email``: the owner vouches for a friend when no email goes out."""

from io import StringIO

import pytest
from allauth.account.models import EmailAddress
from django.core.management import CommandError, call_command

from apps.accounts.services import is_email_verified
from apps.games.models import User

pytestmark = pytest.mark.django_db


def make(username, email, active=True):
    user = User.objects.create_user(username=username, email=email, password="x" * 12)
    user.is_active = active
    user.save()
    EmailAddress.objects.create(user=user, email=email, verified=False, primary=True)
    return user


def run(email, *flags):
    out = StringIO()
    call_command("verify_email", *flags, email, stdout=out)
    return out.getvalue()


def test_approves_the_account_whatever_case_the_owner_types():
    user = make("an", "an@example.com")  # signup always stores the address in lower case
    assert "Đã duyệt" in run(" An@Example.com ")
    user.refresh_from_db()
    assert user.approved and is_email_verified(user)


def test_show_names_the_account_and_changes_nothing():
    user = make("an", "an@example.com")
    shown = run("an@example.com", "--show")
    assert "an (an@example.com, đăng ký" in shown and "chưa duyệt" in shown
    user.refresh_from_db()
    assert not user.approved and not is_email_verified(user)


def test_a_self_verified_email_still_needs_the_owner():
    user = make("an", "an@example.com")
    EmailAddress.objects.filter(user=user).update(verified=True)  # Gmail or Google did this
    assert "Đã duyệt" in run("an@example.com")
    user.refresh_from_db()
    assert user.approved


def test_running_twice_is_harmless():
    user = make("an", "an@example.com")
    run("an@example.com")
    assert "từ trước" in run("an@example.com")
    assert EmailAddress.objects.filter(user=user, verified=True).count() == 1


def test_unknown_or_locked_accounts_are_refused():
    make("locked", "locked@example.com", active=False)
    for email in ("nobody@example.com", "locked@example.com"):
        with pytest.raises(CommandError):
            run(email)


def test_a_blank_email_never_matches_a_guest():
    User.objects.create_user(username="khach-1", email="", is_guest=True)
    for email in ("", "   "):
        with pytest.raises(CommandError):
            run(email)
