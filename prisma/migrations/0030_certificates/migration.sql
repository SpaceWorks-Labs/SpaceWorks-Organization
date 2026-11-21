-- Certificate generator: a design per certificate type (the card layer model at page size, with the same
-- owner-approved draft flow as card designs) and the certificates issued to members.

CREATE TABLE "CertificateDesign" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "typeLabel" TEXT NOT NULL,
  "pageSize" TEXT NOT NULL DEFAULT 'A4',
  "orientation" TEXT NOT NULL DEFAULT 'LANDSCAPE',
  "design" JSONB,
  "draft" JSONB,
  "draftUpdatedById" TEXT,
  "draftUpdatedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "numberPrefix" TEXT NOT NULL,
  "numberFormat" TEXT NOT NULL DEFAULT '{PREFIX}-{SEQ:4}',
  "archivedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CertificateDesign_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CertificateDesign_name_length" CHECK (char_length("name") BETWEEN 1 AND 80),
  CONSTRAINT "CertificateDesign_pageSize_known" CHECK ("pageSize" IN ('A4', 'LETTER')),
  CONSTRAINT "CertificateDesign_orientation_known" CHECK ("orientation" IN ('LANDSCAPE', 'PORTRAIT'))
);
CREATE UNIQUE INDEX "CertificateDesign_organisationId_id_key" ON "CertificateDesign"("organisationId", "id");
CREATE INDEX "CertificateDesign_organisationId_archivedAt_idx" ON "CertificateDesign"("organisationId", "archivedAt");
ALTER TABLE "CertificateDesign" ADD CONSTRAINT "CertificateDesign_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Certificate" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "designId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "certificateNumber" TEXT NOT NULL,
  "verifyToken" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "reason" TEXT,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "issuedById" TEXT,
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,
  "revokedReason" TEXT,
  "emailedAt" TIMESTAMP(3),
  CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Certificate_title_length" CHECK (char_length("title") BETWEEN 1 AND 120),
  CONSTRAINT "Certificate_reason_length" CHECK ("reason" IS NULL OR char_length("reason") <= 600),
  CONSTRAINT "Certificate_revoked_together" CHECK (("revokedAt" IS NULL) = ("revokedReason" IS NULL))
);
CREATE UNIQUE INDEX "Certificate_verifyToken_key" ON "Certificate"("verifyToken");
CREATE UNIQUE INDEX "Certificate_organisationId_id_key" ON "Certificate"("organisationId", "id");
CREATE UNIQUE INDEX "Certificate_organisationId_certificateNumber_key" ON "Certificate"("organisationId", "certificateNumber");
CREATE INDEX "Certificate_organisationId_designId_issuedAt_idx" ON "Certificate"("organisationId", "designId", "issuedAt");
CREATE INDEX "Certificate_organisationId_memberId_idx" ON "Certificate"("organisationId", "memberId");
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_organisationId_designId_fkey" FOREIGN KEY ("organisationId", "designId") REFERENCES "CertificateDesign"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_organisationId_memberId_fkey" FOREIGN KEY ("organisationId", "memberId") REFERENCES "Member"("organisationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Managers (the starter role) get the certificate permissions; the Owner holds every permission already.
UPDATE "OrgRole" SET "capabilities" = array_append("capabilities", 'certificates.issue')
WHERE "starterKey" = 'ADMIN' AND NOT ('certificates.issue' = ANY("capabilities"));
UPDATE "OrgRole" SET "capabilities" = array_append("capabilities", 'certificates.design')
WHERE "starterKey" = 'ADMIN' AND NOT ('certificates.design' = ANY("capabilities"));
