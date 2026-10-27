"""MockTable: the mock server's game logic, without sockets."""

import json

import pytest

from apps.games import contract
from mockserver.table import SCENARIO_PATH, MockTable

FIXTURES = contract.API_DIR / "fixtures" / "server" / "valid"


class Clock:
    def __init__(self):
        self.now = 1_793_000_000.0

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def table(clock):
    return MockTable(json.loads(SCENARIO_PATH.read_text()), clock=clock, bot_delay=1.0)


def to(outbound, conn, type_=None):
    return [m for c, m in outbound if c == conn and (type_ is None or m["type"] == type_)]


def fixture_payload(name):
    return json.loads((FIXTURES / f"{name}.json").read_text())["payload"]


def act(table, conn, hand_id, kind, amount=None, command_id="cmd-00000001"):
    message = {
        "protocol_version": 1,
        "type": "command.act",
        "room_id": 1,
        "hand_id": hand_id,
        "command_id": command_id,
        "payload": {"kind": kind, "amount": amount},
    }
    return table.receive(conn, json.dumps(message))


def run_bots(table, clock, until_actor="1"):
    """Let bots act until ``until_actor`` must act or the hand is over."""
    out = []
    for _ in range(20):
        hand = table.session.current_hand
        if hand is None or hand.actor == until_actor:
            break
        clock.advance(1.0)
        out += table.tick()
    return out


def start(table, *conns):
    out = []
    for conn, player in conns:
        out += table.connect(conn, player)
    return out + table.tick()


def test_connect_sends_a_snapshot_for_that_player(table):
    out = table.connect("lym", "1")
    [snapshot] = to(out, "lym", "table.snapshot")
    assert snapshot["payload"]["table"]["you"] == {"player_id": "1", "seat": 1}
    assert snapshot["payload"]["table"]["hand"] is None


def test_unknown_player_watches_as_spectator(table):
    [snapshot] = to(table.connect("x", None), "x", "table.snapshot")
    assert snapshot["payload"]["table"]["you"]["seat"] is None


def test_scripted_first_hand_reproduces_the_documented_fixtures(table, clock):
    out = start(table, ("lym", "1"), ("spec", None))
    [started] = to(out, "lym", "hand.started")
    assert started["payload"] == fixture_payload("hand.started")
    hand_id = started["hand_id"]

    out = act(table, "lym", hand_id, "raise", 30, "cmd-raise-30")
    out += run_bots(table, clock)
    out += act(table, "lym", hand_id, "raise", 50, "cmd-bet-50")
    out += run_bots(table, clock)

    [completed] = to(out, "spec", "hand.completed")
    assert completed["payload"] == fixture_payload("hand.completed.seven-deuce")


def test_every_player_only_sees_their_own_hole_cards(table):
    out = start(table, ("lym", "1"), ("spec", None))
    [lym] = to(out, "lym", "hand.started")
    [spec] = to(out, "spec", "hand.started")
    cards = {p["player_id"]: p["cards"] for p in lym["payload"]["hand"]["players"]}
    assert cards == {"1": ["7h", "2c"], "2": ["??", "??"], "3": ["??", "??"]}
    assert all(p["cards"] == ["??", "??"] for p in spec["payload"]["hand"]["players"])


def test_same_command_id_twice_applies_once(table):
    out = start(table, ("lym", "1"))
    hand_id = to(out, "lym", "hand.started")[0]["hand_id"]

    first = act(table, "lym", hand_id, "call", command_id="cmd-call-0001")
    second = act(table, "lym", hand_id, "call", command_id="cmd-call-0001")

    [ack1] = to(first, "lym", "command.ack")
    [ack2] = to(second, "lym", "command.ack")
    assert ack1["payload"]["duplicate"] is False
    assert ack2["payload"] == {**ack1["payload"], "duplicate": True}
    assert len(to(first, "lym", "action.applied")) == 1
    assert to(second, "lym", "action.applied") == []


def test_same_command_id_with_other_content_is_rejected(table):
    out = start(table, ("lym", "1"))
    hand_id = to(out, "lym", "hand.started")[0]["hand_id"]
    act(table, "lym", hand_id, "raise", 30, command_id="cmd-raise-0001")
    out = act(table, "lym", hand_id, "raise", 60, command_id="cmd-raise-0001")
    [rejected] = to(out, "lym", "command.rejected")
    assert rejected["payload"]["code"] == "command_id_reused"


@pytest.mark.parametrize(
    ("kind", "amount", "code"),
    [("check", None, "cannot_check"), ("raise", 5, "invalid_amount")],
)
def test_illegal_action_is_rejected_with_the_engine_code(table, kind, amount, code):
    out = start(table, ("lym", "1"))
    hand_id = to(out, "lym", "hand.started")[0]["hand_id"]
    out = act(table, "lym", hand_id, kind, amount)
    assert to(out, "lym", "command.rejected")[0]["payload"]["code"] == code
    assert to(out, "lym", "action.applied") == []


def test_acting_out_of_turn_is_rejected(table):
    out = start(table, ("lym", "1"), ("an", "2"))
    hand_id = to(out, "an", "hand.started")[0]["hand_id"]
    out = act(table, "an", hand_id, "fold")
    assert to(out, "an", "command.rejected")[0]["payload"]["code"] == "not_your_turn"


def test_wrong_hand_id_is_stale(table):
    out = start(table, ("lym", "1"))
    hand_id = to(out, "lym", "hand.started")[0]["hand_id"]
    out = act(table, "lym", hand_id - 1, "call")
    assert to(out, "lym", "command.rejected")[0]["payload"]["code"] == "stale_hand"


def test_act_between_hands_is_rejected(table):
    table.connect("lym", "1")
    out = act(table, "lym", 41, "call")
    assert to(out, "lym", "command.rejected")[0]["payload"]["code"] == "no_active_hand"


@pytest.mark.parametrize(
    ("text", "code"),
    [
        ("not json", "invalid_json"),
        ("[1, 2]", "invalid_json"),
        (
            '{"protocol_version": 1, "type": "command.chat", "room_id": 1, "payload": {}}',
            "unknown_type",
        ),
        (
            '{"protocol_version": 2, "type": "resync.request", "room_id": 1}',
            "unsupported_protocol_version",
        ),
        ('{"protocol_version": 1, "type": "resync.request", "room_id": 1}', "invalid_message"),
    ],
)
def test_unreadable_message_gets_protocol_error(table, text, code):
    table.connect("lym", "1")
    out = table.receive("lym", text)
    assert [m["payload"]["code"] for m in to(out, "lym", "protocol.error")] == [code]


def test_command_breaking_the_schema_is_rejected_as_invalid_command(table):
    table.connect("lym", "1")
    message = {
        "protocol_version": 1,
        "type": "command.act",
        "room_id": 1,
        "hand_id": 41,
        "command_id": "cmd-bad-0001",
        "payload": {"kind": "raise", "amount": None},
    }
    out = table.receive("lym", json.dumps(message))
    assert to(out, "lym", "command.rejected")[0]["payload"]["code"] == "invalid_command"


def test_clock_running_out_folds_or_checks_for_a_connected_player(table, clock):
    out = start(table, ("lym", "1"))
    [deadline] = to(out, "lym", "turn.deadline")
    assert deadline["payload"]["turn"]["player_id"] == "1"
    clock.advance(20.5)
    out = table.tick()
    [applied] = to(out, "lym", "action.applied")
    assert applied["payload"]["action"] == {
        "player_id": "1",
        "seat": 1,
        "kind": "fold",
        "amount": None,
        "timeout": True,
    }


def test_sit_out_then_again_is_rejected(table):
    table.connect("an", "2")
    sit_out = {"protocol_version": 1, "type": "command.sit_out", "room_id": 1, "payload": {}}
    out = table.receive("an", json.dumps({**sit_out, "command_id": "cmd-sitout-01"}))
    [updated] = to(out, "an", "seat.updated")
    assert updated["payload"]["occupant"]["sitting_out"] is True
    assert to(out, "an", "command.ack")[0]["payload"]["result_version"] == updated["version"]
    out = table.receive("an", json.dumps({**sit_out, "command_id": "cmd-sitout-02"}))
    assert to(out, "an", "command.rejected")[0]["payload"]["code"] == "already_sitting_out"


def test_state_events_count_up_by_one_and_replies_do_not(table, clock):
    out = start(table, ("lym", "1"))
    hand_id = to(out, "lym", "hand.started")[0]["hand_id"]
    out += act(table, "lym", hand_id, "call", command_id="cmd-call-0002")
    out += act(table, "lym", hand_id, "call", command_id="cmd-call-0002")
    out += run_bots(table, clock, until_actor=None)
    received = to(out, "lym")
    snapshot_version = received[0]["version"]
    state = [m["version"] for m in received if m["type"] in contract.STATE_EVENTS]
    assert state == list(range(snapshot_version + 1, snapshot_version + 1 + len(state)))
    for i, message in enumerate(received):
        if message["type"] not in contract.STATE_EVENTS:
            earlier = [m["version"] for m in received[:i] if m["type"] in contract.STATE_EVENTS]
            assert message["version"] == max(earlier, default=snapshot_version)


def test_resync_returns_a_snapshot_at_the_current_version(table):
    out = start(table, ("lym", "1"))
    last = to(out, "lym")[-1]["version"]
    resync = {
        "protocol_version": 1,
        "type": "resync.request",
        "room_id": 1,
        "payload": {"last_version": 0},
    }
    [snapshot] = to(table.receive("lym", json.dumps(resync)), "lym", "table.snapshot")
    assert snapshot["version"] == last
    assert snapshot["payload"]["table"]["hand"]["players"][0]["cards"] == ["7h", "2c"]


def test_bots_and_new_hands_keep_going_and_every_message_is_valid(table, clock):
    out = start(table, ("spec", None))
    for _ in range(400):
        clock.advance(1.0)
        out += table.tick()
    completed = to(out, "spec", "hand.completed")
    assert len(completed) >= 5
    for _, message in out:
        assert contract.errors(message, "server") == []


def test_a_message_breaking_the_schema_is_never_sent(table, monkeypatch):
    monkeypatch.setattr(table, "_room_info", lambda: {"room_id": 1})
    with pytest.raises(contract.ContractError):
        table.connect("lym", "1")


def test_a_projection_for_the_wrong_player_is_never_sent(table, monkeypatch):
    # A bug that builds every view as player 3 would show Bình's cards to Lym.
    def wrong_view(viewer):
        hand = table.session.current_hand
        return {"hand_id": table._hand_id(), "hand_no": 1, **hand.view_for("3")}

    table.connect("lym", "1")
    monkeypatch.setattr(table, "_hand_view", wrong_view)
    with pytest.raises(contract.ContractError, match="another player's cards"):
        table.tick()


def test_a_command_id_is_unique_per_hand_not_forever(table, clock):
    # Like the database's unique (hand, command_id): the same id in the next hand is a new command.
    out = start(table, ("lym", "1"))
    first_hand = to(out, "lym", "hand.started")[0]["hand_id"]
    act(table, "lym", first_hand, "fold", command_id="cmd-same-0001")
    out = []
    for _ in range(30):
        clock.advance(1.0)
        out += table.tick()
        if to(out, "lym", "hand.started"):
            break
    out += run_bots(table, clock)
    second_hand = to(out, "lym", "hand.started")[0]["hand_id"]
    assert second_hand == first_hand + 1

    legal = table.session.current_hand.legal_actions("1")
    kind = "check" if legal.can_check else "call"
    out = act(table, "lym", second_hand, kind, command_id="cmd-same-0001")
    assert [m["payload"]["code"] for m in to(out, "lym", "command.rejected")] == []
    assert to(out, "lym", "command.ack")[0]["payload"]["duplicate"] is False
    assert len(to(out, "lym", "action.applied")) == 1
