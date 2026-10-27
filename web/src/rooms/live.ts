// What a room page keeps from its WebSocket (B8): chat lines, who is watching, and a counter
// that ticks on every state event so the page reloads the table over REST.

import type { ChatMessage, ServerMessage, Spectator } from "@/api/protocol";

export const CHAT_KEPT = 50;

// State events change the table (docs/api/ws-protocol.md mục 4); notices do not.
const STATE_EVENTS = new Set([
  "hand.started",
  "action.applied",
  "turn.deadline",
  "hand.completed",
  "seat.updated",
  "room.suspended",
  "room.updated",
]);

export type Live = {
  chat: ChatMessage[];
  spectators: Spectator[];
  tableChanges: number;
  closedBy: "kicked" | "no_access" | null;
};

export type LiveEvent =
  | { kind: "history"; messages: ChatMessage[] }
  | { kind: "server"; message: ServerMessage }
  | { kind: "closed"; code: number };

export const initialLive: Live = { chat: [], spectators: [], tableChanges: 0, closedBy: null };

function mergeChat(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(current.map((m) => [m.message_id, m]));
  for (const message of incoming) byId.set(message.message_id, message);
  return [...byId.values()].sort((a, b) => a.message_id - b.message_id).slice(-CHAT_KEPT);
}

export function liveReducer(state: Live, event: LiveEvent): Live {
  switch (event.kind) {
    case "history":
      return { ...state, chat: mergeChat(state.chat, event.messages) };
    case "closed":
      return { ...state, closedBy: event.code === 4403 ? "kicked" : event.code === 4404 ? "no_access" : null };
    case "server": {
      const message = event.message;
      if (message.type === "chat.message") return { ...state, chat: mergeChat(state.chat, [message.payload.message]) };
      if (message.type === "audience.updated") return { ...state, spectators: message.payload.spectators };
      if (STATE_EVENTS.has(message.type)) return { ...state, tableChanges: state.tableChanges + 1 };
      return state;
    }
  }
}
