"use client";

// The page's one error reporter (reporter.ts) wired to the real API and browser.
// ClientErrorReporter (app/layout.tsx) listens for window errors and unhandled rejections;
// the error boundaries (app/error.tsx, app/global-error.tsx) call reportClientError.
import { useEffect } from "react";

import { createFeedbackApi } from "./api";
import { createErrorReporter, describeError, pageOf, type ErrorReporter } from "./reporter";

let reporter: ErrorReporter | null = null;

function errorReporter(): ErrorReporter {
  if (!reporter) {
    const api = createFeedbackApi();
    reporter = createErrorReporter({
      send: api.reportError,
      hasCsrf: api.hasCsrf,
      fetchCsrf: api.fetchCsrf,
      now: Date.now,
      page: () => pageOf(window.location),
      userAgent: navigator.userAgent,
      // set at build time (web/Dockerfile, from APP_VERSION); empty in development
      release: process.env.NEXT_PUBLIC_RELEASE ?? "",
      // vitest sets NODE_ENV=test, Playwright sets navigator.webdriver: tests send nothing
      enabled: process.env.NODE_ENV !== "test" && !navigator.webdriver,
    });
  }
  return reporter;
}

/** Report something thrown; never throws itself. */
export function reportClientError(error: unknown) {
  try {
    errorReporter().report(describeError(error));
  } catch {
    // nothing: reporting must not fail the page
  }
}

export function ClientErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => reportClientError(event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => reportClientError(event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
