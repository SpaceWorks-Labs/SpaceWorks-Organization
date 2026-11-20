-- Member messaging (0.10.0): channel settings at platform and organisation level, personal endpoints, consent,
-- delivery log, routing and quiet hours, WhatsApp templates, and short text for every message kind.

ALTER TABLE "InstanceSetting" ADD COLUMN "messagingOrgsMayUsePlatform" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "OrgEmailTemplate" ADD COLUMN "shortText" TEXT NOT NULL DEFAULT '';
ALTER TABLE "OrgEmailTemplate" ADD CONSTRAINT "OrgEmailTemplate_short_length" CHECK (length("shortText") <= 1000);

ALTER TABLE "ChatChannel" DROP CONSTRAINT "ChatChannel_events_known";
ALTER TABLE "ChatChannel" ADD CONSTRAINT "ChatChannel_events_known" CHECK ("events" <@ ARRAY['application', 'payment', 'payment-to-confirm', 'refund-requested', 'erasure-requested', 'member-left', 'monthly-summary', 'reminders-digest']::text[]);

CREATE TABLE "MessagingChannel" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT,
  "channel" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "configEncrypted" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "verifiedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessagingChannel_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MessagingChannel_channel_known" CHECK ("channel" IN ('SMS', 'WHATSAPP', 'TELEGRAM', 'SLACK', 'DISCORD', 'MATTERMOST'))
);
CREATE UNIQUE INDEX "MessagingChannel_organisationId_channel_key" ON "MessagingChannel"("organisationId", "channel");
CREATE UNIQUE INDEX "MessagingChannel_platform_channel_key" ON "MessagingChannel"("channel") WHERE "organisationId" IS NULL;
ALTER TABLE "MessagingChannel" ADD CONSTRAINT "MessagingChannel_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OrgMessagingSettings" (
  "organisationId" TEXT NOT NULL,
  "routing" JSONB NOT NULL DEFAULT '{}',
  "quietStartMinute" INTEGER,
  "quietEndMinute" INTEGER,
  "lastDigestOn" DATE,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrgMessagingSettings_pkey" PRIMARY KEY ("organisationId"),
  CONSTRAINT "OrgMessagingSettings_quiet_range" CHECK (("quietStartMinute" IS NULL AND "quietEndMinute" IS NULL) OR ("quietStartMinute" BETWEEN 0 AND 1439 AND "quietEndMinute" BETWEEN 0 AND 1439 AND "quietStartMinute" <> "quietEndMinute"))
);
ALTER TABLE "OrgMessagingSettings" ADD CONSTRAINT "OrgMessagingSettings_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WhatsAppTemplate" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT,
  "kind" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "variables" TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppTemplate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WhatsAppTemplate_name_length" CHECK (char_length("name") BETWEEN 1 AND 200),
  CONSTRAINT "WhatsAppTemplate_variables_count" CHECK (cardinality("variables") <= 10)
);
CREATE UNIQUE INDEX "WhatsAppTemplate_organisationId_kind_language_key" ON "WhatsAppTemplate"("organisationId", "kind", "language");
CREATE UNIQUE INDEX "WhatsAppTemplate_platform_kind_language_key" ON "WhatsAppTemplate"("kind", "language") WHERE "organisationId" IS NULL;
ALTER TABLE "WhatsAppTemplate" ADD CONSTRAINT "WhatsAppTemplate_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NotificationEndpoint" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organisationId" TEXT,
  "channel" TEXT NOT NULL,
  "identityDigest" TEXT NOT NULL,
  "identityEncrypted" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationEndpoint_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationEndpoint_channel_known" CHECK ("channel" IN ('SMS', 'WHATSAPP', 'TELEGRAM', 'SLACK', 'DISCORD', 'MATTERMOST'))
);
CREATE INDEX "NotificationEndpoint_userId_idx" ON "NotificationEndpoint"("userId");
-- One live endpoint per person, scope and channel; one live person per identity, scope and channel.
CREATE UNIQUE INDEX "NotificationEndpoint_live_user_key" ON "NotificationEndpoint"("userId", COALESCE("organisationId", ''), "channel") WHERE "revokedAt" IS NULL;
CREATE UNIQUE INDEX "NotificationEndpoint_live_identity_key" ON "NotificationEndpoint"(COALESCE("organisationId", ''), "channel", "identityDigest") WHERE "revokedAt" IS NULL;
ALTER TABLE "NotificationEndpoint" ADD CONSTRAINT "NotificationEndpoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationEndpoint" ADD CONSTRAINT "NotificationEndpoint_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NotificationEndpointChallenge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organisationId" TEXT,
  "channel" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationEndpointChallenge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NotificationEndpointChallenge_userId_idx" ON "NotificationEndpointChallenge"("userId");
CREATE INDEX "NotificationEndpointChallenge_expiresAt_idx" ON "NotificationEndpointChallenge"("expiresAt");
ALTER TABLE "NotificationEndpointChallenge" ADD CONSTRAINT "NotificationEndpointChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationEndpointChallenge" ADD CONSTRAINT "NotificationEndpointChallenge_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MessagingConsent" (
  "organisationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessagingConsent_pkey" PRIMARY KEY ("organisationId", "userId", "channel"),
  CONSTRAINT "MessagingConsent_status_known" CHECK ("status" IN ('OPTED_IN', 'STOPPED'))
);
ALTER TABLE "MessagingConsent" ADD CONSTRAINT "MessagingConsent_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessagingConsent" ADD CONSTRAINT "MessagingConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MemberMessageLog" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "channel" TEXT,
  "refused" TEXT[],
  "providerRef" TEXT,
  "deliveryState" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MemberMessageLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MemberMessageLog_status_known" CHECK ("status" IN ('PENDING', 'SENT', 'FAILED'))
);
CREATE UNIQUE INDEX "MemberMessageLog_organisationId_memberId_dedupeKey_key" ON "MemberMessageLog"("organisationId", "memberId", "dedupeKey");
CREATE INDEX "MemberMessageLog_providerRef_idx" ON "MemberMessageLog"("providerRef");
CREATE INDEX "MemberMessageLog_createdAt_idx" ON "MemberMessageLog"("createdAt");
ALTER TABLE "MemberMessageLog" ADD CONSTRAINT "MemberMessageLog_organisationId_memberId_fkey" FOREIGN KEY ("organisationId", "memberId") REFERENCES "Member"("organisationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
