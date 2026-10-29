"""Phase E operations commands: ``simulate_hands`` fills a database, ``check_ledger`` checks it."""

from io import StringIO

import pytest
from django.core.management import CommandError, call_command
from django.db import connection

from apps.games.models import Hand, HandCommand, LedgerEntry, LedgerKind, Room, User

pytestmark = pytest.mark.django_db


def check(*args) -> str:
    out = StringIO()
    call_command("check_ledger", *args, stdout=out)
    return out.getvalue()


def check_fails(*args) -> str:
    out = StringIO()
    with pytest.raises(CommandError, match="LỆCH"):
        call_command("check_ledger", *args, stdout=out)
    return out.getvalue()


def simulated_room(**options) -> Room:
    call_command("simulate_hands", stdout=StringIO(), **options)
    return Room.objects.latest("pk")


def a_finished_hand(room: Room) -> Hand:
    return room.hands.exclude(completed_at=None).exclude(ledger_entries=None).first()


class TestSimulateHands:
    def test_stores_hands_like_the_server(self):
        room = simulated_room(hands=15, players=3, seed=4)
        assert room.hands.count() == 15
        assert not room.hands.filter(completed_at=None).exists()
        assert HandCommand.objects.filter(hand__room=room).exists()
        grants = LedgerEntry.objects.filter(room=room, kind=LedgerKind.GRANT).count()
        assert grants >= 3

    def test_can_leave_the_last_hand_unfinished(self):
        room = simulated_room(hands=5, players=4, leave_unfinished=True)
        assert list(room.hands.filter(completed_at=None).values_list("hand_no", flat=True)) == [6]

    def test_bomb_pots_get_an_amount_of_two_big_blinds_unless_given(self):
        room = simulated_room(hands=4, players=3, bomb_pot_every=2)
        assert (room.bomb_pot_every, room.bomb_pot_amount) == (2, 4)
        assert room.hands.filter(config__bomb_pot=4).count() == 2
        with pytest.raises(CommandError, match="bomb-pot-amount"):
            call_command("simulate_hands", bomb_pot_every=2, bomb_pot_amount=0, stdout=StringIO())

    def test_rejects_bad_arguments(self):
        with pytest.raises(CommandError):
            call_command("simulate_hands", players=1, stdout=StringIO())
        with pytest.raises(CommandError):
            call_command("simulate_hands", hands=0, stdout=StringIO())


class TestCheckLedgerPasses:
    def test_clean_rooms_pass_and_are_reported(self):
        first = simulated_room(hands=30, players=3, seven_deuce_bonus=20, seed=1)
        simulated_room(hands=10, players=2, seed=2, leave_unfinished=True)
        out = check()
        assert f"Phòng {first.pk}" in out
        assert "replay 30" in out
        assert "đang chơi dở" in out
        assert "OK: 2 phòng" in out

    def test_an_empty_database_passes(self):
        assert "OK: 0 phòng" in check()

    def test_a_voided_hand_is_fine(self):
        room = simulated_room(hands=3, players=4, leave_unfinished=True)
        hand = room.hands.get(completed_at=None)
        call_command("void_hand", str(hand.pk), "--reason", "test", "--force", stdout=StringIO())
        assert "OK" in check()

    def test_only_the_rooms_asked_for(self):
        room = simulated_room(hands=2)
        other = simulated_room(hands=2)
        out = check("--room", str(room.pk))
        assert f"Phòng {room.pk}" in out
        assert f"Phòng {other.pk}" not in out
        with pytest.raises(CommandError, match="Không có phòng"):
            check("--room", "999999")


class TestCheckLedgerFails:
    def test_chips_created_by_a_hand(self):
        room = simulated_room(hands=5, players=3)
        hand = a_finished_hand(room)
        LedgerEntry.objects.create(
            room=room, user=User.objects.first(), kind=LedgerKind.HAND, amount=50, hand=hand
        )
        out = check_fails()
        assert "khác tổng chip đã cấp" in out
        assert f"ván #{hand.hand_no}" in out

    def test_a_negative_balance(self):
        room = simulated_room(hands=2, players=2)
        user = room.seats.first().user
        LedgerEntry.objects.create(room=room, user=user, kind=LedgerKind.GRANT, amount=-10_000)
        assert f"{user.username} có số dư âm" in check_fails()

    def test_a_missing_hand(self):
        room = simulated_room(hands=3, players=2)
        last = room.hands.last()
        Hand.objects.create(room=room, hand_no=last.hand_no + 2, button_seat=1, config=last.config)
        out = check_fails()
        assert f"thiếu ván số {last.hand_no + 1}" in out

    def test_an_unfinished_hand_that_is_not_the_last(self):
        room = simulated_room(hands=2, players=4, leave_unfinished=True)
        stuck = room.hands.get(completed_at=None)
        Hand.objects.create(
            room=room, hand_no=stuck.hand_no + 1, button_seat=1, config=stuck.config
        )
        assert "ván chưa xong không phải ván cuối" in check_fails()

    def test_a_result_that_replay_does_not_give(self):
        room = simulated_room(hands=4, players=3, seed=7)
        hand = a_finished_hand(room)
        # Same chip moves (the ledger agrees) but stacks no replay can produce.
        hand.result["final_stacks"] = {p: s + 1 for p, s in hand.result["final_stacks"].items()}
        hand.save(update_fields=["result"])
        assert "replay ra kết quả khác" in check_fails()
        assert "OK" in check("--no-replay")


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(connection.vendor != "postgresql", reason="snapshot isolation is PostgreSQL")
def test_check_ledger_reads_one_snapshot(monkeypatch):
    """A hand finishing while the check runs must not look like a mismatch: every query of
    one run sees the same moment (REPEATABLE READ), and the check never writes."""
    from apps.games.management.commands import check_ledger

    simulated_room(hands=2, players=2)
    seen = []
    real = check_ledger.check_room

    def spy(room, replay=True):
        with connection.cursor() as cursor:
            cursor.execute("SHOW transaction_isolation")
            isolation = cursor.fetchone()[0]
            cursor.execute("SHOW transaction_read_only")
            seen.append((isolation, cursor.fetchone()[0]))
        return real(room, replay)

    monkeypatch.setattr(check_ledger, "check_room", spy)
    assert "OK" in check()
    assert seen == [("repeatable read", "on")]
