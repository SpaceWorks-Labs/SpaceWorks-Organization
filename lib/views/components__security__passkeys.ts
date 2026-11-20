import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";
import { loadLoginMethods } from "@/lib/loginMethods";

/**
 * What the passkeys card on the account security page needs: whether passkeys are switched on and open to this
 * person (super admins use a password only), and their own passkeys by name and dates. Never keys or credential ids.
 */
export async function loadPasskeysView() {
  const session = await requireAuth();
  const [{ available }, user, rows] = await Promise.all([
    loadLoginMethods(),
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { isSuperAdmin: true } }),
    prisma.passkey.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, backedUp: true, createdAt: true, lastUsedAt: true } }),
  ]);
  const offered = available.includes("passkey") && !user.isSuperAdmin;
  return {
    offered,
    passkeys: offered || rows.length ? rows.map((row) => ({ id: row.id, name: row.name, synced: row.backedUp, createdAt: row.createdAt.toISOString(), lastUsedAt: row.lastUsedAt?.toISOString() ?? null })) : [],
  };
}
