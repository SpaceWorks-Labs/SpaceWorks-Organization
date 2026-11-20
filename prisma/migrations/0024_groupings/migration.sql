-- Groupings: extra ways to divide members (list or tree), join-form questions that fill them, staff limits by
-- grouping value, and saved smart-group conditions.

ALTER TYPE "PlanFieldType" ADD VALUE IF NOT EXISTS 'GROUPING';

-- Composite targets for the tenant foreign keys below.
CREATE UNIQUE INDEX "TeamMember_organisationId_id_key" ON "TeamMember"("organisationId", "id");
CREATE UNIQUE INDEX "TeamInvite_organisationId_id_key" ON "TeamInvite"("organisationId", "id");

CREATE TABLE "OrgGrouping" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'list',
    "multiple" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrgGrouping_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OrgGrouping_kind_check" CHECK ("kind" IN ('list', 'tree'))
);
CREATE UNIQUE INDEX "OrgGrouping_organisationId_id_key" ON "OrgGrouping"("organisationId", "id");
CREATE UNIQUE INDEX "OrgGrouping_organisationId_key_key" ON "OrgGrouping"("organisationId", "key");
ALTER TABLE "OrgGrouping" ADD CONSTRAINT "OrgGrouping_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OrgGroupingValue" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "groupingId" TEXT NOT NULL,
    "parentId" TEXT,
    "label" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrgGroupingValue_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrgGroupingValue_organisationId_id_key" ON "OrgGroupingValue"("organisationId", "id");
CREATE UNIQUE INDEX "OrgGroupingValue_organisationId_groupingId_id_key" ON "OrgGroupingValue"("organisationId", "groupingId", "id");
CREATE UNIQUE INDEX "OrgGroupingValue_groupingId_code_key" ON "OrgGroupingValue"("groupingId", "code");
CREATE INDEX "OrgGroupingValue_organisationId_groupingId_path_idx" ON "OrgGroupingValue"("organisationId", "groupingId", "path");
ALTER TABLE "OrgGroupingValue" ADD CONSTRAINT "OrgGroupingValue_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrgGroupingValue" ADD CONSTRAINT "OrgGroupingValue_organisationId_groupingId_fkey" FOREIGN KEY ("organisationId", "groupingId") REFERENCES "OrgGrouping"("organisationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrgGroupingValue" ADD CONSTRAINT "OrgGroupingValue_organisationId_parentId_fkey" FOREIGN KEY ("organisationId", "parentId") REFERENCES "OrgGroupingValue"("organisationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE "MemberGroupingValue" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "groupingId" TEXT NOT NULL,
    "valueId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberGroupingValue_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MemberGroupingValue_memberId_valueId_key" ON "MemberGroupingValue"("memberId", "valueId");
CREATE INDEX "MemberGroupingValue_organisationId_groupingId_valueId_idx" ON "MemberGroupingValue"("organisationId", "groupingId", "valueId");
CREATE INDEX "MemberGroupingValue_memberId_idx" ON "MemberGroupingValue"("memberId");
ALTER TABLE "MemberGroupingValue" ADD CONSTRAINT "MemberGroupingValue_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberGroupingValue" ADD CONSTRAINT "MemberGroupingValue_organisationId_memberId_fkey" FOREIGN KEY ("organisationId", "memberId") REFERENCES "Member"("organisationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberGroupingValue" ADD CONSTRAINT "MemberGroupingValue_organisationId_groupingId_fkey" FOREIGN KEY ("organisationId", "groupingId") REFERENCES "OrgGrouping"("organisationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberGroupingValue" ADD CONSTRAINT "MemberGroupingValue_organisationId_groupingId_valueId_fkey" FOREIGN KEY ("organisationId", "groupingId", "valueId") REFERENCES "OrgGroupingValue"("organisationId", "groupingId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TeamMemberScope" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    "groupingId" TEXT NOT NULL,
    "valueId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamMemberScope_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TeamMemberScope_teamMemberId_valueId_key" ON "TeamMemberScope"("teamMemberId", "valueId");
CREATE INDEX "TeamMemberScope_organisationId_teamMemberId_idx" ON "TeamMemberScope"("organisationId", "teamMemberId");
ALTER TABLE "TeamMemberScope" ADD CONSTRAINT "TeamMemberScope_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMemberScope" ADD CONSTRAINT "TeamMemberScope_organisationId_teamMemberId_fkey" FOREIGN KEY ("organisationId", "teamMemberId") REFERENCES "TeamMember"("organisationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMemberScope" ADD CONSTRAINT "TeamMemberScope_organisationId_groupingId_fkey" FOREIGN KEY ("organisationId", "groupingId") REFERENCES "OrgGrouping"("organisationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "TeamMemberScope" ADD CONSTRAINT "TeamMemberScope_organisationId_groupingId_valueId_fkey" FOREIGN KEY ("organisationId", "groupingId", "valueId") REFERENCES "OrgGroupingValue"("organisationId", "groupingId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE "TeamInviteScope" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "teamInviteId" TEXT NOT NULL,
    "groupingId" TEXT NOT NULL,
    "valueId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamInviteScope_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TeamInviteScope_teamInviteId_valueId_key" ON "TeamInviteScope"("teamInviteId", "valueId");
CREATE INDEX "TeamInviteScope_organisationId_teamInviteId_idx" ON "TeamInviteScope"("organisationId", "teamInviteId");
ALTER TABLE "TeamInviteScope" ADD CONSTRAINT "TeamInviteScope_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamInviteScope" ADD CONSTRAINT "TeamInviteScope_organisationId_teamInviteId_fkey" FOREIGN KEY ("organisationId", "teamInviteId") REFERENCES "TeamInvite"("organisationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamInviteScope" ADD CONSTRAINT "TeamInviteScope_organisationId_groupingId_fkey" FOREIGN KEY ("organisationId", "groupingId") REFERENCES "OrgGrouping"("organisationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "TeamInviteScope" ADD CONSTRAINT "TeamInviteScope_organisationId_groupingId_valueId_fkey" FOREIGN KEY ("organisationId", "groupingId", "valueId") REFERENCES "OrgGroupingValue"("organisationId", "groupingId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE "SmartGroup" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "condition" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SmartGroup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SmartGroup_organisationId_id_key" ON "SmartGroup"("organisationId", "id");
CREATE UNIQUE INDEX "SmartGroup_organisationId_name_key" ON "SmartGroup"("organisationId", "name");
ALTER TABLE "SmartGroup" ADD CONSTRAINT "SmartGroup_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SmartGroup" ADD CONSTRAINT "SmartGroup_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlanField" ADD COLUMN "groupingId" TEXT;
ALTER TABLE "PlanField" ADD CONSTRAINT "PlanField_organisationId_groupingId_fkey" FOREIGN KEY ("organisationId", "groupingId") REFERENCES "OrgGrouping"("organisationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Managers (the starter role) get the new permission; the Owner holds every permission already.
UPDATE "OrgRole" SET "capabilities" = array_append("capabilities", 'groupings.manage')
WHERE "starterKey" = 'ADMIN' AND NOT ('groupings.manage' = ANY("capabilities"));
