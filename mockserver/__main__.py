"""Run the mock server: uv run python -m mockserver  (then open http://localhost:8765/)."""

import argparse
import asyncio
import logging
from pathlib import Path

from .server import clock, run
from .table import SCENARIO_PATH, MockTable, load_scenario


def main() -> None:
    parser = argparse.ArgumentParser(description="Mock WebSocket server for docs/api/.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--scenario", type=Path, default=SCENARIO_PATH)
    parser.add_argument("--think-time", type=int, default=None, help="seconds per turn")
    parser.add_argument("--bot-delay", type=float, default=1.5, help="seconds before a bot acts")
    parser.add_argument("--quiet", action="store_true", help="do not log every message")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.WARNING if args.quiet else logging.INFO,
        format="%(asctime)s %(message)s",
        datefmt="%H:%M:%S",
    )
    table = MockTable(
        load_scenario(args.scenario),
        clock=clock,
        bot_delay=args.bot_delay,
        think_time=args.think_time,
    )
    try:
        asyncio.run(run(table, args.host, args.port))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
