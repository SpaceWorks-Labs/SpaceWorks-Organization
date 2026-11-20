import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decodeValueIds } from "./keys";
import { replaceMemberValues } from "./memberValues";

type Client = Prisma.TransactionClient | typeof prisma;

/** A plan question as the grouping answers see it (a PlanField of type GROUPING). */
export type GroupingFieldDef = { key: string; label: string; type: string; required: boolean; adminOnly: boolean; groupingId?: string | null };

export type GroupingAnswer = { groupingId: string; valueIds: string[] };

export const isGroupingField = (field: { type: string; groupingId?: string | null }) => field.type === "GROUPING" && Boolean(field.groupingId);

/**
 * Check the answers to a plan's grouping questions. A public form skips admin-only ones. Errors are keyed like the
 * other answers (`fieldValues.<key>`). Archived values are refused here; saving re-checks under the member lock.
 */
export async function resolveGroupingAnswers(client: Client, organisationId: string, fields: readonly GroupingFieldDef[], values: Record<string, unknown>, byManager: boolean) {
  const errors: Record<string, string[]> = {};
  const answers = new Map<string, GroupingAnswer>();
  for (const field of fields) {
    if (!isGroupingField(field) || (field.adminOnly && !byManager)) continue;
    const groupingId = field.groupingId!;
    const grouping = await client.orgGrouping.findFirst({ where: { id: groupingId, organisationId, archivedAt: null }, select: { multiple: true } });
    if (!grouping) continue;
    const ids = decodeValueIds(values[field.key]);
    const fail = (message: string) => { errors[`fieldValues.${field.key}`] = [message]; };
    if (!ids.length) {
      if (field.required) fail(`${field.label} is required`);
    } else if (!grouping.multiple && ids.length > 1) {
      fail("Choose one");
    } else if ((await client.orgGroupingValue.count({ where: { organisationId, groupingId, archivedAt: null, id: { in: ids } } })) !== ids.length) {
      fail("Choose one of the options");
    }
    answers.set(groupingId, { groupingId, valueIds: ids });
  }
  return { errors, answers: [...answers.values()] };
}

/**
 * Save grouping answers with replace semantics, inside the member's row lock: each answered grouping ends up with
 * exactly the chosen values; an empty answer clears it. A member who already holds an archived value may keep it.
 */
export async function saveGroupingAnswers(tx: Prisma.TransactionClient, organisationId: string, memberId: string, answers: readonly GroupingAnswer[]) {
  for (const answer of answers) await replaceMemberValues(tx, organisationId, memberId, answer.groupingId, answer.valueIds);
}
