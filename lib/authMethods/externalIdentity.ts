import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { identityRefusal } from "@/lib/signInRules";
import { recognisedDevice, rememberDevice } from "@/lib/loginSecurity";
import { auditIdentityLinked } from "@/lib/authAudit";
import { activeLinkTarget } from "@/lib/linkSession";
import { linkExternalIdentity } from "./link";
import { SignInError } from "./errors";

const select = { id: true, name: true, email: true, image: true, sessionVersion: true, emailVerified: true, isSuperAdmin: true } as const;

/**
 * Sign in (or create) the account behind a verified outside identity that must never link by email: SAML. The same
 * rules as every outside identity (lib/signInRules.ts) with `linkByEmail: false`: an existing account with that email
 * and no link for this provider and subject is refused with `link_from_account`. A new account and its link are made
 * together, so a half-made account can never be found by email later.
 */
export async function signInExternalIdentity(input: { provider: string; sub: string; email: string; name: string | null; failureCode: string }) {
  const { provider, sub, email } = input;
  // From a signed-in browser that asked to add this provider: link it to that user, never by email, and keep the session.
  const target = await activeLinkTarget(provider);
  if (target) {
    const linked = await linkExternalIdentity(target.userId, provider, "saml", sub);
    if (!linked.ok) throw new SignInError(linked.code);
    return linked.user;
  }
  const refusal = await identityRefusal(email, provider, sub, { linkByEmail: false });
  if (refusal) throw new SignInError(refusal === "blocked" ? input.failureCode : refusal);

  const findLinked = () => prisma.account.findUnique({ where: { provider_providerAccountId: { provider, providerAccountId: sub } }, select: { user: { select } } });
  let user = (await findLinked())?.user ?? null;
  if (user?.isSuperAdmin) throw new SignInError("super_admin_password_only");
  let created = false;
  if (!user) {
    try {
      user = await prisma.$transaction(async (tx) => {
        const made = await tx.user.create({ data: { email, name: input.name, emailVerified: new Date() }, select });
        await tx.account.create({ data: { userId: made.id, type: "saml", provider, providerAccountId: sub } });
        return made;
      });
      created = true;
    } catch (error) {
      // Two sign-ins racing to create the same account: read what the winner linked, never by email.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      user = (await findLinked())?.user ?? null;
      if (!user || user.isSuperAdmin) throw new SignInError(input.failureCode);
    }
  }
  if (created) await auditIdentityLinked(user.id, provider);
  await rememberDevice(user.id, await recognisedDevice(user.id));
  return { id: user.id, name: user.name, email: user.email, image: user.image, sessionVersion: user.sessionVersion };
}
