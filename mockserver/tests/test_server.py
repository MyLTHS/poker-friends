"""The mock server over a real socket: test page over HTTP, the protocol over WebSocket."""

import asyncio
import json
import time

from websockets.asyncio.client import connect

from apps.games import contract
from mockserver.server import MockServer
from mockserver.table import MockTable, load_scenario


async def _with_server(scenario_test):
    table = MockTable(load_scenario(), clock=time.time, bot_delay=0.05, next_hand_delay=0.05)
    server = await MockServer(table).start("127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]
    try:
        return await asyncio.wait_for(scenario_test(port), timeout=10)
    finally:
        server.close()


async def _receive_until(socket, type_):
    received = []
    while True:
        message = json.loads(await socket.recv())
        assert contract.errors(message, "server") == []
        received.append(message)
        if message["type"] == type_:
            return received


def test_serves_the_test_page():
    async def scenario(port):
        reader, writer = await asyncio.open_connection("127.0.0.1", port)
        writer.write(b"GET / HTTP/1.1\r\nHost: localhost\r\n\r\n")
        await writer.drain()
        response = await reader.read(200_000)
        writer.close()
        return response

    response = asyncio.run(_with_server(scenario))
    assert response.startswith(b"HTTP/1.1 200")
    assert b"<html" in response


def test_plays_over_websocket_and_acks_a_retried_command_once():
    async def scenario(port):
        async with connect(f"ws://127.0.0.1:{port}/ws/rooms/1/?player=1") as socket:
            first = await _receive_until(socket, "turn.deadline")
            started = next(m for m in first if m["type"] == "hand.started")
            command = {
                "protocol_version": 1,
                "type": "command.act",
                "room_id": 1,
                "hand_id": started["hand_id"],
                "command_id": "retry-me-0001",
                "payload": {"kind": "call", "amount": None},
            }
            await socket.send(json.dumps(command))
            await socket.send(json.dumps(command))
            acks = []
            applied = []
            while len(acks) < 2:
                message = json.loads(await socket.recv())
                assert contract.errors(message, "server") == []
                if message["type"] == "command.ack":
                    acks.append(message["payload"])
                if (
                    message["type"] == "action.applied"
                    and message["payload"]["action"]["player_id"] == "1"
                ):
                    applied.append(message)
            return first, acks, applied

    first, acks, applied = asyncio.run(_with_server(scenario))
    assert first[0]["type"] == "table.snapshot"
    assert [a["duplicate"] for a in acks] == [False, True]
    assert acks[0]["result_version"] == acks[1]["result_version"]
    assert len(applied) == 1
