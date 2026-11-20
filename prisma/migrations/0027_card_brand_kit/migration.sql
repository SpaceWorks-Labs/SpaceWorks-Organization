-- Card brand kit (one per organisation): logo variants, colours and preferred card fonts for the card designer.

CREATE TABLE "CardBrandKit" (
  "organisationId" TEXT NOT NULL,
  "kit" JSONB NOT NULL DEFAULT '{}',
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CardBrandKit_pkey" PRIMARY KEY ("organisationId"),
  CONSTRAINT "CardBrandKit_kit_object" CHECK (jsonb_typeof("kit") = 'object'),
  CONSTRAINT "CardBrandKit_kit_size" CHECK (octet_length("kit"::text) <= 16384)
);
ALTER TABLE "CardBrandKit" ADD CONSTRAINT "CardBrandKit_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
