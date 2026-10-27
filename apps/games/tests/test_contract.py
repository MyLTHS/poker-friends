"""The WebSocket contract in docs/api/: schemas, fixtures and the protocol document agree."""

import json
import random
import re

import pytest
from jsonschema import Draft202012Validator

from apps.games import contract
from apps.games.engine.cards import shuffled_deck
from apps.games.engine.hand import Action, ActionKind, HandConfig, HandEngine, Seat

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


# ---- semantics: what a message may show depends on who receives it --------------------------

VIEWERS = json.loads((FIXTURES / "server" / "viewers.json").read_text())


def server_fixtures(kind: str):
    return [
        pytest.param(path, VIEWERS[kind][path.stem], id=path.stem)
        for path in sorted((FIXTURES / "server" / kind).glob("*.json"))
    ]


@pytest.mark.parametrize("kind", ["valid", "leaks"])
def test_every_server_fixture_names_its_receiver(kind):
    names = {p.stem for p in (FIXTURES / "server" / kind).glob("*.json")}
    assert names == set(VIEWERS[kind])


@pytest.mark.parametrize(("path", "viewer"), server_fixtures("valid"))
def test_valid_server_fixture_passes_the_semantic_check(path, viewer):
    assert contract.semantic_errors(load(path), viewer) == []


@pytest.mark.parametrize(("path", "viewer"), server_fixtures("leaks"))
def test_leak_fixture_fits_the_schema_but_fails_the_semantic_check(path, viewer):
    message = load(path)
    assert contract.errors(message, "server") == []
    assert contract.semantic_errors(message, viewer) != []
    with pytest.raises(contract.ContractError):
        contract.validate_outgoing(message, viewer)


def _random_hands(count: int, seed: int):
    """Engines after every action of random hands, all-ins included."""
    rng = random.Random(seed)
    for _ in range(count):
        size = rng.randint(2, 6)
        seats = tuple(
            Seat(seat=i + 1, player_id=str(i + 1), stack=rng.choice([40, 100, 250, 1000]))
            for i in range(size)
        )
        engine = HandEngine(
            HandConfig(
                seats=seats,
                button_seat=rng.randint(1, size),
                small_blind=5,
                big_blind=10,
                deck=shuffled_deck(rng),
                seven_deuce_bonus=rng.choice([0, 50]),
            )
        )
        yield engine
        while not engine.is_complete:
            actor = engine.actor
            legal = engine.legal_actions(actor)
            roll = rng.random()
            if legal.max_raise_to is not None and roll < 0.2:
                engine.act(Action(actor, ActionKind.RAISE, legal.max_raise_to))
            elif legal.min_raise_to is not None and roll < 0.35:
                engine.act(Action(actor, ActionKind.RAISE, legal.min_raise_to))
            elif legal.can_fold and roll < 0.55:
                engine.act(Action(actor, ActionKind.FOLD))
            else:
                engine.act(Action(actor, ActionKind.CHECK if legal.can_check else ActionKind.CALL))
            yield engine


def test_every_projection_of_random_hands_passes_the_semantic_check():
    checked = 0
    for engine in _random_hands(300, seed=27):
        for viewer in (*engine.player_order, "99"):
            view = {
                "hand_id": 1,
                "hand_no": 1,
                **engine.view_for(viewer if viewer != "99" else None),
            }
            assert contract.hand_view_errors(view, viewer) == [], (viewer, view)
            checked += 1
    assert checked > 5000
