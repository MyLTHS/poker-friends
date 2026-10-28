"""A send racing the client's close must not end the consumer before disconnect() runs."""

import asyncio

from autobahn.exception import Disconnected

from apps.games.consumers import RoomConsumer


def test_send_after_client_closed_keeps_consumer_alive():
    consumer = RoomConsumer()

    async def closed(message):
        raise Disconnected("Attempt to send on a closed protocol")

    consumer.base_send = closed
    asyncio.run(consumer.table_message({"text": "{}"}))  # no exception: disconnect() still runs
