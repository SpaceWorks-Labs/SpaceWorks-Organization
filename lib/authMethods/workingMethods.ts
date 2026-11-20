import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { loadLoginMethods } from "@/lib/loginMethods";
import { OIDC_PREFIX, oidcProviderId } from "@/lib/oidc/providers";
import { SAML_PREFIX, samlProviderKey } from "@/lib/saml/keys";
import type { LoginMethod } from "@/lib/loginMethodsCore";

type Db = Prisma.TransactionClient | typeof prisma;
type LoginContext = Awaited<ReturnType<typeof loadLoginMethods>>;

/** What a person is about to give up, so it is not counted: one linked identity, one passkey, or their phone number. */
export type WorkingMethodExclusion = { accountId?: string; passkeyId?: string; phone?: boolean };

/**
 * One way a person can sign in, counted. A counter returns how many of its own methods work for this user right now
 * (the method must be switched on and configured, and the person must hold a working credential for it).
 */
type MethodCounter = (db: Db, userId: string, context: LoginContext, except: WorkingMethodExclusion) => Promise<number>;

/** The sign-in method a linked identity's provider id belongs to, or null for an id nothing here understands. */
export function loginMethodOfProvider(provider: string): LoginMethod | null {
  if (provider === "google" || provider === "apple" || provider === "github" || provider === "supabase" || provider === "firebase") return provider;
  if (provider.startsWith(OIDC_PREFIX)) return "oidc";
  if (provider.startsWith(SAML_PREFIX)) return "saml";
  return null;
}

/** Whether a linked identity can be used to sign in right now: its method is on, and for OIDC and SAML its provider is enabled. */
export function providerAvailable(provider: string, context: Pick<LoginContext, "available" | "oidc" | "saml">) {
  const method = loginMethodOfProvider(provider);
  if (!method || !context.available.includes(method)) return false;
  if (method === "oidc") return context.oidc.some((entry) => oidcProviderId(entry.id) === provider);
  if (method === "saml") return context.saml.some((entry) => samlProviderKey(entry.id) === provider);
  return true;
}

const passwordCounter: MethodCounter = async (db, userId, context) => {
  const user = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true, isSuperAdmin: true } });
  // The server refuses a password sign-in while the method is off, except for super admins.
  return user?.passwordHash && (context.available.includes("password") || user.isSuperAdmin) ? 1 : 0;
};

const identityCounter: MethodCounter = async (db, userId, context, except) => {
  const accounts = await db.account.findMany({ where: { userId, ...(except.accountId ? { id: { not: except.accountId } } : {}) }, select: { provider: true } });
  return accounts.filter((account) => providerAvailable(account.provider, context)).length;
};

const passkeyCounter: MethodCounter = async (db, userId, context, except) => {
  if (!context.available.includes("passkey")) return 0;
  return db.passkey.count({ where: { userId, ...(except.passkeyId ? { id: { not: except.passkeyId } } : {}) } });
};

const phoneCounter: MethodCounter = async (db, userId, context, except) => {
  if (except.phone || !context.available.includes("phone")) return 0;
  return (await db.user.count({ where: { id: userId, phoneE164: { not: null }, phoneVerifiedAt: { not: null } } })) > 0 ? 1 : 0;
};

/**
 * Every way of signing in that counts towards "this person can still get in". Passkeys (D2) and phone codes (D4)
 * add their counter to this list; `except` names what is about to be removed.
 */
const COUNTERS: MethodCounter[] = [passwordCounter, identityCounter, passkeyCounter, phoneCounter];

/**
 * How many working ways to sign in a person has. Super admins have password only, so linked identities never count
 * for them. Removing a method must leave at least one: check `countWorkingMethods(..., { except })` is 1 or more.
 */
export async function countWorkingMethods(userId: string, except: WorkingMethodExclusion = {}, db: Db = prisma, context?: LoginContext) {
  const login = context ?? (await loadLoginMethods());
  const user = await db.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } });
  const counters = user?.isSuperAdmin ? [passwordCounter] : COUNTERS;
  const counts = await Promise.all(counters.map((count) => count(db, userId, login, except)));
  return counts.reduce((sum, value) => sum + value, 0);
}
