import "server-only";

import type { Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";

type Tx = Prisma.TransactionClient;
type Answers = Record<string, unknown> | null | undefined;
export type AnswerSource = "staff" | "member" | "join" | "import";

const MAX_KEYS_TEXT = 200;

/** Field keys whose stored answer differs between the two maps, sorted. Never the answers themselves. */
export function changedAnswerKeys(before: Answers, after: Answers): string[] {
  const a = before ?? {};
  const b = after ?? {};
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => JSON.stringify(a[key] ?? null) !== JSON.stringify(b[key] ?? null)).sort();
}

/** A comma list that always fits the audit row; cut at a whole key. */
export function keysText(keys: readonly string[]): string {
  let text = "";
  for (const key of keys) {
    const next = text ? `${text},${key}` : key;
    if (next.length > MAX_KEYS_TEXT) return `${text},...`;
    text = next;
  }
  return text;
}

/**
 * Inside the caller's transaction: when saving changed any answer, write MEMBER_ANSWERS_CHANGED with the keys that
 * changed (no values), who made the change and which member. Writes nothing when no answer changed.
 */
export async function auditAnswerChange(tx: Tx, args: { organisationId: string; actorUserId: string | null; memberId: string; before: Answers; after: Answers; by: AnswerSource }) {
  const keys = changedAnswerKeys(args.before, args.after);
  if (!keys.length) return;
  await recordAuditEvent({ action: "MEMBER_ANSWERS_CHANGED", actorUserId: args.actorUserId, organisationId: args.organisationId, targetType: "Member", targetId: args.memberId, metadata: { keys: keysText(keys), by: args.by, memberId: args.memberId }, client: tx });
}

type Core = { name: string; email: string; phone: string | null; stateCode: string | null; unitId: string | null; isMinor: boolean; guardianName: string | null; guardianEmail: string | null; guardianPhone: string | null };

/** Which core profile fields differ, by name only. */
export function changedCoreFields(before: Core, after: Core): string[] {
  const out: string[] = [];
  if (before.name !== after.name) out.push("name");
  if (before.email !== after.email) out.push("email");
  if ((before.phone ?? null) !== (after.phone ?? null)) out.push("phone");
  if ((before.stateCode ?? null) !== (after.stateCode ?? null)) out.push("state");
  if ((before.unitId ?? null) !== (after.unitId ?? null)) out.push("unit");
  if (before.isMinor !== after.isMinor) out.push("minor");
  if ((before.guardianName ?? null) !== (after.guardianName ?? null) || (before.guardianEmail ?? null) !== (after.guardianEmail ?? null) || (before.guardianPhone ?? null) !== (after.guardianPhone ?? null)) out.push("guardian");
  return out;
}

/** MEMBER_UPDATED for a staff edit: the core fields that changed (names only) and, for a move, the units. */
export async function auditMemberUpdated(tx: Tx, args: { organisationId: string; actorUserId: string; memberId: string; before: Core; after: Core; notesChanged?: boolean }) {
  const fields = changedCoreFields(args.before, args.after);
  if (args.notesChanged) fields.push("notes");
  const moved = fields.includes("unit");
  await recordAuditEvent({
    action: "MEMBER_UPDATED", actorUserId: args.actorUserId, organisationId: args.organisationId, targetType: "Member", targetId: args.memberId,
    metadata: { fields: fields.join(","), memberId: args.memberId, ...(moved ? { fromUnitId: args.before.unitId ?? null, toUnitId: args.after.unitId ?? null } : {}) },
    client: tx,
  });
}
