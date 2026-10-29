-- Deleting an organisation removes its roles before the transfer rows that name one, which RESTRICT refused, so an
-- organisation with any ownership-transfer history (even a cancelled offer) could not be deleted. Roles are only
-- ever archived in the app, so a cascade here happens only when the whole organisation goes.
ALTER TABLE "OwnershipTransfer" DROP CONSTRAINT "OwnershipTransfer_organisationId_keepRoleId_fkey";
ALTER TABLE "OwnershipTransfer" ADD CONSTRAINT "OwnershipTransfer_organisationId_keepRoleId_fkey" FOREIGN KEY ("organisationId", "keepRoleId") REFERENCES "OrgRole"("organisationId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;
