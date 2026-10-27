import { describe, expect, it } from "vitest";

import { errorText, googleResult, type GoogleError } from "./messages";

describe("errorText", () => {
  it("has a Vietnamese sentence for every account error", () => {
    for (const code of [
      "invalid_credentials",
      "email_not_verified",
      "email_taken",
      "username_taken",
      "invalid_token",
      "not_guest",
      "not_authenticated",
      "forbidden",
      "validation_error",
      "network_error",
    ] as const) {
      expect(errorText({ code })).not.toBe("");
    }
  });

  it("says when to retry after a rate limit", () => {
    expect(errorText({ code: "rate_limited" }, 90)).toContain("2 phút");
    expect(errorText({ code: "rate_limited" }, 30)).toContain("1 phút");
  });
});

describe("googleResult", () => {
  it("reads the Google outcome from the page URL", () => {
    expect(googleResult(new URLSearchParams("google=ok"))).toEqual({ kind: "ok", text: expect.any(String) });
    expect(googleResult(new URLSearchParams("error=email_taken"))?.kind).toBe("error");
    expect(googleResult(new URLSearchParams("error=social_account_taken"))?.text).toContain("Google");
    expect(googleResult(new URLSearchParams("error=something_new"))?.kind).toBe("error");
    expect(googleResult(new URLSearchParams(""))).toBeNull();
  });

  it("explains every Google error code in Google's terms", () => {
    const codes: GoogleError[] = [
      "google_disabled",
      "google_failed",
      "email_taken",
      "email_not_verified",
      "social_account_taken",
      "not_guest",
      "account_inactive",
    ];
    const texts = codes.map((code) => googleResult(new URLSearchParams({ error: code }))?.text ?? "");
    expect(new Set(texts).size).toBe(codes.length);
    // Not the email/password wording ("open the email and click the link").
    expect(googleResult(new URLSearchParams("error=email_not_verified"))?.text).toContain("Google");
  });
});
