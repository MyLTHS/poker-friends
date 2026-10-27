"""The WebSocket contract in docs/api/: schemas, fixtures and the protocol document agree."""

import json
import re

import pytest
from jsonschema import Draft202012Validator

from apps.games import contract

FIXTURES = contract.API_DIR / "fixtures"
PROTOCOL_DOC = (contract.API_DIR / "ws-protocol.md").read_text()


def fixtures(direction: str, kind: str):
    paths = sorted((FIXTURES / direction / kind).glob("*.json"))
    assert paths, f"no {direction}/{kind} fixtures"
    return [pytest.param(path, id=path.stem) for path in paths]


def load(path):
    return json.loads(path.read_text())


@pytest.mark.parametrize("path", sorted(contract.SCHEMA_DIR.rglob("*.schema.json")), ids=str)
def test_every_schema_is_valid_json_schema(path):
    Draft202012Validator.check_schema(load(path))


@pytest.mark.parametrize("direction", contract.DIRECTIONS)
@pytest.mark.parametrize("kind", ["valid", "invalid"])
def test_fixture_folders_exist(direction, kind):
    assert fixtures(direction, kind)


@pytest.mark.parametrize("path", fixtures("server", "valid") + fixtures("client", "valid"))
def test_valid_fixture_passes_its_own_schema_and_the_union(path):
    direction = path.parent.parent.name
    message = load(path)
    assert message["type"] == path.stem.split(".")[0] + "." + path.stem.split(".")[1]
    assert contract.errors(message, direction) == []
    assert list(contract.union_validator(direction).iter_errors(message)) == []


@pytest.mark.parametrize("path", fixtures("server", "invalid") + fixtures("client", "invalid"))
def test_invalid_fixture_fails(path):
    direction = path.parent.parent.name
    message = load(path)
    assert contract.errors(message, direction) != []
    assert list(contract.union_validator(direction).iter_errors(message)) != []
    with pytest.raises(contract.ContractError):
        contract.validate(message, direction)


@pytest.mark.parametrize("direction", contract.DIRECTIONS)
def test_every_message_type_has_a_valid_fixture(direction):
    covered = {load(p)["type"] for p in (FIXTURES / direction / "valid").glob("*.json")}
    assert covered == set(contract.MESSAGE_TYPES[direction])


def test_message_types_match_the_schema_files():
    files = {
        p.name.removesuffix(".schema.json") for p in (contract.SCHEMA_DIR / "messages").iterdir()
    }
    assert files == set(contract.MESSAGE_TYPES["server"]) | set(contract.MESSAGE_TYPES["client"])


@pytest.mark.parametrize(
    "message_type", contract.MESSAGE_TYPES["server"] + contract.MESSAGE_TYPES["client"]
)
def test_every_message_type_is_documented(message_type):
    assert f"`{message_type}`" in PROTOCOL_DOC


@pytest.mark.parametrize(
    "code",
    contract.enum("RejectCode") + contract.enum("ProtocolErrorCode"),
)
def test_every_error_code_is_in_the_protocol_doc_table(code):
    assert re.search(rf"^\| `{code}` \|", PROTOCOL_DOC, re.MULTILINE)


def test_errors_reports_an_unknown_type_without_crashing():
    message = {"protocol_version": 1, "type": "command.nope", "room_id": 1, "payload": {}}
    assert contract.errors(message, "client") != []
    assert contract.errors("not even an object", "client") != []
