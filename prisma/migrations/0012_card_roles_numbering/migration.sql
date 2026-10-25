-- Member role card designs and card number patterns.

-- AlterTable
ALTER TABLE "CardDesign" ADD COLUMN     "numberFormat" TEXT NOT NULL DEFAULT '{PREFIX}-{SEQ:4}',
ADD COLUMN     "roleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CardDesign_organisationId_roleId_key" ON "CardDesign"("organisationId", "roleId");

-- AddForeignKey
ALTER TABLE "CardDesign" ADD CONSTRAINT "CardDesign_organisationId_roleId_fkey" FOREIGN KEY ("organisationId", "roleId") REFERENCES "MemberRole"("organisationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written constraints -------------------------------------------------------------------------

-- The organisation default is the one row with neither a plan nor a role.
DROP INDEX "CardDesign_org_default_key";
CREATE UNIQUE INDEX "CardDesign_org_default_key" ON "CardDesign"("organisationId") WHERE "planId" IS NULL AND "roleId" IS NULL;

ALTER TABLE "CardDesign"
  ADD CONSTRAINT "CardDesign_one_scope" CHECK ("planId" IS NULL OR "roleId" IS NULL),
  -- lib/cards/numbering.ts is the full check; the database keeps the running number in every pattern.
  ADD CONSTRAINT "CardDesign_number_format" CHECK (char_length("numberFormat") <= 40 AND "numberFormat" ~ '\{SEQ(:[1-8])?\}');

-- Numbers were the member number until now. The organisation's running card number starts above every
-- member number, so a new card never repeats one already printed.
INSERT INTO "OrgCounter" ("organisationId", "name", "next")
SELECT "organisationId", 'card', MAX("memberNumber") + 1 FROM "Member" GROUP BY "organisationId"
ON CONFLICT ("organisationId", "name") DO NOTHING;
