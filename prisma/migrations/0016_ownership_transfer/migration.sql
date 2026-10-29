-- Two-step ownership transfer: the owner offers the organisation to a staff member who holds their role for the
-- whole organisation, naming the role they keep, and it moves only when that person accepts. The owner can cancel;
-- offers expire after 7 days.

-- CreateTable
CREATE TABLE "OwnershipTransfer" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "keepRoleId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "OwnershipTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OwnershipTransfer_token_key" ON "OwnershipTransfer"("token");

-- CreateIndex
CREATE INDEX "OwnershipTransfer_organisationId_createdAt_idx" ON "OwnershipTransfer"("organisationId", "createdAt");

-- CreateIndex
CREATE INDEX "OwnershipTransfer_toUserId_idx" ON "OwnershipTransfer"("toUserId");

-- AddForeignKey
ALTER TABLE "OwnershipTransfer" ADD CONSTRAINT "OwnershipTransfer_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipTransfer" ADD CONSTRAINT "OwnershipTransfer_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipTransfer" ADD CONSTRAINT "OwnershipTransfer_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipTransfer" ADD CONSTRAINT "OwnershipTransfer_organisationId_keepRoleId_fkey" FOREIGN KEY ("organisationId", "keepRoleId") REFERENCES "OrgRole"("organisationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- One open transfer per organisation.
CREATE UNIQUE INDEX "OwnershipTransfer_one_open" ON "OwnershipTransfer" ("organisationId") WHERE "acceptedAt" IS NULL AND "cancelledAt" IS NULL;
