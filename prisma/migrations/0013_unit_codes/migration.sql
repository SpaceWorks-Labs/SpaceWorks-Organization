-- Unit codes: a short code per unit, unique per organisation, for card numbers and join links.

-- AlterTable
ALTER TABLE "OrgUnit" ADD COLUMN "code" TEXT;

-- Backfill from the slug: its letters and digits, upper-cased, at most six. On a clash the base is shortened so
-- the numeric suffix still fits in six characters.
DO $$
DECLARE
  unit RECORD;
  base TEXT;
  candidate TEXT;
  n INT;
BEGIN
  FOR unit IN SELECT "id", "organisationId", "slug" FROM "OrgUnit" ORDER BY "organisationId", "createdAt", "id" LOOP
    base := left(upper(regexp_replace(unit."slug", '[^a-zA-Z0-9]', '', 'g')), 6);
    IF base = '' THEN base := 'U'; END IF;
    candidate := base;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM "OrgUnit" WHERE "organisationId" = unit."organisationId" AND "code" = candidate) LOOP
      n := n + 1;
      candidate := left(base, 6 - length(n::text)) || n::text;
    END LOOP;
    UPDATE "OrgUnit" SET "code" = candidate WHERE "id" = unit."id";
  END LOOP;
END $$;

ALTER TABLE "OrgUnit" ALTER COLUMN "code" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "OrgUnit_organisationId_code_key" ON "OrgUnit"("organisationId", "code");


-- Hand-written constraints -------------------------------------------------------------------------

ALTER TABLE "OrgUnit" ADD CONSTRAINT "OrgUnit_code_format" CHECK ("code" ~ '^[A-Z0-9]{1,6}$');
