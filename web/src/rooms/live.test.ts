import { describe, expect, it } from "vitest";

import { initialLive, liveReducer } from "./live";

const line = (id: number, text = `dòng ${id}`) => ({
  message_id: id,
  player_id: "2",
  display_name: "An",
  text,
  sent_at: "2026-10-27T14:00:00.000Z",
});

const envelope = { protocol_version: 1 as const, room_id: 1, hand_id: null, version: 3, server_time: "2026-10-27T14:00:00.000Z" };

describe("liveReducer", () => {
  it("appends chat lines once, oldest first, keeping the last 50", () => {
    let state = liveReducer(initialLive, { kind: "history", messages: [line(1), line(2)] });
    state = liveReducer(state, { kind: "server", message: { ...envelope, type: "chat.message", payload: { message: line(2) } } });
    state = liveReducer(state, { kind: "server", message: { ...envelope, type: "chat.message", payload: { message: line(3) } } });
    expect(state.chat.map((m) => m.message_id)).toEqual([1, 2, 3]);

    for (let id = 4; id <= 60; id++) {
      state = liveReducer(state, { kind: "server", message: { ...envelope, type: "chat.message", payload: { message: line(id) } } });
    }
    expect(state.chat).toHaveLength(50);
    expect(state.chat[0].message_id).toBe(11);
  });

  it("history that arrives after live lines does not duplicate them", () => {
    let state = liveReducer(initialLive, { kind: "server", message: { ...envelope, type: "chat.message", payload: { message: line(5) } } });
    state = liveReducer(state, { kind: "history", messages: [line(4), line(5)] });
    expect(state.chat.map((m) => m.message_id)).toEqual([4, 5]);
  });

  it("replaces the spectator list", () => {
    const state = liveReducer(initialLive, {
      kind: "server",
      message: { ...envelope, type: "audience.updated", payload: { spectators: [{ player_id: "5", display_name: "Chi" }] } },
    });
    expect(state.spectators).toEqual([{ player_id: "5", display_name: "Chi" }]);
  });

  it("counts state events so the page knows to reload the table, but not notices", () => {
    let state = liveReducer(initialLive, {
      kind: "server",
      message: { ...envelope, type: "room.updated", payload: { room: { room_id: 1, name: "x", status: "open", max_seats: 9, small_blind: 1, big_blind: 2, think_time_seconds: 30, seven_deuce_bonus: 0, starting_stack: 200, ante: 0, bomb_pot_every: 0, bomb_pot_amount: 0, run_it_twice: false, rabbit_hunt: true } } },
    });
    expect(state.tableChanges).toBe(1);
    state = liveReducer(state, { kind: "server", message: { ...envelope, type: "chat.message", payload: { message: line(1) } } });
    expect(state.tableChanges).toBe(1);
  });

  it("remembers why the server closed the socket", () => {
    expect(liveReducer(initialLive, { kind: "closed", code: 4403 }).closedBy).toBe("kicked");
    expect(liveReducer(initialLive, { kind: "closed", code: 4404 }).closedBy).toBe("no_access");
    expect(liveReducer(initialLive, { kind: "closed", code: 1006 }).closedBy).toBeNull();
  });
});
