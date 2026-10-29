-- Mark a member's own "I've paid" claim, so cash-in-hand counts only money staff took.

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "memberClaim" BOOLEAN NOT NULL DEFAULT false;

-- Claims so far: offline payments the member submitted (claimOfflinePayment writes this note and nothing else does).
UPDATE "Payment" SET "memberClaim" = true WHERE "provider" = 'OFFLINE' AND "note" = 'Submitted by the member.';
