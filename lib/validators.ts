import { z } from "zod";
import { isReservedOrganisationSlug } from "@/lib/slug";
import { isUploadedImageUrl } from "@/lib/uploadUrl";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const organisationSlugSchema = z
  .string()
  .trim()
  .min(2, "The web address must be at least 2 characters")
  .max(64)
  .regex(slugRegex, "Use lowercase letters, numbers and single hyphens")
  .refine((slug) => !isReservedOrganisationSlug(slug), "That web address is reserved");

export const updateOrganisationSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(2000).optional().default(""),
  logoUrl: z
    .string()
    .refine(isUploadedImageUrl, "Invalid uploaded image URL")
    .or(z.literal("")),
});

const idSchema = z.string().trim().min(1).max(64);
const optionalIdSchema = z.string().trim().max(64).optional().nullable().transform((value) => value || null);

/** A staff role the organisation defines. Ownership never moves through the team forms. */
export const updateTeamRoleSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  targetUserId: idSchema,
  roleId: idSchema,
});

export const removeTeamMemberSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  targetUserId: idSchema,
});

export const teamMemberUnitSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  targetUserId: idSchema,
  unitId: optionalIdSchema,
});

/** An invite link gives one role, for the whole organisation or (with `unitId`) one unit's subtree. */
export const createOrgInviteSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  roleId: idSchema,
  unitId: optionalIdSchema,
});

const staffRoleFields = {
  organisationSlug: z.string().trim().min(1),
  name: z.string().trim().min(2, "Use 2 to 60 characters").max(60, "Use 2 to 60 characters"),
  description: z.string().trim().max(200, "Use at most 200 characters").optional().default(""),
  capabilities: z.array(z.string().trim().min(1).max(64)).max(64),
};

export const createStaffRoleSchema = z.object(staffRoleFields);

export const updateStaffRoleSchema = z.object({ ...staffRoleFields, roleId: idSchema });

export const archiveStaffRoleSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  roleId: idSchema,
  archived: z.boolean(),
});

export const reorderStaffRolesSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  roleIds: z.array(idSchema).min(1).max(200),
});

export const startOwnershipTransferSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  targetUserId: idSchema,
  /** The role the current owner keeps afterwards. */
  keepRoleId: idSchema,
});

export const acceptOwnershipTransferSchema = z.object({
  token: z.string().trim().min(20).max(128).regex(/^[A-Za-z0-9_-]+$/),
});

export const cancelOwnershipTransferSchema = z.object({
  organisationSlug: z.string().trim().min(1),
});

export const revokeOrgInviteSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  inviteId: z.string().trim().min(1),
});

export const deleteOrganisationSchema = z.object({
  organisationSlug: z.string().trim().min(1),
});
