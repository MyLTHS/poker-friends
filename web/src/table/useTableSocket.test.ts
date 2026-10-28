import { describe, expect, it } from "vitest";

import { closeKind } from "./useTableSocket";

describe("closeKind", () => {
  it("never retries members-only (4401): the account decides between login and waiting", () => {
    expect(closeKind(4401)).toBe("auth");
  });

  it("never retries a kick, no access or too many guests", () => {
    for (const code of [4403, 4404, 4429]) expect(closeKind(code)).toBe("final");
  });

  it("retries a dropped connection or a server restart", () => {
    for (const code of [1000, 1001, 1006, 1011, 1012]) expect(closeKind(code)).toBe("retry");
  });
});
