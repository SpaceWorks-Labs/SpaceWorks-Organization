import "server-only";

import crypto from "crypto";
import { getRedisClient } from "@/lib/rateLimit";

/**
 * A growing delay per account for sign-in and code attempts (product rules section 15, "Abuse"). After 5 failures
 * for an email address, further attempts are refused for 15 seconds, doubling with each failure up to 15 minutes.
 * The counter is keyed by the lowercased email whether or not an account exists, so the answer never shows whether
 * an account does. A correct sign-in clears it. Per-IP blocking stays in lib/ipBlock.ts.
 */
const FREE_FAILURES = 5;
const FIRST_DELAY_S = 15;
const MAX_DELAY_S = 15 * 60;
const MEMORY_S = 60 * 60;

/** The delay, in seconds, that applies after this many consecutive failures. */
export function backoffSeconds(failures: number) {
  if (failures < FREE_FAILURES) return 0;
  return Math.min(MAX_DELAY_S, FIRST_DELAY_S * 2 ** Math.min(failures - FREE_FAILURES, 20));
}

const digest = (email: string) => crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
const countKey = (email: string) => `swo:signin-fails:${digest(email)}`;
const waitKey = (email: string) => `swo:signin-wait:${digest(email)}`;

const MEMORY_CAP = 10_000;
const memory = new Map<string, { value: number; expiresAt: number }>();

let lastSweep = 0;

/**
 * Write to the fallback map. At the cap, expired entries are swept (at most once a second) and then the oldest are
 * dropped one at a time, so a spray of distinct addresses cannot grow the map without bound or make each write slow.
 */
export function memorySet(key: string, entry: { value: number; expiresAt: number }, now = Date.now()) {
  memory.delete(key);
  if (memory.size >= MEMORY_CAP) {
    if (now - lastSweep >= 1000) {
      lastSweep = now;
      for (const [name, value] of memory) if (value.expiresAt <= now) memory.delete(name);
    }
    for (const name of memory.keys()) {
      if (memory.size < MEMORY_CAP) break;
      memory.delete(name);
    }
  }
  memory.set(key, entry);
}
export const memorySize = () => memory.size;
const memoryGet = (key: string) => {
  const entry = memory.get(key);
  if (!entry || entry.expiresAt <= Date.now()) { memory.delete(key); return null; }
  return entry;
};

/** Seconds this account must still wait; 0 when it may try now. Fails open if the store is unavailable. */
export async function signInWaitSeconds(email: string): Promise<number> {
  const redis = getRedisClient();
  if (!redis) {
    const entry = memoryGet(waitKey(email));
    return entry ? Math.ceil((entry.expiresAt - Date.now()) / 1000) : 0;
  }
  try {
    const ttl = await redis.ttl(waitKey(email));
    return ttl > 0 ? ttl : 0;
  } catch {
    return 0;
  }
}

/** Count a failed attempt and start the delay once past the free ones. Returns the delay now in force. */
export async function recordSignInFailure(email: string): Promise<number> {
  const redis = getRedisClient();
  if (!redis) {
    const entry = memoryGet(countKey(email));
    const failures = (entry?.value ?? 0) + 1;
    memorySet(countKey(email), { value: failures, expiresAt: Date.now() + MEMORY_S * 1000 });
    const delay = backoffSeconds(failures);
    if (delay) memorySet(waitKey(email), { value: 1, expiresAt: Date.now() + delay * 1000 });
    return delay;
  }
  try {
    const failures = Number(await redis.eval("local c = redis.call('INCR', KEYS[1]); redis.call('EXPIRE', KEYS[1], ARGV[1]); return c", 1, countKey(email), String(MEMORY_S)));
    const delay = backoffSeconds(failures);
    if (delay) await redis.set(waitKey(email), "1", "EX", delay);
    return delay;
  } catch {
    return 0;
  }
}

/** Forget an account's failures after a correct sign-in. */
export async function clearSignInFailures(email: string) {
  const redis = getRedisClient();
  if (!redis) {
    memory.delete(countKey(email));
    memory.delete(waitKey(email));
    return;
  }
  await redis.del(countKey(email), waitKey(email)).catch(() => undefined);
}

/** A 429 answer with Retry-After, for route handlers that throttle. */
export function throttledResponse(seconds: number) {
  return new Response(JSON.stringify({ error: "Too many attempts. Try again shortly." }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": String(Math.max(1, Math.ceil(seconds))), "Cache-Control": "no-store" },
  });
}
