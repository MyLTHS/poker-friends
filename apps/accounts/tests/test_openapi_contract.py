"""The /api/auth/ responses match docs/api/openapi.yaml, the contract the web app is typed from."""

from pathlib import Path

import jsonschema
import pytest
import yaml
from django.conf import settings

from apps.accounts.views import ERROR_STATUS

from .conftest import PASSWORD

pytestmark = pytest.mark.django_db

OPENAPI = yaml.safe_load((Path(settings.BASE_DIR) / "docs/api/openapi.yaml").read_text())
SCHEMAS = OPENAPI["components"]["schemas"]


def validate(instance, name: str) -> None:
    schema = {**SCHEMAS[name], "components": OPENAPI["components"]}
    jsonschema.validate(instance, schema, format_checker=jsonschema.FormatChecker())


def test_every_error_code_is_in_the_contract():
    assert set(ERROR_STATUS) <= set(SCHEMAS["ApiError"]["properties"]["code"]["enum"])


def test_every_google_result_code_is_in_the_contract():
    from apps.accounts.adapters import GOOGLE_ERRORS

    assert set(GOOGLE_ERRORS) == set(SCHEMAS["GoogleError"]["enum"])


def test_every_auth_path_is_in_the_contract():
    from apps.accounts.urls import api

    documented = {path for path in OPENAPI["paths"] if path.startswith("/api/auth/")}
    assert {f"/api/auth/{pattern.pattern}" for pattern in api} == documented


def test_guest_and_upgraded_user_match_me(client):
    guest = client.post("/api/auth/guest/").json()
    validate(guest, "Me")
    upgraded = client.post(
        "/api/auth/upgrade/", {"email": "k@example.com", "password": PASSWORD}, format="json"
    ).json()
    validate(upgraded, "Me")


def test_config_matches_auth_config(client):
    validate(client.get("/api/auth/config/").json(), "AuthConfig")


def test_errors_match_api_error(client):
    response = client.post("/api/auth/signup/", {"email": "x"}, format="json")
    validate(response.json(), "ApiError")
    validate(client.get("/api/auth/me/").json(), "ApiError")
