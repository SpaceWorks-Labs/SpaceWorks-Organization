ALTER TABLE "InstanceSetting"
  ADD COLUMN "webTelemetry" JSONB,
  ADD COLUMN "passwordSignIn" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "googleSignIn" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "appleSignIn" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "githubSignIn" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "supabaseSignIn" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "firebaseSignIn" BOOLEAN NOT NULL DEFAULT false;


ALTER TABLE "Organisation"
  ADD COLUMN "delightEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "webTelemetry" JSONB;

CREATE TABLE "WebVisitDaily" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT,
  "day" DATE NOT NULL,
  "route" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'web',
  "count" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "WebVisitDaily_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebVisitDaily_day_idx" ON "WebVisitDaily"("day");

CREATE UNIQUE INDEX "WebVisitDaily_organisationId_day_route_channel_key" ON "WebVisitDaily"("organisationId", "day", "route", "channel");

CREATE UNIQUE INDEX "WebVisitDaily_platform_key" ON "WebVisitDaily"("day", "route", "channel") WHERE "organisationId" IS NULL;

ALTER TABLE "WebVisitDaily" ADD CONSTRAINT "WebVisitDaily_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One account per staff invite while new sign-ups are off (lib/inviteSignup.ts).
ALTER TABLE "TeamInvite" ADD COLUMN "signupEmail" TEXT;

-- Email providers (SMTP, Amazon SES, Resend, Postmark), the suppression list and the signed webhook chat kind (product rules §16).
ALTER TABLE "InstanceSetting"
  ADD COLUMN "emailProvider" TEXT,
  ADD COLUMN "emailProviderConfigEncrypted" TEXT,
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "emailLastError" TEXT;

ALTER TABLE "OrgEmailSettings"
  ADD COLUMN "emailProvider" TEXT NOT NULL DEFAULT 'smtp',
  ADD COLUMN "providerConfigEncrypted" TEXT;

ALTER TYPE "ChatChannelKind" ADD VALUE 'WEBHOOK';

CREATE TYPE "EmailSuppressionReason" AS ENUM ('BOUNCE', 'COMPLAINT');

CREATE TABLE "EmailSuppression" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT,
  "address" TEXT NOT NULL,
  "reason" "EmailSuppressionReason" NOT NULL,
  "provider" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailSuppression_createdAt_idx" ON "EmailSuppression"("createdAt");

CREATE UNIQUE INDEX "EmailSuppression_organisationId_address_key" ON "EmailSuppression"("organisationId", "address");

CREATE UNIQUE INDEX "EmailSuppression_platform_key" ON "EmailSuppression"("address") WHERE "organisationId" IS NULL;

ALTER TABLE "EmailSuppression" ADD CONSTRAINT "EmailSuppression_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Sign-in and identity (D1a, product rules §15) ───────────────────────────
-- Every method except password is off by default. Existing installs keep working: a provider whose client id is already
-- stored is switched on. (Providers configured only through the environment must be switched on after upgrading; see
-- docs/release-0.9.0.md.)
ALTER TABLE "InstanceSetting"
  ADD COLUMN "oidcSignIn" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "samlSignIn" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "passkeySignIn" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "phoneSignIn" BOOLEAN NOT NULL DEFAULT false;

UPDATE "InstanceSetting" SET
  "googleSignIn" = ("googleClientId" IS NOT NULL AND "googleClientId" <> ''),
  "githubSignIn" = ("githubClientId" IS NOT NULL AND "githubClientId" <> ''),
  "appleSignIn" = ("appleClientId" IS NOT NULL AND "appleClientId" <> '');

CREATE TABLE "OidcProvider" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "issuer" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "clientSecretEncrypted" TEXT NOT NULL,
  "scopes" TEXT NOT NULL DEFAULT 'openid email profile',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OidcProvider_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OidcProvider_slug_key" ON "OidcProvider"("slug");

CREATE TABLE "SamlProvider" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "ssoUrl" TEXT NOT NULL,
  "idpCertificate" TEXT NOT NULL,
  "spEntityId" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "wantAssertionsSigned" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SamlProvider_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SamlProvider_slug_key" ON "SamlProvider"("slug");

CREATE TABLE "SamlLoginState" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SamlLoginState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SamlLoginState_key_key" ON "SamlLoginState"("key");

CREATE INDEX "SamlLoginState_expiresAt_idx" ON "SamlLoginState"("expiresAt");

ALTER TABLE "SamlLoginState" ADD CONSTRAINT "SamlLoginState_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "SamlProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- D1b: server-side sessions and signed-in devices (product rules section 15, Sessions). One row per sign-in; the JWT
-- carries its id and every request checks it.
CREATE TABLE "UserSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "sessionVersion" INTEGER NOT NULL DEFAULT 0,
  "userAgent" TEXT NOT NULL DEFAULT '',
  "ipPrefix" TEXT,
  "method" TEXT NOT NULL,
  "knownDeviceId" TEXT,

  CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserSession_userId_revokedAt_lastSeenAt_idx" ON "UserSession"("userId", "revokedAt", "lastSeenAt");

ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_knownDeviceId_fkey" FOREIGN KEY ("knownDeviceId") REFERENCES "KnownDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Phone code by SMS sign-in (product rules sections 15 and 16): a verified number on the account, the SMS provider
-- settings, and the code and send log the limits count.
ALTER TABLE "User" ADD COLUMN "phoneE164" TEXT, ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_phoneE164_key" ON "User"("phoneE164");

ALTER TABLE "InstanceSetting" ADD COLUMN "smsProvider" TEXT, ADD COLUMN "smsConfigEncrypted" TEXT, ADD COLUMN "smsVerifiedAt" TIMESTAMP(3), ADD COLUMN "smsLastError" TEXT;

CREATE TABLE "SmsCode" (
  "id" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "userId" TEXT,
  "phoneHash" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "codeHash" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "providerRef" TEXT,
  "deliveryState" TEXT,
  "deliveryError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SmsCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SmsCode_phoneHash_createdAt_idx" ON "SmsCode"("phoneHash", "createdAt");

CREATE INDEX "SmsCode_country_createdAt_idx" ON "SmsCode"("country", "createdAt");

CREATE INDEX "SmsCode_providerRef_idx" ON "SmsCode"("providerRef");

CREATE INDEX "SmsCode_expiresAt_idx" ON "SmsCode"("expiresAt");

-- Passkeys (WebAuthn, product rules section 15). A credential is registered from a signed-in session; only the public
-- key is stored. Challenges are single use and expire after five minutes.
CREATE TABLE "Passkey" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "publicKey" BYTEA NOT NULL,
  "counter" BIGINT NOT NULL DEFAULT 0,
  "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "deviceType" TEXT NOT NULL,
  "backedUp" BOOLEAN NOT NULL DEFAULT false,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),

  CONSTRAINT "Passkey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Passkey_credentialId_key" ON "Passkey"("credentialId");

CREATE INDEX "Passkey_userId_idx" ON "Passkey"("userId");

ALTER TABLE "Passkey" ADD CONSTRAINT "Passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PasskeyChallenge" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "challenge" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PasskeyChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasskeyChallenge_key_key" ON "PasskeyChallenge"("key");

CREATE INDEX "PasskeyChallenge_expiresAt_idx" ON "PasskeyChallenge"("expiresAt");
