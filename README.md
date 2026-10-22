# Poker Friends

No-Limit Texas Hold'em chip ảo cho nhóm bạn. Backend Django + PokerKit.

- Đặc tả: [docs/spec.md](docs/spec.md)
- Lộ trình: [docs/roadmap.md](docs/roadmap.md)
- Quy ước làm việc: [CONTRIBUTING.md](CONTRIBUTING.md)

## Chạy

```bash
cp .env.example .env
docker compose up
```

Hoặc không dùng Docker:

```bash
uv sync
.venv/bin/pytest
.venv/bin/python -m apps.games.engine.simulate --hands 5000 --players 9
```

## Cấu trúc

```
apps/games/engine/   # lõi thuần Python, không phụ thuộc Django
  cards.py           # bộ bài + xáo bằng CSPRNG
  hand.py            # HandEngine: một ván, bọc PokerKit
  table.py           # TableSession: ghế, chip theo phòng (ledger), nhiều ván
  simulate.py        # bot ngẫu nhiên + kiểm tra bất biến
apps/games/tests/    # golden tests, property tests
config/              # Django settings (đọc biến môi trường)
web/                 # frontend Next.js (Codex)
docs/                # đặc tả, lộ trình, hợp đồng API, trao đổi, bài học
```
