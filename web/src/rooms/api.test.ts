import { describe, expect, it, vi } from "vitest";

import { createRoomsApi, inviteUrl } from "./api";

function fakeFetch(status: number, body?: unknown) {
  return vi.fn(async () =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function lastCall(fetch: ReturnType<typeof fakeFetch>) {
  const [url, init] = fetch.mock.calls.at(-1) as unknown as [string, RequestInit];
  return { url, method: init.method, body: init.body ? JSON.parse(init.body as string) : undefined, init };
}

describe("createRoomsApi", () => {
  it("calls every room endpoint with the right method, URL and body", async () => {
    const fetch = fakeFetch(200, {});
    const api = createRoomsApi(fetch, () => "csrftoken=t");
    const calls: [() => Promise<unknown>, string, string, unknown][] = [
      [() => api.lobby(), "GET", "/api/rooms/", undefined],
      [() => api.create({ name: "Bàn", small_blind: 1, big_blind: 2 }), "POST", "/api/rooms/", { name: "Bàn", small_blind: 1, big_blind: 2 }],
      [() => api.get(7), "GET", "/api/rooms/7/", undefined],
      [() => api.update(7, { big_blind: 4 }), "PATCH", "/api/rooms/7/", { big_blind: 4 }],
      [() => api.join("abc"), "POST", "/api/rooms/join/", { invite_token: "abc" }],
      [() => api.grantChips(7, { player_id: "3", amount: 50 }), "POST", "/api/rooms/7/chips/", { player_id: "3", amount: 50 }],
      [() => api.rebuy(7), "POST", "/api/rooms/7/rebuy/", undefined],
      [() => api.kick(7, "3"), "POST", "/api/rooms/7/kick/", { player_id: "3" }],
      [() => api.close(7), "POST", "/api/rooms/7/close/", undefined],
      [() => api.rotateInvite(7), "POST", "/api/rooms/7/invite/", undefined],
      [() => api.snapshot(7), "GET", "/api/rooms/7/snapshot/", undefined],
      [() => api.takeSeat(7, 4), "POST", "/api/rooms/7/seats/", { seat: 4 }],
      [() => api.leaveSeat(7), "DELETE", "/api/rooms/7/seats/me/", undefined],
      [() => api.chat(7), "GET", "/api/rooms/7/chat/", undefined],
      [() => api.hands(7), "GET", "/api/rooms/7/hands/", undefined],
      [() => api.summary(7), "GET", "/api/rooms/7/summary/", undefined],
      [() => api.replay(41), "GET", "/api/hands/41/replay/", undefined],
    ];
    for (const [call, method, url, body] of calls) {
      await call();
      expect(lastCall(fetch)).toMatchObject({ method, url, body });
    }
  });

  it("sends the CSRF token on PATCH and DELETE too", async () => {
    const fetch = fakeFetch(204);
    const api = createRoomsApi(fetch, () => "csrftoken=tok");
    await api.update(1, { name: "x" });
    expect(new Headers(lastCall(fetch).init.headers).get("X-CSRFToken")).toBe("tok");
    await api.leaveSeat(1);
    expect(new Headers(lastCall(fetch).init.headers).get("X-CSRFToken")).toBe("tok");
  });

  it("passes room errors through", async () => {
    const api = createRoomsApi(fakeFetch(403, { code: "kicked", message: "x" }), () => "");
    expect(await api.join("t")).toEqual({ ok: false, error: { code: "kicked", message: "x" } });
  });
});

describe("roomSocketUrl", () => {
  it("points at Django's WebSocket for the room", async () => {
    const { roomSocketUrl } = await import("./api");
    expect(roomSocketUrl("ws://localhost:8000", 7)).toBe("ws://localhost:8000/ws/rooms/7/");
  });

  it("uses the page's own address when no base is set (behind Caddy or a tunnel)", async () => {
    const { roomSocketUrl } = await import("./api");
    const https = { protocol: "https:", host: "abc.trycloudflare.com" };
    expect(roomSocketUrl("", 3, https)).toBe("wss://abc.trycloudflare.com/ws/rooms/3/");
    expect(roomSocketUrl("", 3, { protocol: "http:", host: "localhost:8080" })).toBe(
      "ws://localhost:8080/ws/rooms/3/",
    );
  });
});

describe("inviteUrl", () => {
  it("builds the link the owner shares", () => {
    expect(inviteUrl("http://localhost:3000", "a-b_c")).toBe("http://localhost:3000/rooms/join?token=a-b_c");
  });
});

describe("members only", () => {
  it("hands a stranger or an old guest (401 login_required) to one place: the login", async () => {
    const blocked = vi.fn();
    const api = createRoomsApi(fakeFetch(401, { code: "login_required", message: "x" }), () => "", blocked);
    const result = await api.lobby();
    expect(result.ok).toBe(false); // the screen still gets the error
    expect(blocked).toHaveBeenCalledTimes(1);
    await api.snapshot(3);
    expect(blocked).toHaveBeenCalledTimes(2);
  });

  it("leaves every other refusal to the screen", async () => {
    const blocked = vi.fn();
    for (const [status, code] of [
      [403, "forbidden"],
      [404, "room_not_found"],
      [403, "kicked"],
      [401, "not_authenticated"],
    ] as const) {
      await createRoomsApi(fakeFetch(status, { code, message: "x" }), () => "", blocked).lobby();
    }
    await createRoomsApi(fakeFetch(200, {}), () => "", blocked).lobby();
    expect(blocked).not.toHaveBeenCalled();
  });
});
