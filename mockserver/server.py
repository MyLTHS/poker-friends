"""Network side of the mock server: WebSocket at /ws/rooms/<room_id>/, test page at /.

Everything runs on one asyncio event loop. ``MockTable`` methods are synchronous, so two
messages are never handled at the same time (the same single-writer idea as the real table
actor). Their output goes into one queue drained by one sender task, so every connection
receives messages in exactly the order the table produced them; otherwise two coroutines
sending at once could interleave and make clients see version gaps.
"""

import asyncio
import json
import logging
import time
import uuid
from http import HTTPStatus
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from websockets.asyncio.server import Server, ServerConnection, serve
from websockets.datastructures import Headers
from websockets.exceptions import ConnectionClosed
from websockets.http11 import Request, Response

from .table import MockTable, Outbound

log = logging.getLogger("mockserver")
PAGE = Path(__file__).with_name("static") / "table.html"
TICK_SECONDS = 0.2


class MockServer:
    def __init__(self, table: MockTable):
        self.table = table
        self.sockets: dict[str, ServerConnection] = {}
        self.outbox: asyncio.Queue[Outbound] = asyncio.Queue()

    def _queue(self, out: list[Outbound]) -> None:
        for item in out:
            self.outbox.put_nowait(item)

    async def _sender(self) -> None:
        while True:
            conn, message = await self.outbox.get()
            socket = self.sockets.get(conn)
            if socket is None:
                continue
            log.info(
                "→ %s %s v%s", self.table.connections.get(conn), message["type"], message["version"]
            )
            try:
                await socket.send(json.dumps(message, ensure_ascii=False))
            except ConnectionClosed:
                pass

    async def _ticker(self) -> None:
        while True:
            await asyncio.sleep(TICK_SECONDS)
            self._queue(self.table.tick())

    def _process_request(self, connection: ServerConnection, request: Request) -> Response | None:
        path = urlsplit(request.path).path
        if path in ("/", "/table.html"):
            headers = Headers([("Content-Type", "text/html; charset=utf-8")])
            return Response(HTTPStatus.OK, "OK", headers, PAGE.read_bytes())
        if path.rstrip("/") != f"/ws/rooms/{self.table.room['room_id']}":
            return connection.respond(HTTPStatus.NOT_FOUND, "Not found\n")
        return None

    async def _handle(self, socket: ServerConnection) -> None:
        query = parse_qs(urlsplit(socket.request.path).query)
        player = query.get("player", [None])[0]
        conn = uuid.uuid4().hex
        self.sockets[conn] = socket
        self._queue(self.table.connect(conn, player))
        log.info("+ %s connected as player %s", conn[:8], self.table.player_of(conn))
        try:
            async for text in socket:
                if isinstance(text, bytes):
                    text = text.decode("utf-8", errors="replace")
                log.info("← %s %s", self.table.player_of(conn), text[:200])
                self._queue(self.table.receive(conn, text))
        except ConnectionClosed:
            pass
        finally:
            self._queue(self.table.disconnect(conn))
            # Messages still queued for this connection are dropped by _sender from now on.
            self.sockets.pop(conn, None)
            log.info("- %s left", conn[:8])

    async def start(self, host: str, port: int) -> Server:
        self._tasks = [asyncio.create_task(self._sender()), asyncio.create_task(self._ticker())]
        return await serve(self._handle, host, port, process_request=self._process_request)


async def run(table: MockTable, host: str, port: int) -> None:
    server = await MockServer(table).start(host, port)
    shown = "localhost" if host in ("127.0.0.1", "0.0.0.0") else host
    print(f"Mock server chạy tại http://{shown}:{port}/  (Ctrl+C để dừng)")
    print(f"WebSocket: ws://{shown}:{port}/ws/rooms/{table.room['room_id']}/?player=<1|2|3>")
    await server.serve_forever()


def clock() -> float:
    return time.time()
