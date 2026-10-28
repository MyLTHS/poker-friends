import { describe, expect, it } from "vitest";

import { passwordLevel, passwordRules } from "./password";

describe("passwordLevel", () => {
  it("is weak when short or empty", () => {
    expect(passwordLevel("")).toBe(1);
    expect(passwordLevel("abc")).toBe(1);
  });

  it("never rates an all-digit password above weak (the server refuses it)", () => {
    expect(passwordLevel("1234567890123")).toBe(1);
  });

  it("rises with length, letters with digits, and symbols or mixed case", () => {
    expect(passwordLevel("abcdefgh")).toBe(1);
    expect(passwordLevel("abcdefg1")).toBe(2);
    expect(passwordLevel("abcdefghijk1")).toBe(3);
    expect(passwordLevel("abcdefghijk1!")).toBe(4);
    expect(passwordLevel("Abcdefghijk1")).toBe(4);
  });

  it("counts Vietnamese letters as letters", () => {
    expect(passwordLevel("mậtkhẩu12")).toBe(2);
  });
});

describe("passwordRules", () => {
  it("lists the two rules the server checks and one optional tip", () => {
    expect(passwordRules("")).toEqual([
      { text: "8 ký tự trở lên", ok: false },
      { text: "Không chỉ toàn chữ số", ok: false },
      { text: "Thêm ký tự đặc biệt để mạnh hơn", ok: false, optional: true },
    ]);
  });

  it("ticks what the password already does", () => {
    const rules = passwordRules("bàn-nỉ-xanh");
    expect(rules.map((r) => r.ok)).toEqual([true, true, true]);
    expect(passwordRules("12345678").map((r) => r.ok)).toEqual([true, false, false]);
  });
});
