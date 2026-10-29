-- Expired stock in the daily rollup (H6), organisations' own member email wording (H8), and members uploading their
-- own card photo (H9).

-- AlterTable
ALTER TABLE "OrgDailyStats" ADD COLUMN     "expired" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "memberPhotoUpload" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "OrgEmailTemplate" (
    "organisationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgEmailTemplate_pkey" PRIMARY KEY ("organisationId","kind")
);

-- AddForeignKey
ALTER TABLE "OrgEmailTemplate" ADD CONSTRAINT "OrgEmailTemplate_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- Hand-written constraints -------------------------------------------------------------------------

ALTER TABLE "OrgEmailTemplate" ADD CONSTRAINT "OrgEmailTemplate_lengths" CHECK (length("subject") BETWEEN 1 AND 150 AND length("heading") BETWEEN 1 AND 150 AND length("body") BETWEEN 1 AND 5000);
