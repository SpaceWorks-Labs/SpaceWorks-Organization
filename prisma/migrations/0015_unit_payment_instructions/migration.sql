-- Offline payment instructions per unit (whom to pay, when, the UPI id), falling back to the unit above's and then
-- the organisation's.

-- AlterTable
ALTER TABLE "OrgUnit" ADD COLUMN "paymentInstructions" TEXT NOT NULL DEFAULT '';
