import "server-only";

import type { Prisma } from "@prisma/client";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { orgActionAccess, type StaffMembership } from "@/lib/permissions";
import { mayGrant, reachOf } from "@/lib/team/granting";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

/** Thrown inside a team transaction to roll it back with a message for the person. */
export class TeamError extends Error {}

/** Run a team change, turning a TeamError into the refusal the person sees. */
export async function teamChange(run: () => Promise<unknown>): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await run();
    return { ok: true };
  } catch (error) {
    if (error instanceof TeamError) return { ok: false, error: error.message };
    throw error;
  }
}

/** Who may change the team: `team.manage`, rate limited. Scope (which staff) is checked per target. */
export async function teamAccess(slug: unknown) {
  const access = await orgActionAccess(slug, "team.manage");
  if (!access.ok) return access;
  if (await isActionRateLimited("action", access.userId)) return { ok: false as const, error: "Too many requests. Try again shortly." };
  return access;
}

/**
 * Load, inside a transaction, the staff member an actor wants to change or remove, and refuse unless they may: never
 * themselves, never an owner, and only someone holding a role the actor could grant, inside the actor's subtree.
 */
export async function manageableTarget(tx: Prisma.TransactionClient, actor: StaffMembership, targetUserId: string) {
  // Lock the row so two changes to one person never interleave.
  await tx.$queryRaw`SELECT 1 FROM "TeamMember" WHERE "userId" = ${targetUserId} AND "organisationId" = ${actor.organisationId} FOR NO KEY UPDATE`;
  const target = await tx.teamMember.findUnique({
    where: { userId_organisationId: { userId: targetUserId, organisationId: actor.organisationId } },
    include: { orgRole: true, unit: { select: { path: true } } },
  });
  if (!target) throw new TeamError("That person isn't on the team.");
  if (target.userId === actor.userId) throw new TeamError("You can't change your own access. Ask someone else on the team.");
  if (target.orgRole.isOwner) throw new TeamError("The owner can't be changed here. The owner can transfer ownership instead.");
  const scope = await reachOf(tx, actor.organisationId, actor.unitId);
  if (!mayGrant(actor, scope, { role: target.orgRole, unitId: target.unitId, unitPath: target.unit?.path ?? null })) {
    throw new TeamError("Your role doesn't allow you to change this person's access.");
  }
  return { target, scope };
}

export function refreshTeam(slug: string) {
  revalidatePath(`/dashboard/${slug}/team`);
  revalidatePath(`/dashboard/${slug}`);
}
