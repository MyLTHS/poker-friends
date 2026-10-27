"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

import type { ServerMessage } from "@/api/protocol";

import { roomSocketUrl, type RoomsApi } from "./api";
import { initialLive, liveReducer } from "./live";

// Django's WebSocket, not proxied by Next: cookies are per host, so the session from
// localhost:3000 is also sent to localhost:8000.
const SOCKET_BASE = process.env.NEXT_PUBLIC_DJANGO_WS ?? "ws://localhost:8000";

/** Chat, spectators and "the table changed" for a room page (B8). Reconnects after 4 s. */
export function useRoomLive(rooms: RoomsApi, roomId: number) {
  const [live, dispatch] = useReducer(liveReducer, initialLive);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    let stopped = false;
    let retry: number | undefined;
    const open = () => {
      const ws = new WebSocket(roomSocketUrl(SOCKET_BASE, roomId));
      socket.current = ws;
      ws.onopen = () => {
        // Lines said while we were away: the socket only brings new ones.
        rooms.chat(roomId).then((result) => {
          if (result.ok && !stopped) dispatch({ kind: "history", messages: result.data.messages });
        });
      };
      ws.onmessage = (event) => dispatch({ kind: "server", message: JSON.parse(event.data) as ServerMessage });
      ws.onclose = (event) => {
        dispatch({ kind: "closed", code: event.code });
        // Kicked or no access: retrying cannot help.
        if (!stopped && event.code !== 4403 && event.code !== 4404) retry = window.setTimeout(open, 4000);
      };
    };
    open();
    return () => {
      stopped = true;
      window.clearTimeout(retry);
      socket.current?.close();
    };
  }, [rooms, roomId]);

  const say = useCallback(
    (text: string) => {
      socket.current?.send(JSON.stringify({ protocol_version: 1, type: "chat.send", room_id: roomId, payload: { text } }));
    },
    [roomId],
  );

  return { live, say };
}
