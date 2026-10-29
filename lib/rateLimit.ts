import type { NextRequest } from "next/server";
import Redis from "ioredis";

export type Bucket =
  | "global"
  | "action"
  | "frontendAction"
  | "create"
  | "auth"
  | "signup"
  | "emailVerification"
  | "passwordReset"
  | "application"
  | "join"
  | "payment"
  | "paymentClaim"
  | "webhook"
  | "upload"
  | "invite"
  | "verifyCard"
  | "apiRead"
  | "apiWrite"
  | "dataExport"
  | "reportExport"
  | "documentView"
  | "cardRender"
  | "testEmail";

const limits: Record<Bucket, { max: number; windowMs: number; }> = {
  global: { max: 300, windowMs: 60_000 },
  action: { max: 180, windowMs: 60_000 },
  frontendAction: { max: 180, windowMs: 60_000 },
  create: { max: 20, windowMs: 60 * 60_000 },
  auth: { max: 10, windowMs: 60_000 },
  signup: { max: 5, windowMs: 60 * 60_000 },
  emailVerification: { max: 5, windowMs: 60 * 60_000 },
  passwordReset: { max: 5, windowMs: 60 * 60_000 },
  // Organisation applications (/start): a handful per person per day is plenty.
  application: { max: 3, windowMs: 24 * 60 * 60_000 },
  join: { max: 10, windowMs: 60 * 60_000 },
  payment: { max: 20, windowMs: 60 * 60_000 },
  // A member's "I've paid" UTR claims.
  paymentClaim: { max: 5, windowMs: 60 * 60_000 },
  // Gateway webhooks: their own generous bucket, exempt from the per-IP global limit.
  webhook: { max: 1200, windowMs: 60_000 },
  upload: { max: 12, windowMs: 60 * 60_000 },
  invite: { max: 30, windowMs: 60 * 60_000 },
  // Public card checks. Doors and desks scan many cards from one address, so stay generous.
  verifyCard: { max: 120, windowMs: 60_000 },
  apiRead: { max: 600, windowMs: 60_000 },
  apiWrite: { max: 60, windowMs: 60_000 },
  // A person's own data export: heavy and rarely needed.
  dataExport: { max: 5, windowMs: 60 * 60_000 },
  // Report CSVs, GSTR-1 and the member register: a month-end run is several in a row.
  reportExport: { max: 60, windowMs: 60 * 60_000 },
  // Receipt and credit-note PDFs, opened one by one from lists.
  documentView: { max: 300, windowMs: 60 * 60_000 },
  // Member card PDF/PNG renders: CPU-heavy, so per person per hour.
  cardRender: { max: 60, windowMs: 60 * 60_000 },
  // "Send me a test" for an email template: to the sender's own address only.
  testEmail: { max: 10, windowMs: 60 * 60_000 },
};

// Local fallback store
type Entry = { count: number; resetAt: number; };
const memoryStore = new Map<string, Entry>();

let redisClient: Redis | null = null;
let isRedisDisabled = false;

function allowTestMemoryFallback() {
  return process.env.CI === "true" && process.env.ALLOW_INSECURE_PRODUCTION_TESTS === "1";
}

export function getRedisClient(): Redis | null {
  if (isRedisDisabled) return null;
  if (redisClient) return redisClient;

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl === "memory://" && allowTestMemoryFallback()) {
    isRedisDisabled = true;
    return null;
  }
  if (!redisUrl) {
    isRedisDisabled = true;
    return null;
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
      lazyConnect: true,
    });

    redisClient.on("error", () => {
      console.warn("[rateLimit] Redis client error");
    });

    return redisClient;
  } catch {
    console.error("[rateLimit] Redis client initialization failed");
    isRedisDisabled = true;
    return null;
  }
}

function keyFor(bucket: Bucket, id: string) {
  return `ratelimit:${bucket}:${id}`;
}

function getClientIp(request: NextRequest): string {
  const configuredHeader = process.env.TRUSTED_PROXY_IP_HEADER;
  if (isTrustedProxyHeader(configuredHeader)) return readConfiguredIp(request.headers, configuredHeader);
  return "unknown";
}

export function getClientIpFromHeaders(headers: Headers): string {
  const configuredHeader = process.env.TRUSTED_PROXY_IP_HEADER;
  return isTrustedProxyHeader(configuredHeader) ? readConfiguredIp(headers, configuredHeader) : "unknown";
}

function isTrustedProxyHeader(value: string | undefined): value is "cf-connecting-ip" | "x-forwarded-for" | "x-real-ip" {
  return value === "cf-connecting-ip" || value === "x-forwarded-for" || value === "x-real-ip";
}

function readConfiguredIp(headers: Headers, header: "cf-connecting-ip" | "x-forwarded-for" | "x-real-ip") {
  const value = headers.get(header)?.trim();
  if (!value) return "unknown";
  return header === "x-forwarded-for" ? forwardedClientIp(value) : value;
}

/**
 * The client address in `X-Forwarded-For`. By default the edge is expected to
 * overwrite the header, so the left-most entry is the client. Proxies that
 * append instead (Render) leave client-chosen values on the left; set
 * `TRUSTED_PROXY_HOPS` to the number of trusted proxies to read the entry the
 * outermost trusted proxy added, counted from the right.
 */
function forwardedClientIp(value: string): string {
  const entries = value.split(",").map((entry) => entry.trim()).filter(Boolean);
  const hops = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "", 10);
  const entry = Number.isInteger(hops) && hops > 0 ? entries[Math.max(0, entries.length - hops)] : entries[0];
  return entry || "unknown";
}

function checkRateLimitMemory(bucket: Bucket, id: string): boolean {
  const k = keyFor(bucket, id);
  const { max, windowMs } = limits[bucket];
  const now = Date.now();
  let entry = memoryStore.get(k);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    memoryStore.set(k, entry);
  }
  entry.count += 1;
  return entry.count <= max;
}

/** Returns true if the request is allowed; false if rate limited. */
export async function checkRateLimit(
  request: NextRequest,
  bucket: Bucket,
): Promise<boolean> {
  return checkRateLimitById(bucket, getClientIp(request));
}

/** Check a bucket using a privacy-safe, caller-provided subject key. */
export async function checkRateLimitById(bucket: Bucket, id: string): Promise<boolean> {
  const redis = getRedisClient();

  if (!redis) {
    if (process.env.NODE_ENV === "production" && !allowTestMemoryFallback()) return false;
    return checkRateLimitMemory(bucket, id);
  }

  const k = keyFor(bucket, id);
  const { max, windowMs } = limits[bucket];

  try {
    // Increment and expiry must be one Redis operation. A pipeline can leave
    // an unexpiring key behind if the process dies between INCR and PEXPIRE.
    const count = await redis.eval(
      "local c = redis.call('INCR', KEYS[1]); if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; return c",
      1,
      k,
      String(windowMs),
    );
    return Number(count) <= max;
  } catch {
    console.warn("[rateLimit] Redis check failed");
    if (process.env.NODE_ENV === "production" && !allowTestMemoryFallback()) return false;
    return checkRateLimitMemory(bucket, id);
  }
}
