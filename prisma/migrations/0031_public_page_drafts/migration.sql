-- Public page: who published and when the draft was last saved, and a short history of published versions.
ALTER TABLE "OrganisationPage" ADD COLUMN "publishedById" TEXT;
ALTER TABLE "OrganisationPage" ADD COLUMN "draftSavedAt" TIMESTAMP(3);
ALTER TABLE "OrganisationPage" ADD COLUMN "draftSavedById" TEXT;

CREATE TABLE "OrganisationPageVersion" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "document" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "publishedById" TEXT,
    CONSTRAINT "OrganisationPageVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrganisationPageVersion_organisationId_publishedAt_idx" ON "OrganisationPageVersion"("organisationId", "publishedAt" DESC);

ALTER TABLE "OrganisationPageVersion" ADD CONSTRAINT "OrganisationPageVersion_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
