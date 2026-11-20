import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rateLimit", () => ({ getRedisClient: () => null }));

import { backoffSeconds, clearSignInFailures, memorySet, memorySize, recordSignInFailure, signInWaitSeconds, throttledResponse } from "@/lib/signInBackoff";

describe("sign-in backoff curve", () => {
  it("is free for the first four failures, then 15 seconds doubling to a 15 minute cap", () => {
    expect([0, 1, 4].map(backoffSeconds)).toEqual([0, 0, 0]);
    expect([5, 6, 7, 8].map(backoffSeconds)).toEqual([15, 30, 60, 120]);
    expect(backoffSeconds(11)).toBe(900);
    expect(backoffSeconds(500)).toBe(900);
  });
});

describe("per-account delay", () => {
  const fail = async (email: string, times: number) => { for (let i = 0; i < times; i += 1) await recordSignInFailure(email); };

  it("starts after five failures and is the same for any address, known or not (it never looks at an account)", async () => {
    await fail("known@example.test", 5);
    await fail("nobody@example.test", 5);
    expect(await signInWaitSeconds("known@example.test")).toBeGreaterThan(0);
    expect(await signInWaitSeconds("nobody@example.test")).toBe(await signInWaitSeconds("known@example.test"));
    expect(await signInWaitSeconds("other@example.test")).toBe(0);
  });
  it("ignores letter case and surrounding space in the address, and grows with each failure", async () => {
    await fail("Grow@Example.test", 5);
    const first = await signInWaitSeconds(" grow@example.test ");
    await recordSignInFailure("grow@example.test");
    expect(await signInWaitSeconds("grow@example.test")).toBeGreaterThan(first);
  });
  it("is cleared by a correct sign-in", async () => {
    await fail("clear@example.test", 6);
    expect(await signInWaitSeconds("clear@example.test")).toBeGreaterThan(0);
    await clearSignInFailures("clear@example.test");
    expect(await signInWaitSeconds("clear@example.test")).toBe(0);
  });
  it("answers a route with 429 and Retry-After", async () => {
    const response = throttledResponse(42.2);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("43");
  });
});

describe("in-memory fallback", () => {
  it("sweeps expired entries and stays capped under a spray of distinct keys", () => {
    const now = Date.now();
    for (let index = 0; index < 25_000; index += 1) memorySet(`k${index}`, { value: 1, expiresAt: now + 60_000 }, now);
    expect(memorySize()).toBeLessThanOrEqual(10_000);
    // Once the cap is reached, expired entries are swept before any live one is evicted.
    for (let index = 0; index < 10_000; index += 1) memorySet(`soon${index}`, { value: 1, expiresAt: now + 10 }, now);
    memorySet("fresh", { value: 1, expiresAt: now + 60_000 }, now + 5_000);
    expect(memorySize()).toBe(1);
  });
});
