import "server-only";

import { OutboxStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { effectiveMinor, type JoinFields } from "./joinFields";
import { replaceMemberPhoto, type PreparedMemberPhoto } from "./photo";

/*
 * The parts of `submitJoin` (app/actions/join.ts) that the plan's join settings decide: which built-in details
 * count, the under-18 rule and the photo.
 */

export type JoinPhotoMode = "OFF" | "OPTIONAL" | "REQUIRED";

/** FormData carries the JSON `payload` and an optional `photo`; a plain object is the payload itself. */
export function readJoinInput(input: unknown): { payload: unknown; photo: File | null } {
  if (!(input instanceof FormData)) return { payload: input, photo: null };
  let payload: unknown = null;
  try {
    payload = JSON.parse(String(input.get("payload") ?? ""));
  } catch {
    payload = null;
  }
  const photo = input.get("photo");
  return { payload, photo: photo instanceof File && photo.size > 0 ? photo : null };
}

/**
 * The profile to validate. Hidden phone and state are dropped so the member's stored values stay. The under-18
 * answer is the existing member's, else the form's when the plan offers it; guardian details count only then.
 */
export function joinProfile(raw: Record<string, unknown>, fields: JoinFields, existing: { isMinor: boolean } | null) {
  const minor = effectiveMinor(existing, raw.isMinor === true, fields);
  return {
    minor,
    profile: {
      ...raw,
      phone: fields.phone === "HIDDEN" ? undefined : raw.phone,
      stateCode: fields.state === "HIDDEN" ? undefined : raw.stateCode,
      isMinor: minor,
      ...(minor ? {} : { guardianName: undefined, guardianEmail: undefined, guardianPhone: undefined }),
    },
  };
}

/** Required built-in details, guardian consent and the photo rule, as field errors. */
export function joinSettingErrors(args: {
  fields: JoinFields;
  profile: { phone: string | null; stateCode: string | null };
  minor: boolean;
  guardianConsent: boolean;
  photoMode: JoinPhotoMode;
  photo: File | null;
  hasPhoto: boolean;
}): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  if (args.fields.phone === "REQUIRED" && !args.profile.phone) errors.phone = ["Enter your phone number"];
  if (args.fields.state === "REQUIRED" && !args.profile.stateCode) errors.stateCode = ["Choose your state"];
  if (args.minor && !args.guardianConsent) errors.guardianConsent = ["Your parent or guardian needs to agree"];
  if (args.photo && args.photoMode === "OFF") errors.photo = ["This plan doesn't take a photo"];
  else if (!args.photo && args.photoMode === "REQUIRED" && !args.hasPhoto) errors.photo = ["Add a photo"];
  return errors;
}

/**
 * After the join commits: attach the prepared photo to the member the transaction resolved, only if they still
 * have none. Returns a warning for the person when the photo couldn't be saved; the membership stands either way.
 */
export async function attachJoinPhoto(args: {
  org: { id: string; name: string; memberPortal: boolean; memberPhotoUpload: boolean };
  memberId: string;
  userId: string;
  prepared: PreparedMemberPhoto;
}): Promise<string | null> {
  const { org } = args;
  try {
    const saved = await replaceMemberPhoto({ id: args.memberId, organisationId: org.id, photoUrl: null }, args.prepared, { onlyIfEmpty: true });
    if ("error" in saved) throw new Error(saved.error);
    if (!saved.kept) {
      await recordAuditEvent({ action: "MEMBER_PHOTO_UPLOADED", actorUserId: args.userId, organisationId: org.id, targetType: "Member", targetId: args.memberId, metadata: { by: "join" } });
    }
    return null;
  } catch {
    console.error("[media] join photo not attached");
    return org.memberPortal && org.memberPhotoUpload
      ? "You've joined, but we couldn't save your photo. Add it from your account."
      : `You've joined, but we couldn't save your photo. Contact ${org.name} to add it.`;
  }
}

/** How long a join's card email waits for its photo; it goes out sooner once the photo attempt ends. */
const CARD_EMAIL_HOLD_MS = 10 * 60_000;

/**
 * Hold the member's queued card emails (queued when the join activated the membership) until the photo attempt
 * ends, so the card isn't sent without the photo. Run inside the join transaction; returns the held rows.
 */
export async function holdCardEmails(tx: Prisma.TransactionClient, organisationId: string, memberId: string) {
  const cards = await tx.memberCard.findMany({ where: { organisationId, memberId, revokedAt: null }, select: { id: true } });
  if (!cards.length) return [];
  const where = { kind: "member-card", status: OutboxStatus.PENDING, OR: cards.map((card) => ({ payload: { path: ["cardId"], equals: card.id } })) };
  const held = await tx.outboxMessage.findMany({ where, select: { id: true } });
  await tx.outboxMessage.updateMany({ where: { id: { in: held.map((row) => row.id) } }, data: { availableAt: new Date(Date.now() + CARD_EMAIL_HOLD_MS) } });
  return held.map((row) => row.id);
}

/** Let held card emails go now that the photo attempt is over, whatever its outcome. */
export async function releaseCardEmails(ids: string[]) {
  if (ids.length) await prisma.outboxMessage.updateMany({ where: { id: { in: ids }, status: OutboxStatus.PENDING }, data: { availableAt: new Date() } });
}

