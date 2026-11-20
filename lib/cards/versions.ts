import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { CardDesign } from "./design/presets";
import { CARD_VERSION_LIMIT, snapshotPlan, versionsToPrune, type CardVersionKind } from "./versionPolicy";

/*
 * Version history of one card design (CardDesignVersion). Draft saves are coalesced (lib/cards/versionPolicy.ts),
 * approvals always add a version, and the oldest past the limit are deleted in the same transaction.
 */

type Tx = Prisma.TransactionClient;

export type CardVersionSnapshot = {
  organisationId: string;
  cardDesignId: string;
  kind: CardVersionKind;
  design: CardDesign;
  numberPrefix: string;
  numberFormat: string;
  createdById: string | null;
};

/** Record a snapshot inside the caller's transaction. Takes the design row's lock so two saves can't both add one. */
export async function recordCardVersion(tx: Tx, snapshot: CardVersionSnapshot, now = new Date()) {
  const where = { organisationId: snapshot.organisationId, cardDesignId: snapshot.cardDesignId };
  await tx.$queryRaw`SELECT "id" FROM "CardDesign" WHERE "id" = ${snapshot.cardDesignId} AND "organisationId" = ${snapshot.organisationId} FOR UPDATE`;
  const rows = await tx.cardDesignVersion.findMany({ where, select: { id: true, kind: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  const data = {
    design: snapshot.design as unknown as Prisma.InputJsonValue,
    numberPrefix: snapshot.numberPrefix,
    numberFormat: snapshot.numberFormat,
    createdById: snapshot.createdById,
  };
  const plan = snapshotPlan(rows[0] ?? null, snapshot.kind, now);
  if (plan.action === "update") {
    await tx.cardDesignVersion.update({ where: { id: plan.id }, data });
    return;
  }
  const created = await tx.cardDesignVersion.create({ data: { ...where, kind: snapshot.kind, createdAt: now, ...data }, select: { id: true, kind: true, createdAt: true } });
  const prune = versionsToPrune([created, ...rows], CARD_VERSION_LIMIT);
  if (prune.length) await tx.cardDesignVersion.deleteMany({ where: { ...where, id: { in: prune } } });
}

/** A draft save's snapshot, in its own short transaction. History is a convenience: a failure never fails the save. */
export async function recordDraftVersion(snapshot: Omit<CardVersionSnapshot, "kind">) {
  try {
    await prisma.$transaction((tx) => recordCardVersion(tx, { ...snapshot, kind: "DRAFT" }));
  } catch {
    console.error("[cards] draft version snapshot failed");
  }
}
