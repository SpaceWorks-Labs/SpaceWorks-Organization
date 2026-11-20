import "server-only";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { prisma } from "@/lib/db";
import { auditIdentityLinked } from "@/lib/authAudit";

const base = PrismaAdapter(prisma);
export const authAdapter: Adapter = {
  ...base,
  async getUserByEmail(email) {
    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true, email: true, name: true, image: true, emailVerified: true, passwordHash: true } });
    // Recheck at the adapter's linking lookup, after the sign-in callback:
    // registration can race the callback's initial lookup.
    if (user?.passwordHash && !user.emailVerified) throw new Error("Account linking requires verified email.");
    if (!user?.email) return null;
    return { id: user.id, email: user.email, name: user.name, image: user.image, emailVerified: user.emailVerified };
  },
  async linkAccount(account) {
    // The provider is used only for identity. Do not retain reusable OAuth tokens.
    await base.linkAccount!({
      userId: account.userId,
      type: account.type,
      provider: account.provider,
      providerAccountId: account.providerAccountId,
    });
    await auditIdentityLinked(account.userId, account.provider);
  },
};
