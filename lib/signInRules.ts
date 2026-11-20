import "server-only";

import { prisma } from "@/lib/db";
import { inviteBoundToOtherEmail, mayCreateAccount } from "@/lib/inviteSignup";

const OPERATOR_OAUTH = new Set(["google", "apple", "github"]);
const PROVIDER_ISSUED = (provider: string) => provider.startsWith("saml-") || provider.startsWith("oidc-") || provider === "supabase" || provider === "firebase";

/** Whether the account has identities and every one of them came from a single sign-on provider or a bridge. */
async function onlyProviderIdentities(userId: string) {
  const accounts = await prisma.account.findMany({ where: { userId }, select: { provider: true } });
  return accounts.length > 0 && accounts.every((account) => PROVIDER_ISSUED(account.provider));
}

/** Why a verified outside identity may not sign in (or create an account) here; null when it may. */
export type IdentityRefusal = "super_admin_password_only" | "invite_email_mismatch" | "account_creation_disabled" | "blocked" | "link_from_account";

/**
 * The rules every outside identity meets after its provider has vouched for the email: Google, Apple, GitHub, the
 * Supabase and Firebase bridges, OIDC and SAML. Google, Apple and GitHub link to an existing account by that email (callers
 * must have checked it is verified first). With `linkByEmail: false` (OIDC, SAML), an account with that email and no
 * link for this provider and subject is refused with `link_from_account`: those identities link only from a signed-in session.
 */
export async function identityRefusal(email: string, provider: string, providerAccountId: string, options: { linkByEmail?: boolean } = {}): Promise<IdentityRefusal | null> {
  const existing = await prisma.user.findUnique({
    where: { email }, select: { id: true, passwordHash: true, emailVerified: true, isSuperAdmin: true },
  });
  // Super admins sign in with their email and the password set on the server, never through a provider.
  if (existing?.isSuperAdmin) return "super_admin_password_only";
  // A pre-registered, unverified password must never survive linking to the real inbox owner's provider identity.
  if (existing?.passwordHash && !existing.emailVerified) return "blocked";

  const existingAccount = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId } },
    select: { id: true, user: { select: { isSuperAdmin: true } } },
  });
  if (existingAccount?.user?.isSuperAdmin) return "super_admin_password_only";
  if (existingAccount) return null;
  if (existing) {
    if (options.linkByEmail === false) return "link_from_account";
    // A pre-registered account (made by single sign-on or a bridge, no password) is the identity provider's, not the
    // inbox's: the owner of the inbox signs in the original way and links this provider from the security page.
    if (OPERATOR_OAUTH.has(provider) && !existing.passwordHash && (await onlyProviderIdentities(existing.id))) return "link_from_account";
    return null;
  }

  // A verified identity may create an account only while the instance-wide policy permits it, or through a staff
  // invite this browser started from (re-checked in the database, and for an invite bound to an email, that email).
  if (!(await mayCreateAccount(email))) {
    return (await inviteBoundToOtherEmail(email)) ? "invite_email_mismatch" : "account_creation_disabled";
  }
  return null;
}
