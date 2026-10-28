"""Check the chip ledger and the hands of every room; exit non-zero if anything is wrong.

Run it after restoring a backup (docs/runbook.md), or whenever chips look off. Read-only: it
never writes to the database. Checks, per room:

- chips now held (sum of every ledger entry) equal chips granted (sum of grants), so hands
  only moved chips between players; each hand's own entries sum to zero too;
- no player holds a negative balance;
- hand numbers run 1, 2, 3... with no gap, and each hand's commands run 1, 2, 3...;
- a finished hand's ledger entries match its stored result, a voided hand has none, and at
  most one hand is unfinished (the last one: the server resumes it on restart);
- unless ``--no-replay``: replaying each finished hand from its command log gives the stored
  result (docs/spec.md: every hand replays to the same result).

Safe while the server plays: on PostgreSQL every query reads one snapshot of the database.

The report is in Vietnamese: it is read by the owner during an incident.
"""

import json
from collections import defaultdict
from contextlib import contextmanager
from dataclasses import asdict, dataclass, field

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.db.models import Sum

from apps.games.engine.hand import HandEngine
from apps.games.models import Hand, LedgerEntry, LedgerKind, Room


@dataclass
class RoomReport:
    room: Room
    granted: int = 0
    held: int = 0
    hands: int = 0
    replayed: int = 0
    unfinished: list[int] = field(default_factory=list)
    problems: list[str] = field(default_factory=list)


class Command(BaseCommand):
    help = "Check every room's chip ledger and hands (after a restore, say). Exit 1 if wrong."

    def add_arguments(self, parser):
        parser.add_argument("--room", type=int, action="append", help="Only this room (repeat).")
        parser.add_argument(
            "--no-replay",
            action="store_true",
            help="Skip replaying finished hands (faster on a big database).",
        )

    def handle(self, *args, **options):
        with snapshot():
            rooms = Room.objects.order_by("pk")
            if options["room"]:
                rooms = rooms.filter(pk__in=options["room"])
                missing = set(options["room"]) - set(rooms.values_list("pk", flat=True))
                if missing:
                    raise CommandError(f"Không có phòng: {', '.join(map(str, sorted(missing)))}")
            reports = [check_room(room, replay=not options["no_replay"]) for room in rooms]
        for report in reports:
            self._print(report)

        bad = [r for r in reports if r.problems]
        total = sum(r.held for r in reports)
        self.stdout.write("")
        if bad:
            raise CommandError(
                f"LỆCH: {len(bad)}/{len(reports)} phòng có vấn đề "
                f"({sum(len(r.problems) for r in bad)} lỗi). Xem docs/runbook.md mục lệch chip."
            )
        self.stdout.write(
            self.style.SUCCESS(f"OK: {len(reports)} phòng, tổng {total} chip, không lệch.")
        )

    def _print(self, report: RoomReport) -> None:
        room = report.room
        mark = self.style.ERROR("LỖI") if report.problems else self.style.SUCCESS("ok ")
        replayed = f", replay {report.replayed}" if report.replayed else ""
        self.stdout.write(
            f"[{mark}] Phòng {room.pk} ({room.name}): cấp {report.granted}, "
            f"đang có {report.held}, {report.hands} ván{replayed}"
        )
        for hand_no in report.unfinished:
            self.stdout.write(f"      ván #{hand_no} đang chơi dở (server sẽ chơi tiếp)")
        for problem in report.problems:
            self.stdout.write(self.style.ERROR(f"      - {problem}"))


@contextmanager
def snapshot():
    """Run every query on one consistent view of the database (PostgreSQL REPEATABLE READ).

    Otherwise a hand finishing, or a grant landing, between two queries of a running server
    looks like a mismatch: the ledger read before the hand row, say. SQLite (development) has
    no concurrent writer to worry about. Inside an outer transaction (tests) the level is
    already fixed, so it is left as it is.
    """
    outer = connection.in_atomic_block
    with transaction.atomic():
        if connection.vendor == "postgresql" and not outer:
            with connection.cursor() as cursor:
                cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        yield


def check_room(room: Room, replay: bool = True) -> RoomReport:
    report = RoomReport(room=room)
    entries = LedgerEntry.objects.filter(room=room)
    report.held = entries.aggregate(s=Sum("amount"))["s"] or 0
    report.granted = entries.filter(kind=LedgerKind.GRANT).aggregate(s=Sum("amount"))["s"] or 0
    if report.held != report.granted:
        report.problems.append(
            f"tổng chip đang có ({report.held}) khác tổng chip đã cấp ({report.granted})"
        )

    balances = entries.values("user_id", "user__username").annotate(s=Sum("amount"))
    for row in balances.order_by("user_id"):
        if row["s"] < 0:
            report.problems.append(f"{row['user__username']} có số dư âm: {row['s']}")

    by_hand: dict[int, list[LedgerEntry]] = defaultdict(list)
    for entry in entries.exclude(hand=None):
        by_hand[entry.hand_id].append(entry)

    hands = list(Hand.objects.filter(room=room).order_by("hand_no").prefetch_related("commands"))
    report.hands = len(hands)
    numbers = [h.hand_no for h in hands]
    if numbers != list(range(1, len(hands) + 1)):
        missing = sorted(set(range(1, max(numbers, default=0) + 1)) - set(numbers))
        report.problems.append(f"thiếu ván số {', '.join(map(str, missing))}")

    for hand in hands:
        report.problems += _check_hand(hand, by_hand.pop(hand.pk, []))
        if replay and hand.completed_at is not None and not _is_voided(hand):
            report.replayed += 1
            report.problems += _check_replay(hand)

    unfinished = [h.hand_no for h in hands if h.completed_at is None]
    if unfinished and (len(unfinished) > 1 or unfinished[-1] != numbers[-1]):
        report.problems.append(
            f"ván chưa xong không phải ván cuối: #{', #'.join(map(str, unfinished))}"
        )
    report.unfinished = unfinished
    return report


def _is_voided(hand: Hand) -> bool:
    return bool(hand.result and hand.result.get("voided"))


def _check_hand(hand: Hand, entries: list[LedgerEntry]) -> list[str]:
    name = f"ván #{hand.hand_no} (id {hand.pk})"
    problems = []
    sequences = [c.sequence for c in hand.commands.all()]  # prefetched, in sequence order
    if sequences != list(range(1, len(sequences) + 1)):
        problems.append(f"{name}: thứ tự lệnh bị hở {sequences}")

    moved = sum(e.amount for e in entries)
    if moved != 0:
        problems.append(f"{name}: chip ghi sổ cộng lại {moved}, phải bằng 0")
    if hand.completed_at is None:
        if entries:
            problems.append(f"{name}: chưa xong mà đã có {len(entries)} dòng sổ chip")
        return problems
    if _is_voided(hand):
        if entries:
            problems.append(f"{name}: đã huỷ mà vẫn có {len(entries)} dòng sổ chip")
        return problems

    net: dict[str, int] = defaultdict(int)
    for e in entries:
        if e.kind == LedgerKind.HAND:
            net[str(e.user_id)] += e.amount
    expected = {p: d for p, d in (hand.result or {}).get("net", {}).items() if d}
    if dict(net) != expected:
        problems.append(f"{name}: sổ chip {dict(net)} khác kết quả đã lưu {expected}")
    return problems


def _check_replay(hand: Hand) -> list[str]:
    name = f"ván #{hand.hand_no} (id {hand.pk})"
    try:
        engine = HandEngine.replay(hand.replay_record())
    except Exception as error:
        return [f"{name}: replay lỗi ({error})"]
    if not engine.is_complete:
        return [f"{name}: replay chưa hết ván dù ván đã xong"]
    # Through JSON, like the stored result, so tuples and int keys compare the same way.
    replayed = json.loads(json.dumps(asdict(engine.result())))
    if replayed != hand.result:
        return [f"{name}: replay ra kết quả khác kết quả đã lưu"]
    return []
