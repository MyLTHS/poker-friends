import { describe, expect, it } from "vitest";

import { looksCommon, passwordLevel, passwordProblem, passwordRules, similarTo } from "./password";

const LYM = { username: "Lym", email: "lym.nguyen@gmail.com" };

describe("passwordLevel", () => {
  it("is weak when short or empty", () => {
    expect(passwordLevel("", LYM)).toBe(1);
    expect(passwordLevel("abc", LYM)).toBe(1);
  });

  it("never rates an all-digit password above weak (the server refuses it)", () => {
    expect(passwordLevel("1234567890123", LYM)).toBe(1);
  });

  it("rises with length, letters with digits, and symbols or mixed case", () => {
    expect(passwordLevel("banxanhq", LYM)).toBe(1);
    expect(passwordLevel("banxanh7", LYM)).toBe(2);
    expect(passwordLevel("banxanhgocq7", LYM)).toBe(3);
    expect(passwordLevel("banxanhgocq7!", LYM)).toBe(4);
    expect(passwordLevel("Banxanhgocq7", LYM)).toBe(4);
  });

  it("counts Vietnamese letters as letters", () => {
    expect(passwordLevel("mậtbàn12", LYM)).toBe(2);
  });

  it("rates a password the server refuses as weak, however long and mixed", () => {
    expect(passwordLevel("Password1234", LYM)).toBe(1); // common
    expect(passwordLevel("Nguyen2026!", LYM)).toBe(1); // like the email
  });

  it("is never very strong while the name and email are unknown (the server compares them)", () => {
    expect(passwordLevel("banxanhgocq7!")).toBe(3);
    expect(passwordLevel("banxanhgocq7!", { username: "", email: "" })).toBe(3);
  });
});

describe("looksCommon", () => {
  it("sees the usual passwords, with digits or symbols around them and letters swapped", () => {
    for (const password of ["password", "Password1234", "P@ssw0rd!", "matkhau123", "qwerty2024", "iloveyou", "anhyeuem99"]) {
      expect(looksCommon(password), password).toBe(true);
    }
  });

  it("sees runs and repeats", () => {
    for (const password of ["abcdefgh", "12345678", "87654321", "aaaaaaaa", "qwertyuiop", "abcdefg1"]) {
      expect(looksCommon(password), password).toBe(true);
    }
  });

  it("leaves a made-up phrase alone", () => {
    expect(looksCommon("ban-ni-xanh-2026")).toBe(false);
    expect(looksCommon("go-mat-khau-moi-77")).toBe(false);
  });
});

describe("similarTo", () => {
  it("works like Django's UserAttributeSimilarityValidator (quick_ratio ≥ 0.7 on the name, the email and their parts)", () => {
    expect(similarTo("lymnguyen1", LYM)).toBe(true); // the email's "lym.nguyen"
    expect(similarTo("nguyenlym", LYM)).toBe(true); // letters in another order count too
    expect(similarTo("gmail.com", LYM)).toBe(true);
    expect(similarTo("ban-ni-xanh-2026", LYM)).toBe(false);
  });
});

describe("passwordRules", () => {
  it("lists the three rules the server checks and one optional tip", () => {
    expect(passwordRules("", LYM)).toEqual([
      { text: "8 ký tự trở lên", ok: false },
      { text: "Không chỉ toàn chữ số", ok: false },
      { text: "Không phổ biến, không giống tên hay email", ok: false },
      { text: "Thêm ký tự đặc biệt để mạnh hơn", ok: false, optional: true },
    ]);
  });

  it("ticks what the password already does", () => {
    expect(passwordRules("bàn-nỉ-xanh", LYM).map((r) => r.ok)).toEqual([true, true, true, true]);
    expect(passwordRules("12345678", LYM).map((r) => r.ok)).toEqual([true, false, false, false]);
    expect(passwordRules("lymnguyen!", LYM).map((r) => r.ok)).toEqual([true, true, false, true]);
  });
});

describe("passwordProblem", () => {
  it("names the first reason the server will refuse it", () => {
    expect(passwordProblem("abc", LYM)).toBe("cần 8 ký tự trở lên");
    expect(passwordProblem("1234567890", LYM)).toBe("không được chỉ toàn chữ số");
    expect(passwordProblem("Password1234", LYM)).toBe("quá phổ biến, dễ đoán");
    expect(passwordProblem("Nguyen2026!", LYM)).toBe("giống tên hoặc email");
    expect(passwordProblem("ban-ni-xanh-2026", LYM)).toBeNull();
  });
});
