import { describe, expect, it, vi } from "vitest";

import type { ClientErrorReport } from "./api";
import { MAX_PER_MINUTE, MAX_WAITING, createErrorReporter, describeError, pageOf, type ReporterDeps } from "./reporter";

function setup(over: Partial<ReporterDeps> = {}) {
  const sent: ClientErrorReport[] = [];
  let now = 1_000_000;
  let csrf = true;
  const deps: ReporterDeps = {
    send: async (report) => {
      sent.push(report);
    },
    hasCsrf: () => csrf,
    fetchCsrf: async () => {
      await Promise.resolve(); // the cookie arrives with the response, not at once
      csrf = true;
    },
    now: () => now,
    page: () => "/rooms/3/table",
    userAgent: "Mozilla/5.0 (test)",
    release: "v1.2.3",
    enabled: true,
    ...over,
  };
  const reporter = createErrorReporter(deps);
  return {
    reporter,
    sent,
    tick: (ms: number) => {
      now += ms;
    },
    noCsrf: () => {
      csrf = false;
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createErrorReporter", () => {
  it("sends what the server stores: message, stack, page, browser, release", async () => {
    const { reporter, sent } = setup();
    reporter.report({ message: "TypeError: hand is null", stack: "at Seat (Seat.tsx:4)" });
    await settle();
    expect(sent).toEqual([
      { message: "TypeError: hand is null", stack: "at Seat (Seat.tsx:4)", page: "/rooms/3/table", user_agent: "Mozilla/5.0 (test)", release: "v1.2.3" },
    ]);
  });

  it("sends the same error on the same page once per session", async () => {
    const { reporter, sent, tick } = setup();
    for (let i = 0; i < 4; i++) {
      reporter.report({ message: "boom" });
      tick(61_000);
    }
    await settle();
    expect(sent).toHaveLength(1);
  });

  it(`sends at most ${MAX_PER_MINUTE} errors a minute and drops the rest`, async () => {
    const { reporter, sent, tick } = setup();
    for (let i = 0; i < MAX_PER_MINUTE + 3; i++) reporter.report({ message: `e${i}` });
    await settle();
    expect(sent).toHaveLength(MAX_PER_MINUTE);
    tick(60_001);
    reporter.report({ message: "later" });
    await settle();
    expect(sent.at(-1)?.message).toBe("later");
  });

  it("waits for the csrftoken cookie: one config request, then the waiting reports", async () => {
    const fetchCsrf = vi.fn();
    const { reporter, sent, noCsrf } = setup({ fetchCsrf: async () => fetchCsrf() });
    noCsrf();
    reporter.report({ message: "a" });
    reporter.report({ message: "b" });
    expect(sent).toEqual([]); // nothing goes out without the cookie (it would be a 403)
    await settle();
    expect(fetchCsrf).toHaveBeenCalledTimes(1);
    // fetchCsrf here does not set the cookie: still nothing sent, still waiting
    expect(sent).toEqual([]);
  });

  it("flushes the waiting reports once the cookie is there, and keeps only a few", async () => {
    const { reporter, sent, noCsrf } = setup();
    noCsrf();
    for (let i = 0; i < MAX_WAITING + 2; i++) reporter.report({ message: `w${i}` });
    await settle();
    expect(sent.map((r) => r.message)).toEqual(Array.from({ length: Math.min(MAX_WAITING, MAX_PER_MINUTE) }, (_, i) => `w${i}`));
  });

  it("sends nothing while tests run", async () => {
    const { reporter, sent } = setup({ enabled: false });
    reporter.report({ message: "boom" });
    await settle();
    expect(sent).toEqual([]);
  });

  it("never throws and never reports its own failures", async () => {
    const send = vi.fn(async () => {
      throw new Error("network down");
    });
    const { reporter } = setup({ send });
    expect(() => reporter.report({ message: "first" })).not.toThrow();
    await settle();
    expect(send).toHaveBeenCalledTimes(1); // the failed send was not reported in turn

    const broken = setup({
      page: () => {
        throw new Error("no location");
      },
    });
    expect(() => broken.reporter.report({ message: "x" })).not.toThrow();
  });

  it("skips noise no one can fix: extensions, cross-origin scripts, ResizeObserver", async () => {
    const { reporter, sent } = setup();
    reporter.report({ message: "Script error." });
    reporter.report({ message: "ResizeObserver loop completed with undelivered notifications." });
    reporter.report({ message: "x is undefined", stack: "at chrome-extension://abc/content.js:1" });
    await settle();
    expect(sent).toEqual([]);
  });

  it("cuts long texts before sending", async () => {
    const { reporter, sent } = setup();
    reporter.report({ message: "m".repeat(5000), stack: "s".repeat(50_000) });
    await settle();
    expect(sent[0].message).toHaveLength(1000);
    expect(sent[0].stack).toHaveLength(8000);
  });
});

describe("describeError", () => {
  it("reads an Error, a rejected value, or anything else without throwing", () => {
    const error = new TypeError("bad");
    expect(describeError(error)).toEqual({ message: "TypeError: bad", stack: error.stack });
    expect(describeError("plain text")).toEqual({ message: "plain text" });
    expect(describeError({ code: 7 })).toEqual({ message: '{"code":7}' });
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(describeError(loop).message).toBe("[object Object]");
    expect(describeError(undefined)).toEqual({ message: "undefined" });
  });

  it("adds the digest Next.js gives a server error", () => {
    const error = Object.assign(new Error("hidden"), { digest: "123" });
    expect(describeError(error).message).toBe("Error: hidden (digest 123)");
  });
});

describe("pageOf", () => {
  it("keeps the path and drops the query and hash, where links carry their token", () => {
    expect(pageOf(new URL("https://x.test/account/reset?uid=MQ&token=secret#top"))).toBe("/account/reset");
    expect(pageOf(new URL("https://x.test/rooms/join?token=invite-secret"))).toBe("/rooms/join");
  });
});

describe("a failed csrf fetch", () => {
  it("is retried by the next report instead of silencing the page", async () => {
    let attempts = 0;
    let csrf = false;
    const { reporter, sent, noCsrf } = setup({
      hasCsrf: () => csrf,
      fetchCsrf: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("offline");
        csrf = true;
      },
    });
    noCsrf();
    for (let i = 0; i < MAX_WAITING; i++) reporter.report({ message: `before ${i}` });
    await settle();
    expect(sent).toHaveLength(0); // the first fetch failed: nothing could go out
    reporter.report({ message: "after the blip" });
    await settle();
    expect(attempts).toBe(2);
    expect(sent.map((r) => r.message)).toContain("before 0");
  });
});
