import "server-only";

import { getRedisClient } from "@/lib/rateLimit";

/**
 * A small read-through cache in Redis for read-heavy aggregates where a few minutes of staleness is harmless
 * (analytics, the public organisation page). Fail-open: with no Redis, a Redis error or a value that will not
 * serialise, the loader runs and its result is returned, so the cache never breaks a page.
 *
 * Keys come only from the builders below: `swo:cache:v1:org:<organisationId>:<scope>[:<extra>]` or
 * `swo:cache:v1:platform:<scope>[:<extra>]`. A cached value must never hold per-viewer data (permissions,
 * unit scope) unless that is part of the key: analytics keys always carry the viewer's unit scope.
 *
 * Values are JSON. Dates are written as `{"$swoDate": "<ISO>"}` and revived as Dates, so loaders return the
 * same shapes cached or not. Maps and Sets are refused (not cached) rather than silently emptied.
 */

const PREFIX = "swo:cache:v1";
const DATE_TAG = "$swoDate";
const SEGMENT = /^[A-Za-z0-9_.-]{1,128}$/;

export const ANALYTICS_TTL_SECONDS = 300;
export const PUBLIC_PAGE_TTL_SECONDS = 600;

export type OrgCacheScope = "analytics" | "public-page";
export type PlatformCacheScope = "analytics";

function segments(parts: string[]): string {
  for (const part of parts) if (!SEGMENT.test(part)) throw new Error("Invalid cache key segment");
  return parts.join(":");
}

/** One organisation's key. The organisation id is required, so a tenant's value can never be read by another. */
export function orgCacheKey(organisationId: string, scope: OrgCacheScope, ...extra: string[]): string {
  return `${PREFIX}:org:${segments([organisationId, scope, ...extra])}`;
}

/** An analytics key: always the viewer's unit scope (the unit id, or "org" for organisation-wide). */
export function analyticsCacheKey(organisationId: string, unitId: string | null, ...extra: string[]): string {
  return orgCacheKey(organisationId, "analytics", unitId ? `unit-${unitId}` : "org", ...extra);
}

/** Platform-wide aggregates (super admin only). */
export function platformCacheKey(scope: PlatformCacheScope, ...extra: string[]): string {
  return `${PREFIX}:platform:${segments([scope, ...extra])}`;
}

function encode(value: unknown): string | undefined {
  return JSON.stringify(value, function (this: Record<string, unknown>, key: string, json: unknown) {
    const raw = this[key];
    if (raw instanceof Date) return { [DATE_TAG]: raw.toISOString() };
    if (raw instanceof Map || raw instanceof Set) throw new Error("Uncacheable value");
    return json;
  });
}

function decode<T>(text: string): T {
  return JSON.parse(text, (_key, value: unknown) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const tagged = (value as Record<string, unknown>)[DATE_TAG];
      if (typeof tagged === "string" && Object.keys(value).length === 1) return new Date(tagged);
    }
    return value;
  }) as T;
}

/** Read `key`, or run `load` and store its result for `ttlSeconds`. Never throws because of the cache. */
export async function cached<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  let redis: ReturnType<typeof getRedisClient> = null;
  try {
    redis = getRedisClient();
    const hit = redis ? await redis.get(key) : null;
    if (hit !== null) return decode<T>(hit);
  } catch {
    console.warn("[cache] read failed");
  }
  const value = await load();
  if (redis) {
    try {
      const text = encode(value);
      if (text !== undefined) await redis.set(key, text, "EX", ttlSeconds);
    } catch {
      console.warn("[cache] write failed");
    }
  }
  return value;
}

/** Drop exact keys. Never throws. */
export async function invalidate(...keys: string[]): Promise<void> {
  if (!keys.length) return;
  try {
    await getRedisClient()?.unlink(...keys);
  } catch {
    console.warn("[cache] invalidate failed");
  }
}

/** Drop every key of these scopes for one organisation (the scope's key and all its variants). Never throws. */
export async function invalidateOrg(organisationId: string, ...scopes: OrgCacheScope[]): Promise<void> {
  try {
    const redis = getRedisClient();
    if (!redis) return;
    for (const scope of scopes) {
      const base = orgCacheKey(organisationId, scope);
      await redis.unlink(base);
      let cursor = "0";
      do {
        const [next, keys] = await redis.scan(cursor, "MATCH", `${base}:*`, "COUNT", 500);
        if (keys.length) await redis.unlink(...keys);
        cursor = next;
      } while (cursor !== "0");
    }
  } catch {
    console.warn("[cache] invalidate failed");
  }
}
