-- Custom staff roles. Each organisation defines its roles from the fixed permission list in lib/permissionRoles.ts;
-- where someone holds a role (the whole organisation or one unit's subtree) stays on the grant (TeamMember.unitId).
-- Expand step: TeamMember.role and TeamInvite.role stay and are still written (the nearest starter role that grants
-- no more), so an update rollback keeps working. A later release drops them.

-- CreateTable
CREATE TABLE "OrgRole" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgRole_organisationId_id_key" ON "OrgRole"("organisationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "OrgRole_organisationId_name_key" ON "OrgRole"("organisationId", "name");

-- AddForeignKey
ALTER TABLE "OrgRole" ADD CONSTRAINT "OrgRole_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "TeamMember" ADD COLUMN "roleId" TEXT;

-- AlterTable
ALTER TABLE "TeamInvite" ADD COLUMN "roleId" TEXT,
ADD COLUMN "unitId" TEXT;

-- Starter roles for every organisation, matching what the fixed roles allowed. The Owner role's permissions are
-- implied (every permission), so its list stays empty.
INSERT INTO "OrgRole" ("id", "organisationId", "name", "description", "capabilities", "isOwner", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, o."id", s."name", s."description", s."capabilities", s."isOwner", s."sortOrder", CURRENT_TIMESTAMP
FROM "Organisation" o
CROSS JOIN (VALUES
  ('Owner', 'Everything, including the team, roles and deleting the organisation.', ARRAY[]::TEXT[], true, 0),
  ('Manager', 'Plans, members, approvals, cards, payments and settings.', ARRAY['org.view','members.view','reports.membership','members.contact','members.export','payments.view','payments.manage','reports.finance','members.manage','cards.manage','audit.view','erasure.decide','team.manage','plans.manage','payments.settings','org.settings','structure.manage','cards.design','accounts.manage','reports.gstr1'], false, 1),
  ('Treasurer', 'Payments, receipts and finance reports. Reads members.', ARRAY['org.view','members.view','reports.membership','members.contact','members.export','payments.view','payments.manage','reports.finance','accounts.manage','reports.gstr1'], false, 2),
  ('Viewer', 'Reads members and membership reports. Contact details are hidden.', ARRAY['org.view','members.view','reports.membership'], false, 3)
) AS s("name", "description", "capabilities", "isOwner", "sortOrder");

UPDATE "TeamMember" t SET "roleId" = r."id"
FROM "OrgRole" r
WHERE r."organisationId" = t."organisationId"
  AND r."name" = CASE t."role" WHEN 'OWNER' THEN 'Owner' WHEN 'ADMIN' THEN 'Manager' WHEN 'TREASURER' THEN 'Treasurer' ELSE 'Viewer' END;

UPDATE "TeamInvite" i SET "roleId" = r."id"
FROM "OrgRole" r
WHERE r."organisationId" = i."organisationId"
  AND r."name" = CASE i."role" WHEN 'OWNER' THEN 'Owner' WHEN 'ADMIN' THEN 'Manager' WHEN 'TREASURER' THEN 'Treasurer' ELSE 'Viewer' END;

ALTER TABLE "TeamMember" ALTER COLUMN "roleId" SET NOT NULL;
ALTER TABLE "TeamInvite" ALTER COLUMN "roleId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "TeamMember_organisationId_roleId_idx" ON "TeamMember"("organisationId", "roleId");

-- CreateIndex
CREATE INDEX "TeamInvite_organisationId_roleId_idx" ON "TeamInvite"("organisationId", "roleId");

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_organisationId_roleId_fkey" FOREIGN KEY ("organisationId", "roleId") REFERENCES "OrgRole"("organisationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TeamInvite" ADD CONSTRAINT "TeamInvite_organisationId_roleId_fkey" FOREIGN KEY ("organisationId", "roleId") REFERENCES "OrgRole"("organisationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TeamInvite" ADD CONSTRAINT "TeamInvite_organisationId_unitId_fkey" FOREIGN KEY ("organisationId", "unitId") REFERENCES "OrgUnit"("organisationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Hand-written constraints -------------------------------------------------------------------------

-- One Owner role per organisation, and it never carries a unit-scoped grant.
CREATE UNIQUE INDEX "OrgRole_one_owner_key" ON "OrgRole"("organisationId") WHERE "isOwner";
