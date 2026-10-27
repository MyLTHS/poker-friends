"""The Channels side of a room connection: schema + identity, then hand off to the actor.

Per ADR-001, this consumer never touches ``TableSession``/``HandEngine`` directly. It checks a
message against the contract, attaches the sender from the session (never a client-supplied
``player_id``), and puts the command on the room's queue; the actor's broadcasts reach this
consumer as ``table.message`` events through the channel layer (``Actor._send``).
"""

import json
import uuid

from channels.generic.websocket import AsyncWebsocketConsumer

from apps.accounts.ratelimit import RateLimited

from . import actor as actor_module
from . import contract, rooms
from .accounts import player_for_scope
from .models import Room

NO_ACCESS_CLOSE_CODE = 4404


class RoomConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_id = int(self.scope["url_route"]["kwargs"]["room_id"])
        room = await Room.objects.filter(pk=self.room_id).afirst()
        user = self.scope.get("user")
        if room is None or (room.is_private and not (user and user.is_authenticated)):
            await self.close(code=NO_ACCESS_CLOSE_CODE)
            return
        user = await player_for_scope(self.scope)
        verdict = await rooms.access(room, user)
        if verdict != "ok":
            code = NO_ACCESS_CLOSE_CODE if verdict == "hidden" else actor_module.KICKED_CLOSE_CODE
            await self.close(code=code)
            return
        self.player_id = str(user.pk)
        self.conn = uuid.uuid4().hex
        await self.accept()
        self.actor = await actor_module.get_actor(self.room_id)
        self.actor.connect(self.conn, self.channel_name, self.player_id, user.username)

    async def disconnect(self, code):
        if hasattr(self, "actor"):
            self.actor.disconnect(self.conn)

    async def receive(self, text_data=None, bytes_data=None):
        try:
            message = json.loads(text_data) if text_data is not None else None
        except ValueError as error:
            await self._protocol_error("invalid_json", str(error))
            return
        if not isinstance(message, dict):
            await self._protocol_error("invalid_json", "A message must be an object.")
            return
        if message.get("protocol_version") != actor_module.PROTOCOL_VERSION:
            await self._protocol_error("unsupported_protocol_version", "Use version 1.")
            return
        if message.get("type") not in contract.MESSAGE_TYPES["client"]:
            await self._protocol_error("unknown_type", f"Unknown {message.get('type')}.")
            return

        errors = contract.errors(message, "client")
        command_id = message.get("command_id")
        if errors:
            if contract.matches(command_id, "CommandId"):
                await self._rejected(command_id, "invalid_command", "; ".join(errors))
            else:
                await self._protocol_error("invalid_message", "; ".join(errors))
            return
        if message["room_id"] != self.room_id:
            if command_id is not None:
                await self._rejected(command_id, "invalid_command", "Wrong room.")
            else:
                await self._protocol_error("invalid_message", "Wrong room.")
            return

        if message["type"] == "resync.request":
            await self.send(text_data=json.dumps(self.actor.snapshot_message(self.player_id)))
            return
        if message["type"] == "chat.send":
            try:
                rooms.CHAT_PER_PLAYER.hit(self.player_id)
            except RateLimited:
                await self._protocol_error("rate_limited", "Too many chat lines.")
                return
            self.actor.chat(self.player_id, message["payload"]["text"].strip())
            return
        try:
            # The default cache is in-process memory, so this does not block the event loop.
            rooms.COMMANDS_PER_PLAYER.hit(self.player_id)
        except RateLimited:
            await self._rejected(command_id, "rate_limited", "Too many commands.")
            return
        self.actor.submit_command(self.conn, self.player_id, message)

    async def table_message(self, event):
        """From the actor via the channel layer: relay as-is."""
        await self.send(text_data=event["text"])

    async def table_close(self, event):
        """From the actor: this player was kicked (B7)."""
        await self.close(code=event["code"])

    async def _reply(self, type_: str, payload: dict) -> None:
        actor = getattr(self, "actor", None)
        message = {
            "protocol_version": actor_module.PROTOCOL_VERSION,
            "type": type_,
            "room_id": self.room_id,
            "hand_id": actor.hand.pk if actor and actor.hand else None,
            "version": actor.version if actor else 0,
            "server_time": actor_module.iso(),
            "payload": payload,
        }
        await self.send(text_data=json.dumps(message))

    async def _rejected(self, command_id, code, message=""):
        await self._reply(
            "command.rejected", {"command_id": command_id, "code": code, "message": message}
        )

    async def _protocol_error(self, code, message):
        await self._reply("protocol.error", {"code": code, "message": message})
