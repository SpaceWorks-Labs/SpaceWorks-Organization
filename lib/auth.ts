import "server-only";

import NextAuth from "next-auth";
import { authAdapter } from "@/lib/authAdapter";
import { prisma } from "@/lib/db";
import { providerVerifiedEmail } from "@/lib/oauthProviders";
import { loadLoginMethods } from "@/lib/loginMethods";
import { identityRefusal } from "@/lib/signInRules";
import { recognisedDevice, rememberDevice } from "@/lib/loginSecurity";
import { buildAuthMethods } from "@/lib/authMethods";
import { isOidcProviderId } from "@/lib/oidc/providers";
import { auditSignInFailed, auditSignInSucceeded, auditSignedOut } from "@/lib/authAudit";
import { sessionCookieName } from "@/lib/sessionCookie";
import { checkUserSession, startUserSession } from "@/lib/userSessions";
import { activeLinkTarget, clearLinkIntent } from "@/lib/linkSession";
import { oauthSessionGate } from "@/lib/authMethods/sessionGate";

export const { handlers, auth } = NextAuth(async () => {
  const context = await loadLoginMethods();
  const { providers, cookies } = buildAuthMethods(context);
  return {
  adapter: authAdapter,
  // Credentials requires JWT sessions; OAuth accounts are still persisted
  // via the adapter's `linkAccount` hook.
  session: { strategy: "jwt" },
  // Changing the session payload/secret can leave an old encrypted cookie in
  // browsers. A versioned name retires that incompatible token cleanly rather
  // than asking Auth.js to decode it on every request.
  cookies: { sessionToken: { name: sessionCookieName() }, ...cookies },
  trustHost: true,
  logger: {
    // Auth.js error causes can contain provider responses and credentials.
    error() { console.error("[auth] Authentication failed"); },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers,
  callbacks: {
    async signIn({ user, account, profile }) {
      // Credentials providers (password, Supabase, Firebase) have already verified their own proof in authorize.
      if (!account || account.type === "credentials" || account.provider === "credentials") return true;
      const email = user.email?.trim().toLowerCase();
      if (!email) return false;
      // Never let Auth.js link this identity to a session that was ended, or to one that did not ask for it.
      const gate = await oauthSessionGate(account.provider, account.providerAccountId);
      if (gate !== undefined && gate !== true) return gate;
      if (!(await providerVerifiedEmail(account.provider, profile, account.access_token, email))) {
        await auditSignInFailed(account.provider, "unverified_email");
        return "/login?error=unverified_email";
      }
      user.email = email;
      // A signed-in person adding this identity: the gate has checked it, and it links to them, never by email.
      if (gate === true) return true;
      // OIDC identities never link to an existing account by email; Google, Apple and GitHub do (verified email only).
      const refusal = await identityRefusal(email, account.provider, account.providerAccountId, { linkByEmail: !isOidcProviderId(account.provider) });
      if (refusal) await auditSignInFailed(account.provider, refusal);
      if (refusal === "blocked") return false;
      return refusal ? `/login?error=${refusal}` : true;
    },
    async jwt({ token, user, account }) {
      const userId = user?.id ?? token.sub;
      if (!userId) return null;

      const sessionToken = token as typeof token & { authenticatedAt?: number; sessionVersion?: number; sessionRevoked?: boolean; sid?: string };
      if (user) {
        const currentUser = await prisma.user.findUnique({ where: { id: userId }, select: { sessionVersion: true } });
        if (!currentUser) return null;
        // Bind credentials to the version checked with the password. A reset
        // racing token issuance must not mint a fresh session from old proof.
        const verifiedVersion = (user as typeof user & { sessionVersion?: number }).sessionVersion;
        if (verifiedVersion !== undefined && verifiedVersion !== currentUser.sessionVersion) return null;
        token.sub = user.id;
        sessionToken.authenticatedAt = Date.now();
        sessionToken.sessionVersion = currentUser.sessionVersion;
        sessionToken.sessionRevoked = false;
        sessionToken.sid = await startUserSession(userId, currentUser.sessionVersion, account?.provider);
      } else {
        // The server-side session row, checked on every request: one indexed lookup that also reads the user's version.
        const version = sessionToken.sessionRevoked ? null : await checkUserSession(sessionToken.sid, userId);
        // Auth.js clears the cookie and returns a genuinely anonymous session.
        if (version === null || sessionToken.sessionVersion !== version) return null;
      }
      return token;
    },
    session({ session, token }) {
      const sessionToken = token as typeof token & { authenticatedAt?: number; sessionRevoked?: boolean };
      if (session.user && token.sub && !sessionToken.sessionRevoked) session.user.id = token.sub;
      if (sessionToken.sessionRevoked && session.user) session.user.id = "";
      (session as typeof session & { authenticatedAt?: number; sid?: string }).authenticatedAt =
        sessionToken.authenticatedAt;
      // The id of this browser's session row, so the security page can mark "this device". It is not a credential.
      (session as typeof session & { sid?: string }).sid = (token as typeof token & { sid?: string }).sid;
      return session;
    },
  },
  events: {
    async signOut(message) {
      const userId = "token" in message ? message.token?.sub : undefined;
      if (userId) await auditSignedOut(userId);
    },
    async signIn({ user, account }) {
      // Adding a method from a signed-in browser is not a new sign-in: no sign-in audit row, no new-device alert.
      if (account && user.id && (await activeLinkTarget(account.provider).catch(() => null))?.userId === user.id) {
        await clearLinkIntent().catch(() => undefined);
        return;
      }
      if (account && user.id) await auditSignInSucceeded(user.id, account.provider);
      if (account && account.type !== "credentials" && account.provider !== "credentials" && user.id) {
        // Auth.js creates or links the adapter user after callbacks.signIn.
        await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
        // The provider proved the identity; still remember the browser and alert on a new one.
        await rememberDevice(user.id, await recognisedDevice(user.id));
      }
    },
  },
  };
});
