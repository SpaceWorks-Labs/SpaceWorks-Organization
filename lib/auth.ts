import "server-only";

import NextAuth, { CredentialsSignin } from "next-auth";
import { authAdapter } from "@/lib/authAdapter";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { consumeRecoveryCode, decryptMfaSecret, consumeMfaCode } from "@/lib/mfa";
import { isNewUserRegistrationEnabled } from "@/lib/instanceSettings";
import { getOAuthSettings, providerVerifiedEmail } from "@/lib/oauthProviders";
import { consumeLoginCode, issueLoginCode, justVerified, recognisedDevice, rememberDevice } from "@/lib/loginSecurity";
import { isIpBlocked, recordFailedLogin } from "@/lib/ipBlock";
import { getClientIpFromHeaders } from "@/lib/rateLimit";

/**
 * The session cookie's name. Cookies ignore ports, so in development several servers on localhost (one per
 * worktree, each with its own secret) would overwrite each other's sign-in; the port keeps them apart.
 * Production serves one origin, so the name stays fixed there.
 */
function sessionCookieName(env: NodeJS.ProcessEnv = process.env) {
  const base = "swo.session-token.v1";
  if (env.NODE_ENV === "production") return base;
  try {
    const port = new URL(env.AUTH_URL || env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").port;
    return port ? `${base}.${port}` : base;
  } catch {
    return base;
  }
}

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
  totp: z.string().trim().max(32).optional(),
  emailCode: z.string().trim().max(12).optional(),
});

/**
 * This code is returned only after the supplied password is valid. It lets the
 * sign-in screen show the second factor as a distinct step without exposing
 * whether an arbitrary email address has MFA enabled.
 */
class MfaRequiredError extends CredentialsSignin {
  code = "mfa_required";
}

class EmailVerificationRequiredError extends CredentialsSignin {
  code = "email_verification_required";
}

/** A sign-in from a new browser on an account without an authenticator: a code has been emailed. */
class EmailCodeRequiredError extends CredentialsSignin {
  code = "email_code_required";
}

/** Too many failed sign-ins from this address: it is blocked for a while (lib/ipBlock.ts). */
class AddressBlockedError extends CredentialsSignin {
  code = "address_blocked";
}

export const { handlers, auth } = NextAuth(async () => {
  const oauth = await getOAuthSettings();
  return {
  adapter: authAdapter,
  // Credentials requires JWT sessions; OAuth accounts are still persisted
  // via the adapter's `linkAccount` hook.
  session: { strategy: "jwt" },
  // Changing the session payload/secret can leave an old encrypted cookie in
  // browsers. A versioned name retires that incompatible token cleanly rather
  // than asking Auth.js to decode it on every request.
  cookies: {
    sessionToken: { name: sessionCookieName() },
  },
  trustHost: true,
  logger: {
    // Auth.js error causes can contain provider responses and credentials.
    error() { console.error("[auth] Authentication failed"); },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    // Existing accounts link by email. That is safe only because callbacks.signIn refuses any identity
    // whose provider has not verified the email.
    ...(oauth.google ? [Google({ ...oauth.google, allowDangerousEmailAccountLinking: true })] : []),
    ...(oauth.github ? [GitHub({ ...oauth.github, allowDangerousEmailAccountLinking: true })] : []),
    ...(oauth.apple ? [Apple({ ...oauth.apple, allowDangerousEmailAccountLinking: true })] : []),
    Credentials({
      id: "credentials",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const ip = getClientIpFromHeaders(request.headers);
        if (await isIpBlocked(ip)) throw new AddressBlockedError();
        // Every wrong password or code counts towards blocking the address.
        const fail = async () => { if (await recordFailedLogin(ip)) throw new AddressBlockedError(); return null; };
        if (await isActionRateLimited("auth", email)) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            passwordHash: true,
            sessionVersion: true,
            emailVerified: true,
            mfaSecretEncrypted: true,
          },
        });
        // Equal bcrypt work for missing and OAuth-only accounts prevents the
        // obvious timing oracle. This is a fixed non-secret dummy hash.
        const ok = await bcrypt.compare(password, user?.passwordHash ?? "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW");
        if (!user?.passwordHash || !ok) return fail();
        if (!user.emailVerified) throw new EmailVerificationRequiredError();

        const known = await recognisedDevice(user.id);
        if (user.mfaSecretEncrypted) {
          const code = parsed.data.totp ?? "";
          if (!user.email) return null;
          if (!code) throw new MfaRequiredError();
          const validTotp = await consumeMfaCode(decryptMfaSecret(user.mfaSecretEncrypted), user.email, code);
          if (!validTotp && !(await consumeRecoveryCode(user.id, code))) return fail();
        } else if (!known && !justVerified(user.emailVerified) && user.email) {
          // Unusual sign-in: a browser this account hasn't used. Prove the inbox with an emailed code.
          const emailCode = parsed.data.emailCode ?? "";
          if (!emailCode) {
            await issueLoginCode({ id: user.id, email: user.email });
            throw new EmailCodeRequiredError();
          }
          if (!(await consumeLoginCode(user.id, emailCode))) return fail();
        }
        await rememberDevice(user.id, known);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account || account.provider === "credentials") return true;
      const email = user.email?.trim().toLowerCase();
      if (!email) return false;
      if (!(await providerVerifiedEmail(account.provider, profile, account.access_token, email))) return "/login?error=unverified_email";
      user.email = email;
      const existing = await prisma.user.findUnique({
        where: { email }, select: { passwordHash: true, emailVerified: true, isSuperAdmin: true },
      });
      // Super admins sign in with their email and the password set on the server, never through a provider.
      if (existing?.isSuperAdmin) return "/login?error=super_admin_password_only";
      // A pre-registered, unverified password must never survive linking to
      // the real inbox owner's provider identity.
      if (existing?.passwordHash && !existing.emailVerified) return false;

      const existingAccount = await prisma.account.findUnique({
        where: { provider_providerAccountId: { provider: account.provider, providerAccountId: account.providerAccountId } },
        select: { id: true },
      });
      if (existingAccount || existing) return true;

      // A verified provider identity may create an account only while the
      // instance-wide account-creation policy permits it. Returning true lets
      // Auth.js create the adapter user after this callback.
      if (!(await isNewUserRegistrationEnabled())) {
        return "/login?error=account_creation_disabled";
      }
      return true;
    },
    async jwt({ token, user }) {
      const userId = user?.id ?? token.sub;
      if (!userId) return null;

      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { sessionVersion: true },
      });
      if (!currentUser) return null;

      const sessionToken = token as typeof token & { authenticatedAt?: number; sessionVersion?: number; sessionRevoked?: boolean };
      if (user) {
        // Bind credentials to the version checked with the password. A reset
        // racing token issuance must not mint a fresh session from old proof.
        const verifiedVersion = (user as typeof user & { sessionVersion?: number }).sessionVersion;
        if (verifiedVersion !== undefined && verifiedVersion !== currentUser.sessionVersion) return null;
        token.sub = user.id;
        sessionToken.authenticatedAt = Date.now();
        sessionToken.sessionVersion = currentUser.sessionVersion;
        sessionToken.sessionRevoked = false;
      } else if (sessionToken.sessionRevoked || sessionToken.sessionVersion !== currentUser.sessionVersion) {
        // Auth.js clears the cookie and returns a genuinely anonymous session.
        return null;
      }
      return token;
    },
    session({ session, token }) {
      const sessionToken = token as typeof token & { authenticatedAt?: number; sessionRevoked?: boolean };
      if (session.user && token.sub && !sessionToken.sessionRevoked) session.user.id = token.sub;
      if (sessionToken.sessionRevoked && session.user) session.user.id = "";
      (session as typeof session & { authenticatedAt?: number }).authenticatedAt =
        sessionToken.authenticatedAt;
      return session;
    },
  },
  events: {
    async signIn({ user, account }) {
      if (account && account.provider !== "credentials" && user.id) {
        // Auth.js creates or links the adapter user after callbacks.signIn.
        await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
        // The provider proved the identity; still remember the browser and alert on a new one.
        await rememberDevice(user.id, await recognisedDevice(user.id));
      }
    },
  },
  };
});
