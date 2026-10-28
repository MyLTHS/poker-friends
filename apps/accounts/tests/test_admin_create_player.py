"""Staff create a player's account in the Django admin and the player gets it.

The main flow: staff enter an email and a table name; the player gets an invitation email (staff
also see the link, to send it by chat when no email arrives); the player opens it, sets their own
password on the web's reset page, and logs in. Staff never choose or see the password. The
address is vouched for by staff, and following the emailed link proves it anyway.
"""

import time
from urllib.parse import parse_qs, urlparse

import pytest
from allauth.account.models import EmailAddress
from django.core import mail
from django.test import Client

from apps.accounts import services
from apps.games.models import User

from .conftest import PASSWORD

pytestmark = pytest.mark.django_db

ADD_URL = "/admin/games/user/add/"
LIST_URL = "/admin/games/user/"


def login(client, email, password=PASSWORD):
    return client.post("/api/auth/login/", {"email": email, "password": password}, format="json")


def set_password(client, link, password=PASSWORD):
    params = parse_qs(urlparse(link).query)
    body = {"uid": params["uid"][0], "token": params["token"][0], "password": password}
    return client.post("/api/auth/password/reset/", body, format="json")


def link_in(message) -> str:
    return next(word for word in message.body.split() if "/account/reset?" in word)


def uid_of(link: str) -> str:
    return parse_qs(urlparse(link).query)["uid"][0]


@pytest.fixture
def staff():
    user = User.objects.create_user("quanly", "quanly@example.com", "mat-khau-quan-ly")
    user.is_staff = user.is_superuser = True
    user.save()
    admin = Client()
    admin.force_login(user)
    return admin


def add_player(staff, **fields):
    data = {"email": "an@example.com", "username": "An", **fields}
    return staff.post(ADD_URL, data, follow=True)


class TestInvitation:
    def test_the_player_gets_an_email_sets_a_password_and_logs_in(self, client):
        user = services.create_player(" An@Example.com ", "An")
        assert (user.email, user.username, user.is_guest) == ("an@example.com", "An", False)
        assert not user.has_usable_password()
        assert services.is_email_verified(user) and user.approved  # let in by staff

        (message,) = mail.outbox
        assert message.to == ["an@example.com"]
        assert "An" in message.body and "7 ngày" in message.body
        link = link_in(message)
        assert "moi=1" in link
        assert login(client, "an@example.com").status_code == 400  # no password yet

        assert set_password(client, link).status_code == 204
        assert login(client, "an@example.com").status_code == 200

    def test_the_link_works_once(self, client):
        services.create_player("an@example.com", "An")
        link = link_in(mail.outbox[0])
        assert set_password(client, link).status_code == 204
        again = set_password(client, link, "mot-mat-khau-khac-88")
        assert again.status_code == 400 and again.json()["code"] == "invalid_token"

    def test_the_link_lasts_seven_days(self, client, monkeypatch):
        services.create_player("an@example.com", "An")
        link = link_in(mail.outbox[0])
        now = time.time()
        monkeypatch.setattr("django.core.signing.time.time", lambda: now + 7 * 24 * 3600 + 60)
        late = set_password(client, link)
        assert late.status_code == 400 and late.json()["code"] == "invalid_token"

    def test_a_link_for_one_player_does_not_open_another(self, client):
        services.create_player("an@example.com", "An")
        other = services.create_player("binh@example.com", "Binh")
        mine, theirs = link_in(mail.outbox[0]), link_in(mail.outbox[1])
        assert set_password(client, mine.replace(uid_of(mine), uid_of(theirs))).status_code == 400
        other.refresh_from_db()
        assert not other.has_usable_password()

    def test_a_new_invitation_works_and_the_reset_email_still_does(self, client):
        user = services.create_player("an@example.com", "An")
        assert services.invite_player(user).startswith("http")
        assert set_password(client, link_in(mail.outbox[1])).status_code == 204
        # "Quên mật khẩu" keeps working for invited players too.
        services.request_password_reset("an@example.com", "10.0.0.1")
        third = set_password(client, link_in(mail.outbox[2]), "mat-khau-thu-ba-77")
        assert third.status_code == 204

    def test_members_only_a_player_made_by_staff_is_already_approved(self, client, settings):
        settings.GUESTS_ALLOWED = False  # playing from home: only approved accounts get in
        user = services.create_player("chi@example.com", "Chi")
        assert user.approved
        assert set_password(client, link_in(mail.outbox[0])).status_code == 204
        response = login(client, "chi@example.com")
        assert response.status_code == 200
        assert response.json()["member"] is True
        assert client.get("/api/rooms/").status_code == 200

    @pytest.mark.parametrize(
        ("email", "username", "code"),
        [("AN@example.com", "Binh", "email_taken"), ("binh@example.com", "an", "username_taken")],
    )
    def test_an_email_or_name_already_in_use_is_refused(self, email, username, code):
        services.create_player("an@example.com", "An")
        with pytest.raises(services.AccountError) as refused:
            services.create_player(email, username)
        assert refused.value.code == code
        assert User.objects.count() == 1


class TestAdmin:
    def test_the_add_page_asks_only_for_email_and_name(self, staff):
        page = staff.get(ADD_URL).content.decode()
        assert 'name="email"' in page and 'name="username"' in page
        assert 'name="password1"' not in page

    def test_adding_a_player_invites_them_and_shows_the_link(self, staff, client):
        response = add_player(staff)
        assert response.status_code == 200
        user = User.objects.get(username="An")
        assert user.email == "an@example.com" and not user.is_guest and not user.is_staff
        assert EmailAddress.objects.filter(user=user, verified=True, primary=True).exists()
        (message,) = mail.outbox
        page = response.content.decode()
        assert "Đã gửi thư mời tới an@example.com" in page
        link = link_in(message)
        assert link.replace("&", "&amp;") in page  # to send it by chat if the email is lost
        assert set_password(client, link).status_code == 204
        assert login(client, "an@example.com").status_code == 200

    def test_email_is_required(self, staff):
        add_player(staff, email="")
        assert not User.objects.filter(username="An").exists()
        assert mail.outbox == []

    def test_an_email_in_use_is_shown_on_the_form(self, staff):
        services.create_player("an@example.com", "Binh")
        response = add_player(staff, email="AN@example.com")
        assert "Email này đã có tài khoản" in response.content.decode()
        assert not User.objects.filter(username="An").exists()

    def test_a_name_in_use_in_other_letter_case_is_shown_on_the_form(self, staff):
        services.create_player("binh@example.com", "an")
        response = add_player(staff, username="AN")
        assert "Tên này đã có người dùng" in response.content.decode()
        assert User.objects.count() == 2  # the staff account and the first player

    def test_invite_again_from_the_list(self, staff):
        user = services.create_player("an@example.com", "An")
        guest = services.new_guest()
        response = staff.post(
            LIST_URL,
            {"action": "invite_again", "_selected_action": [user.pk, guest.pk]},
            follow=True,
        )
        page = response.content.decode()
        assert len(mail.outbox) == 2  # the first invitation and this one; never the guest
        assert link_in(mail.outbox[1]).replace("&", "&amp;") in page
        assert "không có email" in page  # the guest is skipped, and staff are told why

    def test_no_new_link_for_a_player_who_already_set_a_password(self, staff, client):
        user = services.create_player("an@example.com", "An")
        assert set_password(client, link_in(mail.outbox[0])).status_code == 204
        response = staff.post(
            LIST_URL, {"action": "invite_again", "_selected_action": [user.pk]}, follow=True
        )
        assert len(mail.outbox) == 1
        assert "đã tự đặt mật khẩu" in response.content.decode()
