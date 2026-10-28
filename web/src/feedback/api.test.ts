import { describe, expect, it, vi } from "vitest";

import { createFeedbackApi, hasCsrfCookie, roomIdFromPath } from "./api";

describe("roomIdFromPath", () => {
  it("finds the room of every room page", () => {
    expect(roomIdFromPath("/rooms/12")).toBe(12);
    expect(roomIdFromPath("/rooms/12/table")).toBe(12);
    expect(roomIdFromPath("/rooms/7/history")).toBe(7);
  });

  it("is null elsewhere", () => {
    expect(roomIdFromPath("/rooms")).toBeNull();
    expect(roomIdFromPath("/rooms/new")).toBeNull();
    expect(roomIdFromPath("/rooms/join")).toBeNull();
    expect(roomIdFromPath("/account")).toBeNull();
    expect(roomIdFromPath("/hands/4")).toBeNull();
  });
});

describe("createFeedbackApi", () => {
  it("asks for the csrftoken cookie before the first POST, then sends", async () => {
    let cookies = "";
    const request = vi.fn(async (method: string, url: string) => {
      if (url === "/api/auth/config/") cookies = "csrftoken=abc";
      return { ok: true as const, data: method === "POST" ? { feedback_id: 1 } : {} };
    });
    const api = createFeedbackApi(request as never, () => cookies);
    expect(api.hasCsrf()).toBe(false);
    await api.send({ kind: "bug", message: "Nút call không ăn." });
    expect(request.mock.calls.map(([method, url]) => `${method} ${url}`)).toEqual(["GET /api/auth/config/", "POST /api/feedback/"]);
    await api.send({ kind: "idea", message: "Thêm âm thanh." });
    expect(request).toHaveBeenCalledTimes(3); // the cookie is there now: no second config
    expect(hasCsrfCookie(() => cookies)).toBe(true);
  });
});
