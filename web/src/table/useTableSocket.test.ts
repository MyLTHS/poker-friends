import { describe, expect, it } from "vitest";

import { afterClose, closeKind } from "./useTableSocket";

describe("closeKind", () => {
  it("reads members-only (4401) as the account's business, not the network's", () => {
    expect(closeKind(4401)).toBe("auth");
  });

  it("reads a kick, no access or too many guests as final", () => {
    for (const code of [4403, 4404, 4429]) expect(closeKind(code)).toBe("final");
  });

  it("reads a dropped connection or a server restart as worth retrying", () => {
    for (const code of [1000, 1001, 1006, 1011, 1012]) expect(closeKind(code)).toBe("retry");
  });
});

// afterClose is what the hook's onclose runs: it sets a reconnect timer only for `retryIn`.
describe("afterClose", () => {
  it("schedules no reconnect after a members-only close (4401), whatever the attempt", () => {
    for (let attempt = 0; attempt < 8; attempt++) expect(afterClose(4401, attempt)).toEqual({ stop: "auth" });
  });

  it("schedules none after a kick, no access or too many guests either", () => {
    for (const code of [4403, 4404, 4429]) expect(afterClose(code, 0)).toEqual({ stop: "final" });
  });

  it("schedules a reconnect after a lost connection, waiting longer each time", () => {
    const first = afterClose(1006, 0);
    const later = afterClose(1006, 5);
    expect(first).toMatchObject({ attempt: 1 });
    expect("retryIn" in first && "retryIn" in later && later.retryIn >= first.retryIn && first.retryIn > 0).toBe(true);
  });
});
