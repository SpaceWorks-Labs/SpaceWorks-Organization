ALTER TABLE "MembershipPlan"
  ADD COLUMN "joinPhoto" TEXT NOT NULL DEFAULT 'OFF',
  ADD COLUMN "joinFields" JSONB NOT NULL DEFAULT '{}',
  ADD CONSTRAINT "MembershipPlan_joinPhoto_check" CHECK ("joinPhoto" IN ('OFF', 'OPTIONAL', 'REQUIRED'));

ALTER TABLE "PlanField"
  ADD COLUMN "multiple" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "section" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "showIfKey" TEXT,
  ADD COLUMN "showIfValue" TEXT,
  ADD CONSTRAINT "PlanField_showIf_check" CHECK (("showIfKey" IS NULL) = ("showIfValue" IS NULL));
