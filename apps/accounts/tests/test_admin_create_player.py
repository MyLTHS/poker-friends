"""Staff create a player's account in the Django admin, ready to log in at once.

Players log in with email + password and the email must be verified. An account made by staff
has its email vouched for by them, so it is verified straight away and no email is sent.
"""

import pytest
from allauth.account.models import EmailAddress
from django.core import mail
from django.test import Client

from apps.accounts import services
from apps.games.models import User

from .conftest import PASSWORD

pytestmark = pytest.mark.django_db

ADD_URL = "/admin/games/user/add/"


def login(client, email, password=PASSWORD):
    return client.post("/api/auth/login/", {"email": email, "password": password}, format="json")


@pytest.fixture
def staff():
    user = User.objects.create_user("quanly", "quanly@example.com", "mat-khau-quan-ly")
    user.is_staff = user.is_superuser = True
    user.save()
    admin = Client()
    admin.force_login(user)
    return admin


def add_player(staff, **fields):
    data = {
        "email": "an@example.com",
        "username": "An",
        "password1": PASSWORD,
        "password2": PASSWORD,
    }
    return staff.post(ADD_URL, {**data, **fields})


class TestCreatePlayerService:
    def test_the_player_can_log_in_at_once_and_no_email_is_sent(self, client):
        user = services.create_player(" An@Example.com ", "An", PASSWORD)
        assert (user.email, user.username, user.is_guest) == ("an@example.com", "An", False)
        assert services.is_email_verified(user)
        assert mail.outbox == []
        assert login(client, "an@example.com").status_code == 200

    def test_members_only_a_player_made_by_staff_is_already_approved(self, client, settings):
        settings.GUESTS_ALLOWED = False  # playing from home: only approved accounts get in
        user = services.create_player("chi@example.com", "Chi", PASSWORD)
        assert user.approved
        response = login(client, "chi@example.com")
        assert response.status_code == 200
        assert response.json()["member"] is True
        assert client.get("/api/rooms/").status_code == 200

    @pytest.mark.parametrize(
        ("email", "username", "code"),
        [("AN@example.com", "Binh", "email_taken"), ("binh@example.com", "an", "username_taken")],
    )
    def test_an_email_or_name_already_in_use_is_refused(self, email, username, code):
        services.create_player("an@example.com", "An", PASSWORD)
        with pytest.raises(services.AccountError) as refused:
            services.create_player(email, username, PASSWORD)
        assert refused.value.code == code
        assert User.objects.count() == 1


class TestAdminAddForm:
    def test_the_add_page_asks_for_email_name_and_password(self, staff):
        page = staff.get(ADD_URL).content.decode()
        for field in ('name="email"', 'name="username"', 'name="password1"', 'name="password2"'):
            assert field in page

    def test_a_player_made_in_the_admin_logs_in_straight_away(self, staff, client):
        response = add_player(staff)
        assert response.status_code == 302, response.content.decode()[:2000]
        user = User.objects.get(username="An")
        assert user.email == "an@example.com" and not user.is_guest and not user.is_staff
        assert EmailAddress.objects.filter(user=user, verified=True, primary=True).exists()
        assert mail.outbox == []
        assert login(client, "an@example.com").status_code == 200

    def test_email_is_required(self, staff):
        response = add_player(staff, email="")
        assert response.status_code == 200
        assert not User.objects.filter(username="An").exists()

    def test_an_email_in_use_is_shown_on_the_form(self, staff):
        services.create_player("an@example.com", "Binh", PASSWORD)
        response = add_player(staff, email="AN@example.com")
        assert response.status_code == 200
        assert "Email này đã có tài khoản" in response.content.decode()
        assert not User.objects.filter(username="An").exists()

    def test_the_two_passwords_must_match(self, staff):
        response = add_player(staff, password2="khac-han-roi-99")
        assert response.status_code == 200
        assert not User.objects.filter(username="An").exists()

    def test_a_name_in_use_in_other_letter_case_is_shown_on_the_form(self, staff):
        services.create_player("binh@example.com", "an", PASSWORD)
        response = add_player(staff, username="AN")
        assert response.status_code == 200
        assert "Tên này đã có người dùng" in response.content.decode()
        assert User.objects.count() == 2  # the staff account and the first player
