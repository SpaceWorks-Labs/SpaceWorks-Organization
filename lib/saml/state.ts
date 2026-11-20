import "server-only";

import crypto from "crypto";
import type { CacheItem, CacheProvider } from "@node-saml/node-saml";
import { prisma } from "@/lib/db";
import { safeAuthRedirect } from "@/lib/authRedirect";
import { flowHash } from "./flow";
import { safeEqual } from "@/lib/safeEqual";

const REQUEST_TTL_MS = 10 * 60_000;
const TICKET_TTL_MS = 2 * 60_000;
const RELAY_TTL_MS = 10 * 60_000;

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

function relayKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set.");
  return Buffer.from(crypto.hkdfSync("sha256", secret, Buffer.alloc(0), "spaceworks-org-saml-relay-state-v1", 32));
}

/** RelayState: the same-site callback path with an expiry, signed so the IdP round trip cannot change it. */
export function signRelayState(callbackUrl: string, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ c: safeAuthRedirect(callbackUrl), e: now + RELAY_TTL_MS })).toString("base64url");
  return `${body}.${crypto.createHmac("sha256", relayKey()).update(body).digest("base64url")}`;
}

/** The callback path from a RelayState, or "/dashboard" when it is missing, forged or expired. Always same-site. */
export function readRelayState(value: string | null | undefined, now = Date.now()) {
  const [body, mac] = (value ?? "").split(".");
  if (!body || !mac) return "/dashboard";
  const expected = crypto.createHmac("sha256", relayKey()).update(body).digest();
  if (!safeEqual(mac, expected.toString("base64url"), "base64url")) return "/dashboard";
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { c?: string; e?: number };
    return typeof parsed.e === "number" && parsed.e > now ? safeAuthRedirect(parsed.c) : "/dashboard";
  } catch {
    return "/dashboard";
  }
}

async function sweep() {
  await prisma.samlLoginState.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => undefined);
}

/**
 * node-saml's request-id store, in the database and bound to one provider. Each AuthnRequest id is saved when the
 * request is made, used up (single use, atomically) when the response arrives, and expires after 10 minutes. It also
 * remembers assertion ids so a captured response cannot be replayed.
 */
export type SamlFlowBinding = {
  /** Start of a sign-in: the hash of the cookie this browser was given, stored with the request id. */
  hash?: string;
  /** Response: told which hash the consumed request id carried (null when it carried none). */
  onConsume?: (hash: string | null) => void;
};

export function samlCacheProvider(providerId: string, flow: SamlFlowBinding = {}): CacheProvider {
  return {
    async saveAsync(key, value): Promise<CacheItem | null> {
      await sweep();
      const expiresAt = new Date(Date.now() + REQUEST_TTL_MS);
      await prisma.samlLoginState.create({ data: { kind: "request", key, providerId, payload: { value, flow: flow.hash ?? null }, expiresAt } });
      return { value, createdAt: Date.now() };
    },
    async getAsync(key) {
      const row = await prisma.samlLoginState.findFirst({ where: { kind: "request", key, providerId, expiresAt: { gt: new Date() } }, select: { payload: true } });
      return row ? String((row.payload as { value?: string }).value ?? "") : null;
    },
    async removeAsync(key) {
      if (key) await prisma.samlLoginState.deleteMany({ where: { kind: "request", key, providerId } });
      return key;
    },
    async consumeAsync(key) {
      const taken = await prisma.$queryRaw<{ payload: { value?: string; flow?: string | null } }[]>`
        DELETE FROM "SamlLoginState" WHERE "kind" = 'request' AND "key" = ${key} AND "providerId" = ${providerId} AND "expiresAt" > ${new Date()}
        RETURNING "payload"`;
      if (taken.length === 1) flow.onConsume?.(taken[0].payload.flow ?? null);
      return taken.length === 1 ? String(taken[0].payload.value ?? "") : null;
    },
    async saveIfAbsentAsync(key, value, expiresAtMs) {
      try {
        await prisma.samlLoginState.create({ data: { kind: "assertion", key: `a:${providerId}:${key}`, providerId, payload: { value }, expiresAt: new Date(expiresAtMs) } });
        return true;
      } catch {
        return false;
      }
    },
  };
}

export type SamlIdentity = { email: string; name: string | null; subject: string };

/**
 * After the ACS route has validated a response: a random one-time ticket the browser hands to Auth.js. Stored hashed,
 * with the hash of the flow cookie of the browser that started the sign-in (null when the request carried none).
 */
export async function issueSamlTicket(providerId: string, identity: SamlIdentity, flow: string | null = null) {
  const ticket = crypto.randomBytes(32).toString("base64url");
  await prisma.samlLoginState.create({ data: { kind: "ticket", key: sha256(ticket), providerId, payload: { ...identity, flow }, expiresAt: new Date(Date.now() + TICKET_TTL_MS) } });
  return ticket;
}

/**
 * Use up a ticket: the identity for the first call within two minutes from the browser that started the flow, null
 * for any later one or any other browser. A wrong or missing flow cookie does not use the ticket up.
 */
export async function consumeSamlTicket(ticket: string, flowToken: string | null): Promise<(SamlIdentity & { providerId: string }) | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(ticket) || !flowToken) return null;
  const taken = await prisma.$queryRaw<{ providerId: string; payload: SamlIdentity & { flow?: string | null } }[]>`
    DELETE FROM "SamlLoginState" WHERE "kind" = 'ticket' AND "key" = ${sha256(ticket)} AND "expiresAt" > ${new Date()} AND "payload"->>'flow' = ${flowHash(flowToken)}
    RETURNING "providerId", "payload"`;
  if (taken.length !== 1) return null;
  const { email, name, subject } = taken[0].payload;
  return { email, name, subject, providerId: taken[0].providerId };
}
