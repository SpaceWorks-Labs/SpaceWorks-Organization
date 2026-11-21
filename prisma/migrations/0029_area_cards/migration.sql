-- Per-area cards and contacts: an area (OrgUnit) can have its own card design, card numbering and contact
-- details. Everything is optional; organisations that set nothing per area see no change.

-- An area's own contact details (each empty one falls back to the unit above, then the organisation).
ALTER TABLE "OrgUnit" ADD COLUMN "contactEmail" TEXT;
ALTER TABLE "OrgUnit" ADD COLUMN "contactPhone" TEXT;
ALTER TABLE "OrgUnit" ADD COLUMN "website" TEXT;

-- A card design can belong to an area, like a plan or a role design.
ALTER TABLE "CardDesign" ADD COLUMN "unitId" TEXT;
CREATE UNIQUE INDEX "CardDesign_organisationId_unitId_key" ON "CardDesign"("organisationId", "unitId");
ALTER TABLE "CardDesign" ADD CONSTRAINT "CardDesign_organisationId_unitId_fkey"
  FOREIGN KEY ("organisationId", "unitId") REFERENCES "OrgUnit"("organisationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A design belongs to the organisation, or to exactly one of a plan, a role or an area.
ALTER TABLE "CardDesign" ADD CONSTRAINT "CardDesign_one_scope_check"
  CHECK (num_nonnulls("planId", "roleId", "unitId") <= 1);

-- The organisation default is the one design with no plan, role or area (area rows must not collide with it).
DROP INDEX "CardDesign_org_default_key";
CREATE UNIQUE INDEX "CardDesign_org_default_key" ON "CardDesign"("organisationId") WHERE "planId" IS NULL AND "roleId" IS NULL AND "unitId" IS NULL;
