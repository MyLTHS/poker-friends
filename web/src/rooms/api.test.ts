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
      [() => api.kick(7, "3"), "POST", "/api/rooms/7/kick/", { player_id: "3" }],
      [() => api.close(7), "POST", "/api/rooms/7/close/", undefined],
      [() => api.rotateInvite(7), "POST", "/api/rooms/7/invite/", undefined],
      [() => api.snapshot(7), "GET", "/api/rooms/7/snapshot/", undefined],
      [() => api.takeSeat(7, 4), "POST", "/api/rooms/7/seats/", { seat: 4 }],
      [() => api.leaveSeat(7), "DELETE", "/api/rooms/7/seats/me/", undefined],
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

describe("inviteUrl", () => {
  it("builds the link the owner shares", () => {
    expect(inviteUrl("http://localhost:3000", "a-b_c")).toBe("http://localhost:3000/rooms/join?token=a-b_c");
  });
});
