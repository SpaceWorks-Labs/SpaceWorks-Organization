CREATE TYPE "PaymentMode" AS ENUM ('FREE', 'ONLINE_OR_IN_HAND', 'IN_HAND_ONLY');

ALTER TABLE "MembershipPlan"
  ADD COLUMN "paymentMode" "PaymentMode" NOT NULL DEFAULT 'ONLINE_OR_IN_HAND',
  ADD COLUMN "renewalPolicy" JSONB NOT NULL DEFAULT '{}';

-- Existing plans: nothing to pay on any line means free, everything else keeps the gateway-or-in-hand behaviour.
UPDATE "MembershipPlan" SET "paymentMode" = 'FREE'
  WHERE "priceNewMinor" = 0 AND "priceRenewalMinor" = 0 AND "joiningFeeMinor" = 0;
