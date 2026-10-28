"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { ServerMessage } from "@/api/protocol";
import { initialModel, reduce, type TableAction } from "./reducer";

const RETRY_MS = [500, 1000, 2000, 4000];

export type Retry = {
  /** Reconnection attempts since the connection was lost (0 while connected). */
  attempt: number;
  /** When the next attempt starts (local ms), null while one is under way. */
  at: number | null;
  /** The server refused us for good (kicked, no access, too many guests): no retry. */
  final: boolean;
  /** Final because of who the player is (4401, members only): log in, or wait for the owner. */
  auth?: boolean;
};

/** What a close code means (docs/api/ws-protocol.md): retrying cannot help after a kick (4403),
 *  no access (4404), too many guests (4429), or members only (4401, the account decides). */
export function closeKind(code: number): "retry" | "final" | "auth" {
  if (code === 4401) return "auth";
  return code === 4403 || code === 4404 || code === 4429 ? "final" : "retry";
}

/** Keeps one WebSocket to the table open (reconnecting on loss) and runs the pure reducer. */
export function useTableSocket(url: string) {
  const [model, dispatch] = useReducer(reduce, undefined, initialModel);
  const socket = useRef<WebSocket | null>(null);
  const [retry, setRetry] = useState<Retry>({ attempt: 0, at: null, final: false });
  const now = useRef<() => void>(() => {});

  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      clearTimeout(retry);
      setRetry((r) => ({ ...r, at: null }));
      const ws = new WebSocket(url);
      socket.current = ws;
      ws.onopen = () => {
        attempt = 0;
        setRetry({ attempt: 0, at: null, final: false });
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
        const kind = closeKind(event.code);
        if (kind !== "retry") {
          setRetry((r) => ({ ...r, final: true, at: null, auth: kind === "auth" }));
          return;
        }
        const wait = RETRY_MS[Math.min(attempt++, RETRY_MS.length - 1)];
        setRetry({ attempt, at: Date.now() + wait, final: false });
        retry = setTimeout(connect, wait);
      };
    };
    // "Thử lại ngay": skip the wait (only while no socket is open or opening).
    now.current = () => {
      if (stopped || socket.current) return;
      connect();
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
  const reconnectNow = useCallback(() => now.current(), []);
  /** "Tải lại bàn": drop the connection; the next one starts from a fresh snapshot. */
  const reload = useCallback(() => socket.current?.close(), []);
  return { model, dispatch: send, retry, reconnectNow, reload };
}
