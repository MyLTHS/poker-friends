"""The Channels side of a room connection: schema + identity, then hand off to the actor.

Per ADR-001, this consumer never touches ``TableSession``/``HandEngine`` directly. It checks a
message against the contract, attaches the sender from the session (never a client-supplied
``player_id``), and puts the command on the room's queue; the actor's broadcasts reach this
consumer as ``table.message`` events through the channel layer (``Actor._send``).
"""

import json
import uuid

from autobahn.exception import Disconnected
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.conf import settings

from apps.accounts.middleware import is_member
from apps.accounts.ratelimit import RateLimited

from . import actor as actor_module
from . import contract, rooms
from .accounts import player_for_scope
from .models import Room, User

LOGIN_REQUIRED_CLOSE_CODE = 4401
NO_ACCESS_CLOSE_CODE = 4404
GUEST_LIMIT_CLOSE_CODE = 4429


class RoomConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_id = int(self.scope["url_route"]["kwargs"]["room_id"])
        room = await Room.objects.filter(pk=self.room_id).afirst()
        user = self.scope.get("user")
        if not settings.GUESTS_ALLOWED and not (
            user is not None and await database_sync_to_async(is_member)(user)
        ):
            # Members only (apps/accounts/middleware.py): no guest made on the fly, no old guest.
            await self._refuse(LOGIN_REQUIRED_CLOSE_CODE)
            return
        if room is None or (room.is_private and not (user and user.is_authenticated)):
            await self._refuse(NO_ACCESS_CLOSE_CODE)
            return
        try:
            user = await player_for_scope(self.scope)
        except RateLimited:
            await self._refuse(GUEST_LIMIT_CLOSE_CODE)
            return
        verdict = await rooms.access(room, user)
        if verdict != "ok":
            code = NO_ACCESS_CLOSE_CODE if verdict == "hidden" else actor_module.KICKED_CLOSE_CODE
            await self._refuse(code)
            return
        self.player_id = str(user.pk)
        self.conn = uuid.uuid4().hex
        await self.accept()
        self.actor = await actor_module.get_actor(self.room_id)
        self.actor.connect(self.conn, self.channel_name, self.player_id, user.username)

    async def _refuse(self, code: int) -> None:
        # Accept first: closing during the handshake is an HTTP 403 to a browser, which then
        # sees only 1006 and cannot tell "kicked" from "network down" (the client stops retrying
        # on 4403/4404).
        await self.accept()
        await self.close(code=code)

    async def disconnect(self, code):
        if hasattr(self, "actor"):
            self.actor.disconnect(self.conn)

    async def receive(self, text_data=None, bytes_data=None):
        if not settings.GUESTS_ALLOWED:
            user = await User.objects.filter(pk=int(self.player_id)).afirst()
            if user is None or not await database_sync_to_async(is_member)(user):
                # The account was switched off in /admin/ while connected: stop here too.
                await self.close(code=LOGIN_REQUIRED_CLOSE_CODE)
                return
        elif not await User.objects.filter(pk=int(self.player_id), is_active=True).aexists():
            # Locked in the admin while connected. Auth already treats an inactive account as
            # logged out for new requests; this socket was opened before and must stop too.
            # 4403 like a kick, so the client does not keep reconnecting.
            await self.close(code=actor_module.KICKED_CLOSE_CODE)
            return
        try:
            message = json.loads(text_data) if text_data is not None else None
        except ValueError as error:
            await self._protocol_error("invalid_json", str(error))
            return
        if not isinstance(message, dict):
            await self._protocol_error("invalid_json", "A message must be an object.")
            return
        try:
            # Every message counts, invalid ones and resyncs included: each costs a schema check
            # or a full snapshot. The cache is in-process memory, so this does not block.
            rooms.COMMANDS_PER_PLAYER.hit(self.player_id)
        except RateLimited:
            command_id = message.get("command_id")
            if contract.matches(command_id, "CommandId"):
                await self._rejected(command_id, "rate_limited", "Too many messages.")
            else:
                await self._protocol_error("rate_limited", "Too many messages.")
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
        self.actor.submit_command(self.conn, self.player_id, message)

    async def send(self, text_data=None, bytes_data=None, close=False):
        try:
            await super().send(text_data=text_data, bytes_data=bytes_data, close=close)
        except Disconnected:
            # Daphne: the client began closing a moment ago and its websocket.disconnect is on
            # the way. Raising here would end this consumer before disconnect() runs, leaving
            # the actor sending to a dead socket until its channel fills up (seen in a soak).
            pass

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
