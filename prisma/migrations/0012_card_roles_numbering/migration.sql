-- Member role card designs, card number patterns, and owner approval of design changes.

-- AlterTable
ALTER TABLE "CardDesign" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "draft" JSONB,
ADD COLUMN     "draftUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "draftUpdatedById" TEXT,
ADD COLUMN     "numberFormat" TEXT NOT NULL DEFAULT '{PREFIX}-{SEQ:4}',
ADD COLUMN     "roleId" TEXT,
ALTER COLUMN "design" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CardDesign_organisationId_roleId_key" ON "CardDesign"("organisationId", "roleId");

-- CreateIndex
CREATE INDEX "MemberCard_organisationId_cardNumber_idx" ON "MemberCard"("organisationId", "cardNumber");

-- AddForeignKey
ALTER TABLE "CardDesign" ADD CONSTRAINT "CardDesign_organisationId_roleId_fkey" FOREIGN KEY ("organisationId", "roleId") REFERENCES "MemberRole"("organisationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written constraints -------------------------------------------------------------------------

-- The organisation default is the one row with neither a plan nor a role.
DROP INDEX "CardDesign_org_default_key";
CREATE UNIQUE INDEX "CardDesign_org_default_key" ON "CardDesign"("organisationId") WHERE "planId" IS NULL AND "roleId" IS NULL;

ALTER TABLE "CardDesign"
  ADD CONSTRAINT "CardDesign_one_scope" CHECK ("planId" IS NULL OR "roleId" IS NULL),
  -- A row is either approved (live), waiting for approval, or both.
  ADD CONSTRAINT "CardDesign_live_or_draft" CHECK ("design" IS NOT NULL OR "draft" IS NOT NULL),
  -- lib/cards/numbering.ts is the full check; the database keeps the running number in every pattern.
  ADD CONSTRAINT "CardDesign_number_format" CHECK (char_length("numberFormat") <= 40 AND "numberFormat" ~ '\{SEQ(:[1-8])?\}');

-- Designs saved before approval existed were live as saved: record them as approved.
UPDATE "CardDesign" SET "approvedAt" = "updatedAt", "approvedById" = "updatedById";

-- Numbers were the member number until now. The organisation's running card number starts above every
-- member number, so a new card never repeats one already printed.
INSERT INTO "OrgCounter" ("organisationId", "name", "next")
SELECT "organisationId", 'card', MAX("memberNumber") + 1 FROM "Member" GROUP BY "organisationId"
ON CONFLICT ("organisationId", "name") DO NOTHING;
