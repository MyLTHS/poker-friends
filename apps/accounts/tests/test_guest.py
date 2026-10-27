"""Guests play straight away; upgrading keeps the same User row, so chips and history stay."""

from smtplib import SMTPException
from unittest.mock import patch

import pytest
from allauth.account.models import EmailAddress
from django.core import mail
from django.db.models import Sum

from apps.games.models import Hand, LedgerEntry, LedgerKind, Room, User

from .conftest import PASSWORD, last_link_params, make_verified_user

pytestmark = pytest.mark.django_db


def create_guest(client, **body):
    return client.post("/api/auth/guest/", body, format="json")


def upgrade(client, email="khach@example.com", password=PASSWORD, **extra):
    return client.post(
        "/api/auth/upgrade/", {"email": email, "password": password, **extra}, format="json"
    )


def room_totals(user: User) -> dict[int, int]:
    rows = LedgerEntry.objects.filter(user=user).values("room").annotate(total=Sum("amount"))
    return {row["room"]: row["total"] for row in rows}


class TestCreateGuest:
    def test_creates_a_logged_in_guest(self, client):
        response = create_guest(client)

        assert response.status_code == 201
        body = response.json()
        assert body["is_guest"] is True
        assert body["email"] is None
        assert body["has_password"] is False
        assert body["username"].startswith("khach-")
        assert client.get("/api/auth/me/").json()["id"] == body["id"]

    def test_guest_can_pick_a_name(self, client):
        assert create_guest(client, username="Tèo").json()["username"] == "Tèo"

    def test_taken_name_is_refused(self, client):
        make_verified_user(username="an")
        response = create_guest(client, username="an")
        assert response.status_code == 409
        assert response.json()["code"] == "username_taken"

    def test_already_logged_in_returns_the_same_user(self, client):
        first = create_guest(client).json()
        again = create_guest(client)
        assert again.status_code == 200
        assert again.json()["id"] == first["id"]
        assert User.objects.filter(is_guest=True).count() == 1


class TestUpgradeWithEmail:
    def test_keeps_the_same_user_and_chips_in_every_room(self, client):
        guest_id = create_guest(client).json()["id"]
        guest = User.objects.get(pk=guest_id)
        rival = User.objects.create_user(username="rival")
        room_a = Room.objects.create(name="A", small_blind=1, big_blind=2)
        room_b = Room.objects.create(name="B", small_blind=5, big_blind=10)
        for room, grant in ((room_a, 1000), (room_b, 500)):
            LedgerEntry.objects.create(room=room, user=guest, kind=LedgerKind.GRANT, amount=grant)
            LedgerEntry.objects.create(room=room, user=rival, kind=LedgerKind.GRANT, amount=grant)
        hand = Hand.objects.create(room=room_a, hand_no=1, button_seat=1, config={})
        LedgerEntry.objects.create(
            room=room_a, user=guest, kind=LedgerKind.HAND, amount=120, hand=hand
        )
        LedgerEntry.objects.create(
            room=room_a, user=rival, kind=LedgerKind.HAND, amount=-120, hand=hand
        )
        before = room_totals(guest)
        assert before == {room_a.pk: 1120, room_b.pk: 500}

        response = upgrade(client, username="teo")

        assert response.status_code == 200
        body = response.json()
        assert body["id"] == guest_id
        assert body["is_guest"] is False
        assert body["username"] == "teo"
        assert body["email"] == "khach@example.com"
        assert body["has_password"] is True
        assert User.objects.count() == 2
        upgraded = User.objects.get(pk=guest_id)
        assert room_totals(upgraded) == before
        assert Hand.objects.get(pk=hand.pk).ledger_entries.filter(user=upgraded).exists()

    def test_stays_logged_in_and_sends_a_verification_link(self, client):
        create_guest(client)

        body = upgrade(client).json()

        assert body["email_verified"] is False
        assert client.get("/api/auth/me/").json()["is_guest"] is False
        assert mail.outbox[-1].to == ["khach@example.com"]
        token = last_link_params()["token"]
        verified = client.post("/api/auth/verify-email/", {"token": token}, format="json")
        assert verified.json()["email_verified"] is True

    def test_keeps_the_guest_name_when_none_given(self, client):
        name = create_guest(client).json()["username"]
        assert upgrade(client).json()["username"] == name

    def test_email_of_another_account_is_refused_without_merging(self, client):
        other = make_verified_user(email="an@example.com")
        guest_id = create_guest(client).json()["id"]

        response = upgrade(client, email="AN@example.com")

        assert response.status_code == 409
        assert response.json()["code"] == "email_taken"
        guest = User.objects.get(pk=guest_id)
        assert guest.is_guest is True
        assert not guest.has_usable_password()
        assert EmailAddress.objects.filter(user=other).count() == 1

    def test_name_taken_in_a_race_is_refused_and_nothing_changes(self, client):
        guest_id = create_guest(client).json()["id"]
        User.objects.create_user(username="teo")
        with patch("apps.accounts.services.username_in_use", return_value=False):
            response = upgrade(client, username="teo")

        assert response.status_code == 409
        assert response.json()["code"] == "username_taken"
        guest = User.objects.get(pk=guest_id)
        assert guest.is_guest is True
        assert guest.email == ""
        assert not EmailAddress.objects.filter(user=guest).exists()

    def test_mail_server_failure_still_upgrades(self, client):
        guest_id = create_guest(client).json()["id"]
        with patch("apps.accounts.services.send_mail", side_effect=SMTPException("down")):
            response = upgrade(client)
        assert response.status_code == 200
        assert User.objects.get(pk=guest_id).is_guest is False

    def test_only_guests_can_upgrade(self, client):
        make_verified_user()
        client.post("/api/auth/login/", {"email": "an@example.com", "password": PASSWORD})
        response = upgrade(client, email="khac@example.com")
        assert response.status_code == 409
        assert response.json()["code"] == "not_guest"

    def test_needs_a_session(self, client):
        response = upgrade(client)
        assert response.status_code == 401
        assert response.json()["code"] == "not_authenticated"

    def test_upgraded_account_logs_in_with_email_after_verification(self, client):
        create_guest(client)
        upgrade(client)
        client.post(
            "/api/auth/verify-email/", {"token": last_link_params()["token"]}, format="json"
        )
        client.post("/api/auth/logout/")

        response = client.post(
            "/api/auth/login/", {"email": "khach@example.com", "password": PASSWORD}, format="json"
        )
        assert response.status_code == 200
