-- Card designer extras: version history per card design (drafts coalesced, every approval kept, at most 30
-- per design) and organisation card templates (at most 50 per organisation, enforced in the application).

CREATE TABLE "CardDesignVersion" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "cardDesignId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "design" JSONB NOT NULL,
  "numberPrefix" TEXT NOT NULL,
  "numberFormat" TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CardDesignVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CardDesignVersion_kind_known" CHECK ("kind" IN ('DRAFT', 'APPROVED'))
);
CREATE INDEX "CardDesignVersion_organisationId_cardDesignId_createdAt_idx" ON "CardDesignVersion"("organisationId", "cardDesignId", "createdAt");
ALTER TABLE "CardDesignVersion" ADD CONSTRAINT "CardDesignVersion_organisationId_cardDesignId_fkey" FOREIGN KEY ("organisationId", "cardDesignId") REFERENCES "CardDesign"("organisationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CardTemplate" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "design" JSONB NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CardTemplate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CardTemplate_name_length" CHECK (char_length("name") BETWEEN 1 AND 60)
);
CREATE INDEX "CardTemplate_organisationId_createdAt_idx" ON "CardTemplate"("organisationId", "createdAt");
ALTER TABLE "CardTemplate" ADD CONSTRAINT "CardTemplate_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
