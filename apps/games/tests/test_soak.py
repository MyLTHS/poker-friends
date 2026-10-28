"""The soak bots' own checks, fed contract fixtures instead of a running server."""

import asyncio
import json
import random

from apps.games import contract
from apps.games.management.commands.soak import Bot, Report

FIXTURES = contract.API_DIR / "fixtures" / "server"
OPTIONS = {"seed": "test", "room_id": 1, "reconnect": 0, "slow": 0, "url": "ws://test"}


def fixture(kind: str, name: str) -> dict:
    return json.loads((FIXTURES / kind / f"{name}.json").read_text())


class FakeSocket:
    def __init__(self):
        self.sent = []

    async def send(self, raw: str) -> None:
        self.sent.append(json.loads(raw))


def bot_for(player_id: str, report: Report | None = None) -> Bot:
    bot = Bot(player_id, "session", OPTIONS, report or Report(target=10))
    bot.ws = FakeSocket()
    return bot


def feed(bot: Bot, message: dict, version: int | None = None) -> None:
    """Deliver ``message`` as the next event after ``version`` (default: the one just before)."""
    bot.version = message["version"] - 1 if version is None else version

    async def run():
        await bot.receive(message)

    asyncio.run(run())


def test_bot_acts_legally_on_its_turn():
    message = fixture("valid", "action.applied.with-legal-actions")
    bot = bot_for("3")
    feed(bot, message)
    legal = message["payload"]["hand"]["legal_actions"]
    [sent] = bot.ws.sent
    assert sent["type"] == "command.act"
    assert sent["hand_id"] == message["hand_id"]
    assert sent == {"protocol_version": 1, "room_id": 1, **bot.pending}
    payload = sent["payload"]
    if payload["kind"] == "raise":
        assert legal["min_raise_to"] <= payload["amount"] <= legal["max_raise_to"]
    else:
        assert payload["amount"] is None
    assert bot.report.problems == []


def test_bot_waits_when_it_is_not_its_turn():
    bot = bot_for("1")
    feed(bot, fixture("valid", "action.applied.raise"))
    assert bot.ws.sent == []


def test_version_gap_asks_for_a_snapshot():
    message = fixture("valid", "action.applied.raise")
    bot = bot_for("1")
    feed(bot, message, version=message["version"] - 3)
    assert bot.ws.sent[-1]["type"] == "resync.request"
    assert bot.report.gaps == 1
    assert bot.report.problems  # the server never skips an event on a live socket
    assert bot.version is None


def test_one_decision_per_turn_until_answered():
    message = fixture("valid", "action.applied.with-legal-actions")
    bot = bot_for("3")
    feed(bot, message)
    again = {**message, "version": message["version"] + 1, "type": "turn.deadline"}
    again["payload"] = fixture("valid", "turn.deadline")["payload"]
    feed(bot, again)
    assert len(bot.ws.sent) == 1
    ack = fixture("valid", "command.ack")
    ack["payload"]["command_id"] = bot.pending["command_id"]
    feed(bot, ack, version=bot.version)
    assert bot.pending is None
    assert bot.report.problems == []


def test_pending_command_is_resent_after_reconnect():
    bot = bot_for("3")
    feed(bot, fixture("valid", "action.applied.with-legal-actions"))
    [first] = bot.ws.sent
    bot.reset()  # the socket dropped before the answer came
    bot.ws = FakeSocket()
    snapshot = fixture("valid", "table.snapshot.mid-hand")
    feed(bot, snapshot, version=snapshot["version"])
    assert bot.ws.sent[0] == first  # same command_id: the server dedups it
    assert bot.report.resends == 1


def test_race_with_the_clock_is_tolerated_only_after_a_slow_turn():
    rejected = fixture("valid", "command.rejected.not-your-turn")
    for may_race, problems in ((True, 0), (False, 1)):
        bot = bot_for("1")
        bot.may_race = may_race
        feed(bot, rejected, version=rejected["version"])
        assert len(bot.report.problems) == problems


def test_leaks_are_reported():
    viewers = json.loads((FIXTURES / "viewers.json").read_text())["leaks"]
    for name, viewer in viewers.items():
        bot = bot_for(viewer)
        message = fixture("leaks", name)
        if "version" in message:
            feed(bot, message)
        assert bot.report.problems, name


def test_bots_disagreeing_on_results_is_a_problem():
    report = Report(target=10)
    message = fixture("valid", "hand.completed.showdown")
    feed(bot_for("2", report), message)
    changed = json.loads(json.dumps(message))
    changed["payload"]["results"][0]["hand_net"] += 1
    feed(bot_for("1", report), changed)
    assert any("different results" in p for p in report.problems)


def test_reaching_the_target_stops_the_run():
    report = Report(target=1)
    feed(bot_for("2", report), fixture("valid", "hand.completed.showdown"))
    assert report.done.is_set()
    assert report.completed == 1


def test_choices_stay_inside_legal_actions():
    bot = bot_for("1")
    rng = random.Random(7)
    for _ in range(2000):
        low = rng.randint(2, 500)
        legal = {
            "can_fold": True,
            "can_check": rng.random() < 0.5,
            "call_amount": rng.randint(0, 100),
            "min_raise_to": low if rng.random() < 0.8 else None,
            "max_raise_to": rng.randint(low, 2000),
        }
        if legal["min_raise_to"] is None:
            legal["max_raise_to"] = None
        kind, amount = bot.choose(legal, rng.randint(1, 3000))
        if kind == "raise":
            assert legal["min_raise_to"] <= amount <= legal["max_raise_to"]
        else:
            assert amount is None
            assert kind != "check" or legal["can_check"]
            assert kind != "call" or not legal["can_check"]
