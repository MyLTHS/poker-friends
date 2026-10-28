import { describe, expect, it } from "vitest";

import { errorText, googleResult, invalidText, type GoogleError } from "./messages";

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
      "login_required",
      "guests_disabled",
    ] as const) {
      expect(errorText({ code })).not.toBe("");
    }
  });

  it("explains the room errors (B7)", () => {
    for (const code of ["kicked", "negative_balance", "room_closed", "player_in_hand", "not_seated", "room_not_found"] as const) {
      expect(errorText({ code })).not.toBe("Có lỗi xảy ra, thử lại sau.");
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

describe("invalidText", () => {
  const input = (validity: Partial<ValidityState>, extra: Partial<HTMLInputElement> = {}) =>
    ({ validity: validity as ValidityState, type: "text", minLength: -1, maxLength: -1, title: "", validationMessage: "Browser text", ...extra }) as HTMLInputElement;

  it("says in Vietnamese what the browser's own checks found", () => {
    expect(invalidText(input({ valueMissing: true }))).toBe("Chưa điền ô này.");
    expect(invalidText(input({ typeMismatch: true }, { type: "email" }))).toContain("Email chưa đúng dạng");
    expect(invalidText(input({ tooShort: true }, { minLength: 2 }))).toBe("Cần ít nhất 2 ký tự.");
    expect(invalidText(input({ tooLong: true }, { maxLength: 30 }))).toBe("Tối đa 30 ký tự.");
    expect(invalidText(input({ patternMismatch: true }, { title: "Không dấu cách." }))).toBe("Không dấu cách.");
  });

  it("falls back to the box's validationMessage (setCustomValidity, or the browser's own)", () => {
    expect(invalidText(input({ customError: true }, { validationMessage: "Hai mật khẩu chưa khớp" }))).toBe("Hai mật khẩu chưa khớp");
    expect(invalidText(input({ patternMismatch: true }))).toBe("Browser text");
  });
});
