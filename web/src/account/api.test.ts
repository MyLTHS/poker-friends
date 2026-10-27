import { describe, expect, it, vi } from "vitest";

import { createAuthApi, readCookie } from "./api";

function fakeFetch(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return vi.fn(async () =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    }),
  );
}

const ME = {
  id: 7,
  username: "khach-a1b2c3",
  email: null,
  is_guest: true,
  email_verified: false,
  has_password: false,
  google_connected: false,
};

describe("readCookie", () => {
  it("finds a cookie among others", () => {
    expect(readCookie("a=1; csrftoken=abc; b=2", "csrftoken")).toBe("abc");
  });

  it("returns null when missing", () => {
    expect(readCookie("a=1", "csrftoken")).toBeNull();
    expect(readCookie("", "csrftoken")).toBeNull();
  });

  it("does not match a cookie that only ends with the name", () => {
    expect(readCookie("xcsrftoken=bad", "csrftoken")).toBeNull();
  });
});

describe("createAuthApi", () => {
  it("sends JSON with the CSRF token read at call time", async () => {
    const fetch = fakeFetch(200, ME);
    let cookie = "csrftoken=first";
    const api = createAuthApi(fetch, () => cookie);
    cookie = "csrftoken=rotated";

    const result = await api.login({ email: "an@example.com", password: "pw" });

    expect(result).toEqual({ ok: true, data: ME });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/login/");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(new Headers(init.headers).get("X-CSRFToken")).toBe("rotated");
    expect(JSON.parse(init.body as string)).toEqual({ email: "an@example.com", password: "pw" });
  });

  it("GET requests carry no body", async () => {
    const fetch = fakeFetch(200, { google_enabled: false });
    const result = await createAuthApi(fetch, () => "").config();
    expect(result).toEqual({ ok: true, data: { google_enabled: false } });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("empty answers (202, 204) succeed with no data", async () => {
    const api = createAuthApi(fakeFetch(204), () => "");
    expect(await api.logout()).toEqual({ ok: true, data: undefined });
  });

  it("passes the server's ApiError through", async () => {
    const error = { code: "email_taken", message: "This email belongs to another account." };
    const api = createAuthApi(fakeFetch(409, error), () => "");
    expect(await api.upgrade({ email: "an@example.com", password: "x" })).toEqual({ ok: false, error });
  });

  it("reads Retry-After on rate_limited", async () => {
    const api = createAuthApi(
      fakeFetch(429, { code: "rate_limited", message: "Too many" }, { "Retry-After": "120" }),
      () => "",
    );
    const result = await api.login({ email: "an@example.com", password: "x" });
    expect(result).toEqual({ ok: false, error: { code: "rate_limited", message: "Too many" }, retryAfter: 120 });
  });

  it("turns a network failure or a non-JSON error into network_error", async () => {
    const offline = createAuthApi(
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
      () => "",
    );
    expect(await offline.me()).toMatchObject({ ok: false, error: { code: "network_error" } });

    const html = createAuthApi(
      vi.fn(async () => new Response("<h1>Server Error</h1>", { status: 500 })),
      () => "",
    );
    expect(await html.me()).toMatchObject({ ok: false, error: { code: "network_error" } });
  });
});
