-- Rollback safety for the hierarchy and roles release. `scripts/update.sh --rollback` swaps containers but keeps this
-- schema, so the previous release must keep working against it: it writes team members and invites with only the
-- fixed `role`, changes `role` alone, and creates units without a code. These triggers fill in what it leaves out.
-- They are dropped with the fixed role columns in a later release.

-- AlterTable
ALTER TABLE "OrgRole" ADD COLUMN "starterKey" "TeamRole";

-- The four starter roles each organisation was given in 0014 (or since, by the application).
UPDATE "OrgRole" SET "starterKey" = (CASE "name" WHEN 'Owner' THEN 'OWNER' WHEN 'Manager' THEN 'ADMIN' WHEN 'Treasurer' THEN 'TREASURER' ELSE 'VIEWER' END)::"TeamRole"
WHERE "name" IN ('Owner', 'Manager', 'Treasurer', 'Viewer') AND ("name" = 'Owner') = "isOwner";

-- CreateIndex
CREATE UNIQUE INDEX "OrgRole_organisationId_starterKey_key" ON "OrgRole"("organisationId", "starterKey") WHERE "starterKey" IS NOT NULL;


-- Hand-written functions and triggers ------------------------------------------------------------------

-- The starter role for a fixed role, creating the organisation's starter roles first if it has none (an organisation
-- created by the previous release). The lists match STARTER_ROLES in lib/permissionRoles.ts.
CREATE FUNCTION swo_starter_role_id(org TEXT, fixed "TeamRole") RETURNS TEXT AS $$
DECLARE
  found TEXT;
BEGIN
  SELECT "id" INTO found FROM "OrgRole" WHERE "organisationId" = org AND "starterKey" = fixed;
  IF found IS NOT NULL THEN RETURN found; END IF;
  INSERT INTO "OrgRole" ("id", "organisationId", "name", "description", "capabilities", "isOwner", "starterKey", "sortOrder", "updatedAt")
  SELECT gen_random_uuid()::text, org, s."name", s."description", s."capabilities", s."isOwner", s."fixedRole"::"TeamRole", s."sortOrder", CURRENT_TIMESTAMP
  FROM (VALUES
    ('OWNER', 'Owner', 'Everything, including the team, roles and deleting the organisation.', ARRAY[]::TEXT[], true, 0),
    ('ADMIN', 'Manager', 'Plans, members, approvals, cards, payments and settings.', ARRAY['org.view','members.view','reports.membership','members.contact','members.export','payments.view','payments.manage','reports.finance','members.manage','cards.manage','audit.view','erasure.decide','team.manage','plans.manage','payments.settings','org.settings','structure.manage','cards.design','accounts.manage','reports.gstr1'], false, 1),
    ('TREASURER', 'Treasurer', 'Payments, receipts and finance reports. Reads members.', ARRAY['org.view','members.view','reports.membership','members.contact','members.export','payments.view','payments.manage','reports.finance','accounts.manage','reports.gstr1'], false, 2),
    ('VIEWER', 'Viewer', 'Reads members and membership reports. Contact details are hidden.', ARRAY['org.view','members.view','reports.membership'], false, 3)
  ) AS s("fixedRole", "name", "description", "capabilities", "isOwner", "sortOrder")
  WHERE NOT EXISTS (
    SELECT 1 FROM "OrgRole" r
    WHERE r."organisationId" = org AND (r."starterKey" = s."fixedRole"::"TeamRole" OR r."name" = s."name" OR (s."isOwner" AND r."isOwner"))
  );
  SELECT "id" INTO found FROM "OrgRole" WHERE "organisationId" = org AND "starterKey" = fixed;
  IF found IS NULL THEN
    RAISE EXCEPTION 'Organisation % has no starter role for %', org, fixed;
  END IF;
  RETURN found;
END;
$$ LANGUAGE plpgsql;

-- A row written with only the fixed role gets the matching starter role; one whose fixed role changed alone (an old
-- release changing someone's role) follows it. The application sets swo.role_fallback_sync while it keeps the fixed
-- role in step with an edited custom role, which must not move anyone.
CREATE FUNCTION swo_role_from_fixed_role() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."roleId" IS NULL THEN
      NEW."roleId" := swo_starter_role_id(NEW."organisationId", NEW."role");
    END IF;
  ELSIF NEW."role" IS DISTINCT FROM OLD."role" AND NEW."roleId" IS NOT DISTINCT FROM OLD."roleId"
    AND coalesce(current_setting('swo.role_fallback_sync', true), 'off') <> 'on' THEN
    NEW."roleId" := swo_starter_role_id(NEW."organisationId", NEW."role");
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TeamMember_role_from_fixed_role" BEFORE INSERT OR UPDATE OF "role" ON "TeamMember" FOR EACH ROW EXECUTE FUNCTION swo_role_from_fixed_role();
CREATE TRIGGER "TeamInvite_role_from_fixed_role" BEFORE INSERT OR UPDATE OF "role" ON "TeamInvite" FOR EACH ROW EXECUTE FUNCTION swo_role_from_fixed_role();

-- A unit created without a code (by the previous release) gets one from its slug, as migration 0013 did.
CREATE FUNCTION swo_unit_code() RETURNS TRIGGER AS $$
DECLARE
  base TEXT;
  candidate TEXT;
  n INT := 1;
BEGIN
  IF NEW."code" IS NOT NULL THEN
    RETURN NEW;
  END IF;
  base := left(upper(regexp_replace(NEW."slug", '[^a-zA-Z0-9]', '', 'g')), 6);
  IF base = '' THEN
    base := 'U';
  END IF;
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM "OrgUnit" WHERE "organisationId" = NEW."organisationId" AND "code" = candidate) LOOP
    n := n + 1;
    candidate := left(base, 6 - length(n::text)) || n::text;
  END LOOP;
  NEW."code" := candidate;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "OrgUnit_code_default" BEFORE INSERT ON "OrgUnit" FOR EACH ROW EXECUTE FUNCTION swo_unit_code();
