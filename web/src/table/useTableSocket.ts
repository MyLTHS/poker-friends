"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { ServerMessage } from "@/api/protocol";
import { initialModel, reduce, type TableAction } from "./reducer";

const RETRY_MS = [500, 1000, 2000, 4000];

/** Keeps one WebSocket to the table open (reconnecting on loss) and runs the pure reducer. */
export function useTableSocket(url: string) {
  const [model, dispatch] = useReducer(reduce, undefined, initialModel);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const ws = new WebSocket(url);
      socket.current = ws;
      ws.onopen = () => {
        attempt = 0;
        dispatch({ type: "socket.open" });
      };
      ws.onmessage = (event) => {
        let message: ServerMessage;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        dispatch({ type: "server", message, receivedAt: Date.now() });
      };
      ws.onclose = (event) => {
        if (socket.current === ws) socket.current = null;
        if (stopped) return;
        dispatch({ type: "socket.closed" });
        // Kicked (4403) or no access (4404): retrying cannot help (docs/api/ws-protocol.md).
        if (event.code === 4403 || event.code === 4404) return;
        retry = setTimeout(connect, RETRY_MS[Math.min(attempt++, RETRY_MS.length - 1)]);
      };
    };

    connect();
    const ticker = setInterval(() => dispatch({ type: "tick", now: Date.now() }), 1000);
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(ticker);
      socket.current?.close();
    };
  }, [url]);

  // Drain the outbox whenever the reducer queued something and the socket is open.
  useEffect(() => {
    const ws = socket.current;
    if (model.outbox.length === 0 || !ws || ws.readyState !== WebSocket.OPEN) return;
    for (const message of model.outbox) ws.send(JSON.stringify(message));
    dispatch({ type: "outbox.sent", count: model.outbox.length, now: Date.now() });
  }, [model.outbox]);

  const send = useCallback((action: TableAction) => dispatch(action), []);
  return { model, dispatch: send };
}
