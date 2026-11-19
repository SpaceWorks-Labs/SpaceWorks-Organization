import { requireSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { isNewUserRegistrationEnabled } from "@/lib/instanceSettings";
import { oidcProviderId } from "@/lib/oidc/providers";
import { loadLoginMethods, loginConfigSources } from "@/lib/loginMethods";
import { loginMethodsFromEnv } from "@/lib/loginMethodsCore";
import { samlUrls } from "@/lib/saml/service";

export async function loadSuperAdminAuthView() {
  await requireSuperAdmin();
  const [methods, sources] = await Promise.all([loadLoginMethods(), loginConfigSources()]);
  const loginRows = methods.statuses.map((status) => ({ method: status.method, state: status.state, source: sources[status.method] }));
  const base = (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/$/, "");
  const [oidcRows, samlRows] = await Promise.all([
    prisma.oidcProvider.findMany({ orderBy: { name: "asc" }, select: { id: true, slug: true, name: true, issuer: true, clientId: true, scopes: true, enabled: true } }),
    prisma.samlProvider.findMany({ orderBy: { name: "asc" }, select: { id: true, slug: true, name: true, entityId: true, ssoUrl: true, idpCertificate: true, spEntityId: true, enabled: true, wantAssertionsSigned: true } }),
  ]);
  // Client secrets are write-only: they are never selected, so they cannot reach the page.
  const oidcProviders = oidcRows.map((row) => ({ ...row, callbackUrl: `${base}/api/auth/callback/${oidcProviderId(row.id)}` }));
  const samlProviders = samlRows.map((row) => ({ ...row, acsUrl: samlUrls(row.slug).acs, metadataUrl: samlUrls(row.slug).metadata }));
  const [accountsCount, sessionsCount, tokensCount, accountCreationEnabled] = await Promise.all([
    prisma.account.count(),
    prisma.session.count(),
    prisma.verificationToken.count(),
    isNewUserRegistrationEnabled(),
  ]);
  const [accounts, sessions, tokens] = await Promise.all([
    prisma.account.findMany({
      orderBy: { id: "desc" },
      take: 50,
      select: {
        id: true,
        provider: true,
        type: true,
        providerAccountId: true,
        user: { select: { id: true, email: true } },
      },
    }),
    prisma.session.findMany({
      orderBy: { expires: "desc" },
      take: 50,
      select: {
        id: true,
        expires: true,
        user: { select: { id: true, email: true } },
      },
    }),
    prisma.verificationToken.findMany({
      orderBy: { expires: "desc" },
      take: 50,
      select: { identifier: true, expires: true },
    }),
  ]);
  return { oidcProviders, samlProviders, loginRows, loginSwitches: methods.switches, loginSetByServer: loginMethodsFromEnv() !== null, accountsCount, sessionsCount, tokensCount, accountCreationEnabled, accounts, sessions, tokens };
}
