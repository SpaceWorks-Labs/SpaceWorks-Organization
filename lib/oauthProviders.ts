import "server-only";

import { importPKCS8, SignJWT } from "jose";
import { prisma } from "@/lib/db";
import { INSTANCE_SETTINGS_ID } from "@/lib/instanceSettings";
import { decryptInstanceConfigSecret } from "@/lib/instanceConfigSecrets";

/** Sign-in providers this instance can offer besides email and password. */
type OAuthProviderId = "google" | "github" | "apple";

type OAuthSettings = {
  google: { clientId: string; clientSecret: string } | null;
  github: { clientId: string; clientSecret: string } | null;
  apple: { clientId: string; clientSecret: string } | null;
};

const decrypt = (value: string | null | undefined) => (value ? decryptInstanceConfigSecret(value) : undefined);

/**
 * Apple's client secret is a short-lived JWT signed with the team's .p8 key (ES256). We mint one valid for
 * 150 days on each configuration load; Apple accepts up to six months.
 */
async function appleClientSecret(teamId: string, clientId: string, keyId: string, privateKey: string) {
  const key = await importPKCS8(privateKey.replace(/\\n/g, "\n"), "ES256");
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(now)
    .setExpirationTime(now + 150 * 86_400)
    .setAudience("https://appleid.apple.com")
    .setSubject(clientId)
    .sign(key);
}

/** Configured providers, from instance settings first and environment variables second. */
export async function getOAuthSettings(): Promise<OAuthSettings> {
  const settings = await prisma.instanceSetting.findUnique({
    where: { id: INSTANCE_SETTINGS_ID },
    select: {
      googleClientId: true, googleClientSecretEncrypted: true,
      githubClientId: true, githubClientSecretEncrypted: true,
      appleClientId: true, appleTeamId: true, appleKeyId: true, applePrivateKeyEncrypted: true,
    },
  });
  const env = process.env;

  const googleId = settings?.googleClientId ?? env.AUTH_GOOGLE_ID ?? env.GOOGLE_CLIENT_ID;
  const googleSecret = decrypt(settings?.googleClientSecretEncrypted) ?? env.AUTH_GOOGLE_SECRET ?? env.GOOGLE_CLIENT_SECRET;
  const githubId = settings?.githubClientId ?? env.AUTH_GITHUB_ID;
  const githubSecret = decrypt(settings?.githubClientSecretEncrypted) ?? env.AUTH_GITHUB_SECRET;

  const appleId = settings?.appleClientId ?? env.AUTH_APPLE_ID;
  const appleTeam = settings?.appleTeamId ?? env.AUTH_APPLE_TEAM_ID;
  const appleKey = settings?.appleKeyId ?? env.AUTH_APPLE_KEY_ID;
  const applePrivate = decrypt(settings?.applePrivateKeyEncrypted) ?? env.AUTH_APPLE_PRIVATE_KEY;
  let apple: OAuthSettings["apple"] = null;
  if (appleId && appleTeam && appleKey && applePrivate) {
    try {
      apple = { clientId: appleId, clientSecret: await appleClientSecret(appleTeam, appleId, appleKey, applePrivate) };
    } catch {
      // A malformed key leaves Apple sign-in off rather than breaking every sign-in.
      console.error("[auth] Apple sign-in key could not be read");
    }
  }

  return {
    google: googleId && googleSecret ? { clientId: googleId, clientSecret: googleSecret } : null,
    github: githubId && githubSecret ? { clientId: githubId, clientSecret: githubSecret } : null,
    apple,
  };
}

/** Which providers are on, for the sign-in page. Never exposes secrets. */
export async function enabledOAuthProviders(): Promise<OAuthProviderId[]> {
  const settings = await getOAuthSettings();
  return (["google", "apple", "github"] as const).filter((id) => settings[id] !== null);
}

/**
 * Whether the provider vouches for the email it returned. Only a verified email may create or link an
 * account, because accounts link by email.
 */
export async function providerVerifiedEmail(provider: string, profile: unknown, accessToken: string | undefined, email: string): Promise<boolean> {
  const claims = (profile ?? {}) as Record<string, unknown>;
  if (provider === "google") return claims.email_verified === true;
  // Apple sends the claim as a boolean or the string "true".
  if (provider === "apple") return claims.email_verified === true || claims.email_verified === "true";
  if (provider === "github") {
    if (!accessToken) return false;
    try {
      const response = await fetch("https://api.github.com/user/emails", {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json", "User-Agent": "space-works-organization" },
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) return false;
      const emails = (await response.json()) as Array<{ email: string; verified: boolean }>;
      return emails.some((entry) => entry.verified && entry.email.toLowerCase() === email);
    } catch {
      return false;
    }
  }
  return false;
}
