import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/rateLimit", () => ({ getRedisClient: () => mocks.client }));

import { analyticsCacheKey, cached, invalidate, invalidateOrg, orgCacheKey, platformCacheKey } from "@/lib/cache";

/** An in-memory stand-in for the ioredis calls the cache makes. */
function fakeRedis() {
  const store = new Map<string, string>();
  const ttl = new Map<string, number>();
  return {
    store,
    ttl,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, _ex: string, seconds: number) => {
      store.set(key, value);
      ttl.set(key, seconds);
      return "OK";
    }),
    unlink: vi.fn(async (...keys: string[]) => keys.filter((key) => store.delete(key)).length),
    scan: vi.fn(async (_cursor: string, _match: string, pattern: string) => {
      const prefix = pattern.slice(0, -1);
      return ["0", [...store.keys()].filter((key) => key.startsWith(prefix))];
    }),
  };
}

const ORG = "cmorgaaaaaaaaaaaaaaaaaaaa";
const OTHER = "cmorgbbbbbbbbbbbbbbbbbbbb";

beforeEach(() => {
  mocks.client = fakeRedis();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("cache keys", () => {
  it("always carry the organisation id or the platform namespace", () => {
    expect(orgCacheKey(ORG, "public-page")).toBe(`swo:cache:v1:org:${ORG}:public-page`);
    expect(platformCacheKey("analytics")).toBe("swo:cache:v1:platform:analytics");
    expect(orgCacheKey(ORG, "analytics", "x")).not.toBe(orgCacheKey(OTHER, "analytics", "x"));
  });

  it("refuse a missing organisation id or a segment that could break the namespace", () => {
    expect(() => orgCacheKey("", "analytics")).toThrow();
    expect(() => orgCacheKey("a:b", "analytics")).toThrow();
    expect(() => orgCacheKey(ORG, "analytics", "*")).toThrow();
    expect(() => analyticsCacheKey(ORG, "", "home")).not.toThrow();
  });

  it("put the viewer's unit scope in every analytics key", () => {
    expect(analyticsCacheKey(ORG, null, "home-money")).toBe(`swo:cache:v1:org:${ORG}:analytics:org:home-money`);
    expect(analyticsCacheKey(ORG, "unit1", "home-money")).toBe(`swo:cache:v1:org:${ORG}:analytics:unit-unit1:home-money`);
    expect(analyticsCacheKey(ORG, "unit1", "home-money")).not.toBe(analyticsCacheKey(ORG, "unit2", "home-money"));
  });
});

describe("cached", () => {
  const key = orgCacheKey(ORG, "analytics", "test");

  it("loads and stores on a miss, then serves the stored value with dates revived", async () => {
    const when = new Date("2026-04-01T00:00:00.000Z");
    const load = vi.fn(async () => ({ when, rows: [{ at: when, count: 2 }], none: null }));
    const first = await cached(key, 300, load);
    const second = await cached(key, 300, load);
    expect(load).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(second.when).toBeInstanceOf(Date);
    expect(second.rows[0].at.getTime()).toBe(when.getTime());
    expect((mocks.client as ReturnType<typeof fakeRedis>).ttl.get(key)).toBe(300);
  });

  it("falls back to the loader when Redis fails, without throwing", async () => {
    const broken = fakeRedis();
    broken.get.mockRejectedValue(new Error("down"));
    broken.set.mockRejectedValue(new Error("down"));
    mocks.client = broken;
    await expect(cached(key, 300, async () => 7)).resolves.toBe(7);
  });

  it("falls back to the loader with no Redis configured", async () => {
    mocks.client = null;
    const load = vi.fn(async () => "fresh");
    await expect(cached(key, 300, load)).resolves.toBe("fresh");
    await expect(cached(key, 300, load)).resolves.toBe("fresh");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("ignores a corrupt stored value and never caches a Map", async () => {
    const client = mocks.client as ReturnType<typeof fakeRedis>;
    client.store.set(key, "{not json");
    await expect(cached(key, 300, async () => 1)).resolves.toBe(1);
    const mapKey = orgCacheKey(ORG, "analytics", "map");
    const value = await cached(mapKey, 300, async () => ({ byId: new Map([["a", 1]]) }));
    expect(value.byId.get("a")).toBe(1);
    expect(client.store.has(mapKey)).toBe(false);
  });

  it("still propagates the loader's own error", async () => {
    await expect(cached(key, 300, async () => { throw new Error("db"); })).rejects.toThrow("db");
  });
});

describe("invalidation", () => {
  it("drops every variant of one organisation's scope and nothing of another's", async () => {
    const client = mocks.client as ReturnType<typeof fakeRedis>;
    const mine = [analyticsCacheKey(ORG, null, "home-members"), analyticsCacheKey(ORG, "unit1", "units", "all")];
    const theirs = analyticsCacheKey(OTHER, null, "home-members");
    const page = orgCacheKey(ORG, "public-page");
    for (const key of [...mine, theirs, page]) client.store.set(key, "1");
    await invalidateOrg(ORG, "analytics");
    expect(mine.some((key) => client.store.has(key))).toBe(false);
    expect(client.store.has(theirs)).toBe(true);
    expect(client.store.has(page)).toBe(true);
    await invalidateOrg(ORG, "public-page");
    expect(client.store.has(page)).toBe(false);
  });

  it("drops exact keys and never throws", async () => {
    const client = mocks.client as ReturnType<typeof fakeRedis>;
    client.store.set(platformCacheKey("analytics"), "1");
    await invalidate(platformCacheKey("analytics"));
    expect(client.store.size).toBe(0);
    client.unlink.mockRejectedValue(new Error("down"));
    await expect(invalidate("k")).resolves.toBeUndefined();
    await expect(invalidateOrg(ORG, "analytics")).resolves.toBeUndefined();
  });
});
