-- Indexes for the retention sweep, the membership sweep, the outbox and the member directory's search.

-- Retention deletes (lib/retention.ts) filter on these columns.
CREATE INDEX "Session_expires_idx" ON "Session"("expires");
CREATE INDEX "UserSession_lastSeenAt_idx" ON "UserSession"("lastSeenAt");
CREATE INDEX "UserSession_revokedAt_idx" ON "UserSession"("revokedAt");
CREATE INDEX "VerificationToken_expires_idx" ON "VerificationToken"("expires");
CREATE INDEX "TeamInvite_expiresAt_idx" ON "TeamInvite"("expiresAt");
CREATE INDEX "OutboxMessage_status_sentAt_idx" ON "OutboxMessage"("status", "sentAt");
CREATE INDEX "SmsCode_createdAt_idx" ON "SmsCode"("createdAt");

-- The membership sweep (lib/membership/sweep.ts) looks across all organisations for terms past a boundary.
CREATE INDEX "MembershipTerm_status_endsAt_idx" ON "MembershipTerm"("status", "endsAt");
CREATE INDEX "MembershipTerm_status_startsAt_idx" ON "MembershipTerm"("status", "startsAt");
CREATE INDEX "MembershipTerm_status_graceUntil_idx" ON "MembershipTerm"("status", "graceUntil");
CREATE INDEX "MembershipTerm_status_paymentDueBy_idx" ON "MembershipTerm"("status", "paymentDueBy");
CREATE INDEX "MembershipTerm_renewedFromId_status_idx" ON "MembershipTerm"("renewedFromId", "status");

-- Member directory search (ILIKE '%text%' on name and email, which Prisma's case-insensitive contains generates).
-- Not modelled in schema.prisma: Prisma cannot express operator classes.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Member_name_trgm_idx" ON "Member" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "Member_email_trgm_idx" ON "Member" USING GIN ("email" gin_trgm_ops);
