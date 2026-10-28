// Feedback and browser errors (docs/api/openapi.yaml, tag feedback): POST only, the staff read
// them in the Django admin (docs/runbook.md "Sau buổi chơi"). Same-origin requests through the
// account client, which sends the CSRF token; a first visit has no csrftoken cookie yet, so
// `withCsrf` asks /api/auth/config/ for one before the POST.

import type { components } from "@/api/rest";
import { makeRequest, readCookie, type Result } from "@/account/api";

type Schemas = components["schemas"];
export type FeedbackRequest = Schemas["FeedbackRequest"];
export type FeedbackKind = FeedbackRequest["kind"];
export type ClientErrorReport = Schemas["ClientErrorReport"];

/** The server's limit on a feedback message (after trimming). */
export const MESSAGE_MAX = 2000;

export const KINDS: { value: FeedbackKind; label: string }[] = [
  { value: "bug", label: "Lỗi" },
  { value: "idea", label: "Ý tưởng" },
  { value: "other", label: "Khác" },
];

export const hasCsrfCookie = (cookies: () => string = () => document.cookie) => Boolean(readCookie(cookies(), "csrftoken"));

/** The room of the page, from its path: /rooms/12, /rooms/12/table, /rooms/12/history … */
export function roomIdFromPath(path: string): number | null {
  const match = /^\/rooms\/(\d+)(?:\/|$)/.exec(path);
  return match ? Number(match[1]) : null;
}

export function createFeedbackApi(request = makeRequest(), cookies?: () => string) {
  const withCsrf = async <T>(send: () => Promise<Result<T>>): Promise<Result<T>> => {
    if (!hasCsrfCookie(cookies)) await request("GET", "/api/auth/config/");
    return send();
  };
  return {
    hasCsrf: () => hasCsrfCookie(cookies),
    fetchCsrf: () => request("GET", "/api/auth/config/"),
    send: (body: FeedbackRequest) => withCsrf(() => request<Schemas["FeedbackCreated"]>("POST", "/api/feedback/", body)),
    /** 204 on success: no body */
    reportError: (body: ClientErrorReport) => request<undefined>("POST", "/api/client-errors/", body),
    createGuest: () => withCsrf(() => request<Schemas["Me"]>("POST", "/api/auth/guest/", {})),
  };
}

export type FeedbackApi = ReturnType<typeof createFeedbackApi>;
