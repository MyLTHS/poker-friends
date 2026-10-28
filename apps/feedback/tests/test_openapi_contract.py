"""/api/feedback/ and /api/client-errors/ match docs/api/openapi.yaml (web types come from it)."""

import json
from pathlib import Path

import jsonschema
import pytest
import yaml
from django.conf import settings
from django.test import Client

from apps.games.models import User

from .test_feedback import ERROR, FEEDBACK, _fresh_rate_limits  # noqa: F401

pytestmark = pytest.mark.django_db

OPENAPI = yaml.safe_load((Path(settings.BASE_DIR) / "docs/api/openapi.yaml").read_text())
SCHEMAS = OPENAPI["components"]["schemas"]


def validate(instance, name: str) -> None:
    schema = {**SCHEMAS[name], "components": OPENAPI["components"]}
    jsonschema.validate(instance, schema)


def post(client: Client, path: str, body):
    return client.post(path, json.dumps(body), content_type="application/json")


def test_both_paths_are_documented_as_post_only():
    for path in ("/api/feedback/", "/api/client-errors/"):
        assert set(OPENAPI["paths"][path]) == {"post"}


def test_the_bodies_the_tests_send_follow_the_contract():
    validate(FEEDBACK, "FeedbackRequest")
    validate({**FEEDBACK, "room_id": 3}, "FeedbackRequest")
    validate(ERROR, "ClientErrorReport")


def test_responses_follow_the_contract():
    client = Client()
    client.force_login(User.objects.create_user(username="khach-1", is_guest=True))
    validate(post(client, "/api/feedback/", FEEDBACK).json(), "FeedbackCreated")
    validate(post(client, "/api/feedback/", {"kind": "x", "message": ""}).json(), "ApiError")
    validate(post(Client(), "/api/feedback/", FEEDBACK).json(), "ApiError")
    validate(post(Client(), "/api/client-errors/", {"message": ""}).json(), "ApiError")
    assert post(Client(), "/api/client-errors/", ERROR).status_code == 204
