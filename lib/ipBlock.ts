import "server-only";

import { isIP } from "node:net";
import { headers } from "next/headers";
import { recordAuditEvent } from "@/lib/audit";
import { getClientIpFromHeaders, getRedisClient } from "@/lib/rateLimit";

/**
 * Automatic blocking of addresses that keep failing to sign in: 20 failures (wrong password or code) within
 * 15 minutes blocks the address for an hour; blocked again within a week, for a day. Only sign-in, sign-up and
 * password-reset requests are refused, so a shared office address isn't cut off from the rest of the site.
 * Super admins see and lift blocks under Super admin, Security.
 */
const FAILURES_ALLOWED = 20;
const FAILURE_WINDOW_S = 15 * 60;
const BLOCK_S = 60 * 60;
const REPEAT_BLOCK_S = 24 * 60 * 60;
const REMEMBER_S = 7 * 24 * 60 * 60;

const failKey = (ip: string) => `swo:loginfail:${ip}`;
const blockKey = (ip: string) => `swo:ipblock:${ip}`;
const repeatKey = (ip: string) => `swo:ipblocked-before:${ip}`;

/** In development and tests without Redis, blocks live in memory. */
const memory = new Map<string, { value: string; expiresAt: number }>();
const memoryGet = (key: string) => { const entry = memory.get(key); if (!entry || entry.expiresAt <= Date.now()) { memory.delete(key); return null; } return entry; };

/** Only real addresses are counted: never "unknown", which would lump every visitor together. */
const blockable = (ip: string | null | undefined): ip is string => Boolean(ip && isIP(ip));

export async function isIpBlocked(ip: string | null | undefined) {
  if (!blockable(ip)) return false;
  const redis = getRedisClient();
  if (!redis) return Boolean(memoryGet(blockKey(ip)));
  try {
    return (await redis.exists(blockKey(ip))) === 1;
  } catch {
    return false;
  }
}

/** Count a failed sign-in from this address and block it once it crosses the line. Returns true when it did. */
export async function recordFailedLogin(ip: string | null | undefined) {
  if (!blockable(ip)) return false;
  const redis = getRedisClient();
  let failures: number;
  let repeat: boolean;
  if (!redis) {
    const entry = memoryGet(failKey(ip));
    failures = Number(entry?.value ?? 0) + 1;
    memory.set(failKey(ip), { value: String(failures), expiresAt: entry?.expiresAt ?? Date.now() + FAILURE_WINDOW_S * 1000 });
    repeat = Boolean(memoryGet(repeatKey(ip)));
  } else {
    try {
      failures = Number(await redis.eval("local c = redis.call('INCR', KEYS[1]); if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return c", 1, failKey(ip), String(FAILURE_WINDOW_S)));
      repeat = (await redis.exists(repeatKey(ip))) === 1;
    } catch {
      return false;
    }
  }
  if (failures < FAILURES_ALLOWED || (await isIpBlocked(ip))) return false;
  const seconds = repeat ? REPEAT_BLOCK_S : BLOCK_S;
  const value = JSON.stringify({ blockedAt: new Date().toISOString(), failures });
  if (!redis) {
    memory.set(blockKey(ip), { value, expiresAt: Date.now() + seconds * 1000 });
    memory.set(repeatKey(ip), { value: "1", expiresAt: Date.now() + REMEMBER_S * 1000 });
    memory.delete(failKey(ip));
  } else {
    await redis.multi().set(blockKey(ip), value, "EX", seconds).set(repeatKey(ip), "1", "EX", REMEMBER_S).del(failKey(ip)).exec().catch(() => undefined);
  }
  await recordAuditEvent({ action: "IP_BLOCKED", actorUserId: null, targetType: "Address", targetId: ip, metadata: { failures, hours: seconds / 3600 } }).catch(() => undefined);
  return true;
}

/** Whether the address of the current request is blocked (for server actions). */
export async function currentRequestBlocked() {
  return isIpBlocked(getClientIpFromHeaders(await headers()));
}

type BlockedAddress = { ip: string; blockedAt: string | null; expiresAt: string };

/** Addresses blocked right now, newest first (at most 200). */
export async function listBlockedIps(): Promise<BlockedAddress[]> {
  const redis = getRedisClient();
  const rows: BlockedAddress[] = [];
  if (!redis) {
    for (const [key, entry] of memory) if (key.startsWith("swo:ipblock:") && entry.expiresAt > Date.now()) rows.push({ ip: key.slice(12), blockedAt: JSON.parse(entry.value).blockedAt ?? null, expiresAt: new Date(entry.expiresAt).toISOString() });
  } else {
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", "swo:ipblock:*", "COUNT", 200);
      cursor = next;
      for (const key of keys) {
        const [value, ttl] = await Promise.all([redis.get(key), redis.ttl(key)]);
        if (!value || ttl <= 0) continue;
        rows.push({ ip: key.slice(12), blockedAt: (JSON.parse(value) as { blockedAt?: string }).blockedAt ?? null, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() });
      }
    } while (cursor !== "0" && rows.length < 200);
  }
  return rows.sort((a, b) => (b.blockedAt ?? "").localeCompare(a.blockedAt ?? "")).slice(0, 200);
}

/** Lift a block and forget the address's failures and history. */
export async function unblockIp(ip: string) {
  if (!blockable(ip)) return false;
  const redis = getRedisClient();
  if (!redis) {
    for (const key of [blockKey(ip), failKey(ip), repeatKey(ip)]) memory.delete(key);
    return true;
  }
  await redis.del(blockKey(ip), failKey(ip), repeatKey(ip));
  return true;
}
