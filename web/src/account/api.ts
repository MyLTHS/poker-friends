// Client for /api/auth/ (docs/api/openapi.yaml, tag auth). Types come from the generated
// src/api/rest.ts. Requests are same-origin: next.config.ts proxies /api and /accounts to Django,
// so the session and csrftoken cookies just work.

import type { components } from "@/api/rest";

type Schemas = components["schemas"];
export type Me = Schemas["Me"];
export type AuthConfig = Schemas["AuthConfig"];
export type ClientError =
  | Schemas["ApiError"]
  | { code: "network_error"; message: string; fields?: undefined };
export type Result<T> = { ok: true; data: T } | { ok: false; error: ClientError; retryAfter?: number };

export function readCookie(cookies: string, name: string): string | null {
  for (const part of cookies.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export function csrfTokenFrom(cookies: () => string): string {
  return readCookie(cookies(), "csrftoken") ?? "";
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

/** One JSON request to the Django API, with the CSRF token on every non-GET. */
export function makeRequest(
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  cookies: () => string = () => document.cookie,
) {
  return async function request<T>(method: Method, url: string, body?: unknown): Promise<Result<T>> {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method,
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          ...(method !== "GET" ? { "Content-Type": "application/json", "X-CSRFToken": csrfTokenFrom(cookies) } : {}),
        },
        body: method !== "GET" && body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      return { ok: false, error: { code: "network_error", message: "Request failed" } };
    }
    const text = await response.text();
    let data: unknown = undefined;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = undefined;
    }
    if (response.ok) return { ok: true, data: data as T };
    if (!data || typeof data !== "object" || !("code" in data)) {
      return { ok: false, error: { code: "network_error", message: `HTTP ${response.status}` } };
    }
    const retry = Number(response.headers.get("Retry-After"));
    return {
      ok: false,
      error: data as ClientError,
      ...(response.status === 429 && retry > 0 ? { retryAfter: retry } : {}),
    };
  };
}

export function createAuthApi(
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  cookies: () => string = () => document.cookie,
) {
  const request = makeRequest(fetchImpl, cookies);
  const call = <T>(method: "GET" | "POST", path: string, body?: unknown) =>
    request<T>(method, `/api/auth/${path}`, body);

  return {
    config: () => call<AuthConfig>("GET", "config/"),
    me: () => call<Me>("GET", "me/"),
    signup: (body: Schemas["SignupRequest"]) => call<Me>("POST", "signup/", body),
    verifyEmail: (body: Schemas["TokenRequest"]) => call<Me>("POST", "verify-email/", body),
    resendVerification: (body: Schemas["EmailRequest"]) => call<void>("POST", "verify-email/resend/", body),
    login: (body: Schemas["LoginRequest"]) => call<Me>("POST", "login/", body),
    logout: () => call<void>("POST", "logout/"),
    forgotPassword: (body: Schemas["EmailRequest"]) => call<void>("POST", "password/forgot/", body),
    resetPassword: (body: Schemas["ResetPasswordRequest"]) => call<void>("POST", "password/reset/", body),
    createGuest: (body: Schemas["GuestRequest"] = {}) => call<Me>("POST", "guest/", body),
    upgrade: (body: Schemas["UpgradeRequest"]) => call<Me>("POST", "upgrade/", body),
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
