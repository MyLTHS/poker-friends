import { describe, expect, it } from "vitest";

import { authBlock, blockFromMe, loginPath, rememberNext, safeNext, signupPath, takeRememberedNext } from "./members";

describe("safeNext", () => {
  it("keeps a path of this site, with its query (an invite token)", () => {
    expect(safeNext("/rooms")).toBe("/rooms");
    expect(safeNext("/rooms/join?token=abc-123")).toBe("/rooms/join?token=abc-123");
    expect(safeNext("/rooms/4/table#chat")).toBe("/rooms/4/table#chat");
  });

  it("refuses anything that could leave the site or is not a path", () => {
    for (const bad of [
      null,
      "",
      "rooms",
      "//evil.example/x",
      "/\\evil.example",
      "\\\\evil.example",
      "https://evil.example/",
      "javascript:alert(1)",
      "/\t/evil.example",
      " /rooms",
      "/rooms\n/x",
    ]) {
      expect(safeNext(bad), String(bad)).toBeNull();
    }
  });

  it("never sends back to the account pages (that would be a loop)", () => {
    expect(safeNext("/account")).toBeNull();
    expect(safeNext("/account/signup?next=/rooms")).toBeNull();
  });
});

describe("loginPath / signupPath", () => {
  it("carries a safe next, encoded", () => {
    expect(loginPath("/rooms/join?token=a&b")).toBe("/account?next=%2Frooms%2Fjoin%3Ftoken%3Da%26b");
    expect(signupPath("/rooms")).toBe("/account/signup?next=%2Frooms");
  });

  it("drops an unsafe one", () => {
    expect(loginPath("//evil.example")).toBe("/account");
    expect(signupPath(null)).toBe("/account/signup");
  });
});

describe("authBlock", () => {
  it("reads the members-only answers of the API", () => {
    expect(authBlock("login_required")).toBe("login");
    expect(authBlock("not_approved")).toBe("approval");
  });

  it("leaves every other error to the screen", () => {
    for (const code of ["not_authenticated", "forbidden", "room_not_found", "kicked", "network_error", "rate_limited"]) {
      expect(authBlock(code)).toBeNull();
    }
  });
});

describe("blockFromMe", () => {
  const me = { is_guest: false, member: false };
  it("asks a logged-in account the owner has not approved to wait, never to log in again", () => {
    expect(blockFromMe({ ok: true, data: me })).toBe("approval");
  });

  it("sends a stranger, a guest or a broken answer to the login", () => {
    expect(blockFromMe({ ok: false })).toBe("login");
    expect(blockFromMe({ ok: true, data: { is_guest: true, member: false } })).toBe("login");
    expect(blockFromMe({ ok: true, data: { is_guest: false, member: true } })).toBe("login"); // refused anyway: log in again
  });
});

describe("rememberNext / takeRememberedNext", () => {
  const storage = () => {
    const items = new Map<string, string>();
    return {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
      removeItem: (k: string) => void items.delete(k),
    };
  };

  it("keeps an invite link through signup, email and approval, and gives it back once", () => {
    const s = storage();
    rememberNext("/rooms/join?token=abc", s, 1000);
    expect(takeRememberedNext(s, 2000)).toBe("/rooms/join?token=abc");
    expect(takeRememberedNext(s, 2000)).toBeNull();
  });

  it("forgets after a week, and never keeps an unsafe path", () => {
    const s = storage();
    rememberNext("/rooms/7", s, 0);
    expect(takeRememberedNext(s, 8 * 24 * 3600 * 1000)).toBeNull();
    rememberNext("//evil.example", s, 0);
    expect(takeRememberedNext(s, 1)).toBeNull();
  });

  it("survives a storage that throws (private window)", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => rememberNext("/rooms", broken, 0)).not.toThrow();
    expect(takeRememberedNext(broken, 0)).toBeNull();
  });
});
