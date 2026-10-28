// Browser errors to POST /api/client-errors/ (window errors, unhandled rejections, the React error
// boundaries in app/error.tsx and app/global-error.tsx). Built so it can never make things worse:
// at most MAX_PER_MINUTE a minute, each error once per page load, nothing while tests run, every
// step inside try/catch, and its own failures are swallowed, never reported again.
// The server cuts and scrubs too (apps/feedback); the page is sent without its query string, where
// reset and invite links carry their token.

import type { ClientErrorReport } from "./api";

export const MAX_PER_MINUTE = 5;
/** Reports kept while the csrftoken cookie is being fetched (the POST would be a 403 without it). */
export const MAX_WAITING = 3;
const MESSAGE_MAX = 1000;
const STACK_MAX = 8000;
// Errors no one here can fix: cross-origin scripts without details, a harmless layout warning,
// browser extensions.
const NOISE = /^Script error\.?$|ResizeObserver loop/;
const FOREIGN = /(chrome|moz|safari)-extension:\/\//;

export type ErrorInfo = { message: string; stack?: string };

/** The page a report or feedback names: the path only. Reset, verify and invite links carry their
 * token in the query string, so it never leaves the browser. */
export function pageOf(location: { pathname: string }): string {
  return location.pathname;
}

export type ReporterDeps = {
  send: (report: ClientErrorReport) => Promise<unknown>;
  hasCsrf: () => boolean;
  fetchCsrf: () => Promise<unknown>;
  now: () => number;
  page: () => string;
  userAgent: string;
  release: string;
  /** false under vitest or Playwright: tests never send anything */
  enabled: boolean;
};

export function createErrorReporter(deps: ReporterDeps) {
  const seen = new Set<string>();
  let recent: number[] = [];
  let waiting: ClientErrorReport[] = [];
  let fetching = false;

  const post = (report: ClientErrorReport) => {
    void deps.send(report).catch(() => {}); // a failed report is dropped, never reported
  };

  const flush = () => {
    if (!deps.hasCsrf()) return;
    const all = waiting;
    waiting = [];
    all.forEach(post);
  };

  const askForCsrf = () => {
    if (fetching) return;
    fetching = true;
    void deps
      .fetchCsrf()
      .catch(() => {})
      .then(() => {
        fetching = false;
        flush();
      });
  };

  function report({ message, stack }: ErrorInfo) {
    if (!deps.enabled) return;
    try {
      const text = String(message || "Unknown error").slice(0, MESSAGE_MAX);
      if (NOISE.test(text) || (stack && FOREIGN.test(stack))) return;
      const page = deps.page();
      const key = `${text}\n${page}`;
      if (seen.has(key)) return;
      const now = deps.now();
      recent = recent.filter((t) => t > now - 60_000);
      if (recent.length >= MAX_PER_MINUTE) return;
      const body: ClientErrorReport = { message: text, page, user_agent: deps.userAgent, release: deps.release };
      if (stack) body.stack = stack.slice(0, STACK_MAX);
      if (deps.hasCsrf()) post(body);
      else {
        // Ask again each time: a first fetch that failed (offline, a blip) must not silence the
        // rest of the page. Reports past MAX_WAITING are dropped while the cookie is missing.
        askForCsrf();
        if (waiting.length >= MAX_WAITING) return;
        waiting.push(body);
      }
      seen.add(key);
      recent.push(now);
    } catch {
      // never let the reporter itself throw from an error handler
    }
  }

  return { report };
}

export type ErrorReporter = ReturnType<typeof createErrorReporter>;

/** A message and stack from anything thrown or rejected. */
export function describeError(error: unknown): ErrorInfo {
  if (error instanceof Error) {
    const digest = (error as Error & { digest?: string }).digest;
    const message = `${error.name}: ${error.message}${digest ? ` (digest ${digest})` : ""}`;
    return error.stack ? { message, stack: error.stack } : { message };
  }
  if (typeof error === "string") return { message: error };
  try {
    const json = JSON.stringify(error);
    return { message: json ?? String(error) };
  } catch {
    return { message: String(error) };
  }
}
