"use server";

import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import bcrypt from "bcryptjs";
import { newPasswordSchema } from "@/lib/passwordPolicy";
import { BREACHED_PASSWORD_MESSAGE, isBreachedPassword } from "@/lib/breachedPassword";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";
import { hasRecentAuthentication } from "@/lib/reauth";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { recordAuditEvent } from "@/lib/audit";
import { flattenZodErrors } from "./utils";
import type { ActionResult } from "./org";
import { isUploadedImageUrl, isUserUploadUrl } from "@/lib/uploadUrl";

const revalidatePath = trackedRevalidation(nextRevalidatePath);
const SUPER_ADMIN_PASSWORD_ON_SERVER = "Super-admin passwords are set on the server. Run the admin set-password command there (docs/DEPLOYMENT_VPS.md).";

const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(120, "Name must be at most 120 characters"),
  profileImageUrl: z
    .string()
    .trim()
    .max(2048, "Profile image URL must be at most 2048 characters")
    .refine(isUploadedImageUrl, "Choose an uploaded profile image")
    .or(z.literal("")),
});

const updatePasswordSchema = z
  .object({
    currentPassword: z.string().max(128).optional(),
    newPassword: newPasswordSchema,
    confirmPassword: z.string().max(128),
  })
  .refine((input) => input.newPassword === input.confirmPassword, {
    message: "New passwords do not match",
    path: ["confirmPassword"],
  });

export async function updateAccountProfile(
  input: unknown,
): Promise<ActionResult<{ name: string; profileImageUrl: string | null; }>> {
  const session = await requireAuth();
  if (await isActionRateLimited("action", session.user.id)) {
    return { ok: false, error: "Too many updates. Try again later." };
  }

  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const { name, profileImageUrl } = parsed.data;
  const savedProfileImageUrl = profileImageUrl || null;
  if (
    savedProfileImageUrl &&
    !isUserUploadUrl(savedProfileImageUrl, session.user.id)
  ) {
    return { ok: false, error: "Choose your uploaded profile image." };
  }
  await prisma.user.update({
    where: { id: session.user.id },
    data: { name, profileImageUrl: savedProfileImageUrl },
  });
  await recordAuditEvent({
    action: "ACCOUNT_PROFILE_UPDATED",
    actorUserId: session.user.id,
    targetType: "User",
    targetId: session.user.id,
  });
  revalidatePath("/account");
  revalidatePath("/account/profile");

  return { ok: true, data: { name, profileImageUrl: savedProfileImageUrl } };
}

export async function updateAccountPassword(
  input: unknown,
): Promise<ActionResult<{ passwordSet: true; }>> {
  const session = await requireAuth();
  if (await isActionRateLimited("auth", session.user.id)) {
    return { ok: false, error: "Too many attempts. Try again later." };
  }

  const parsed = updatePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, passwordHash: true, sessionVersion: true, isSuperAdmin: true },
  });
  if (user?.isSuperAdmin) return { ok: false, error: SUPER_ADMIN_PASSWORD_ON_SERVER };
  if (!user?.email)
    return {
      ok: false,
      error: "An email address is required to set a password.",
    };

  if (user.passwordHash) {
    if (!(await hasRecentAuthentication())) return { ok: false, error: "Sign in again before changing your password." };
    if (!parsed.data.currentPassword)
      return { ok: false, error: "Enter your current password." };
    if (
      !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))
    ) {
      return { ok: false, error: "Current password is incorrect." };
    }
  } else if (!(await hasRecentAuthentication())) {
    return {
      ok: false,
      error: "Sign in with Google again before adding a password.",
    };
  }

  if (await isBreachedPassword(parsed.data.newPassword)) return { ok: false, error: BREACHED_PASSWORD_MESSAGE, fieldErrors: { newPassword: [BREACHED_PASSWORD_MESSAGE] } };
  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  const changed = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: session.user.id, passwordHash: user.passwordHash, sessionVersion: user.sessionVersion },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    });
    if (updated.count !== 1) return false;
    await tx.verificationToken.deleteMany({ where: { identifier: { in: [`reset:${user.email}`, `mfa:${session.user.id}`] } } });
    await tx.session.deleteMany({ where: { userId: session.user.id } });
    await tx.auditEvent.create({
      data: {
        action: user.passwordHash
          ? "ACCOUNT_PASSWORD_CHANGED"
          : "ACCOUNT_PASSWORD_ADDED",
        actorUserId: session.user.id,
        targetType: "User",
        targetId: session.user.id,
      },
    });
    return true;
  });
  if (!changed) return { ok: false, error: "Account security changed. Sign in again and retry." };
  revalidatePath("/account/security");

  return { ok: true, data: { passwordSet: true } };
}
