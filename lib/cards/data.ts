import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { deriveStatus } from "@/lib/membership/lifecycle";
import { formatValidUntil, memberDetails, verifyPath } from "./core";
import { normalizeCardDesign, withOwnArtwork, type CardDesign } from "./design/presets";
import { managedImageUrl, memberPhotoUrl } from "./imageUrl";
import type { CardInput } from "./render";
import type { CardBranding, CardHolder } from "./types";
import { roleCardRows } from "./roleCards";
import { missingAncestorIds, unitChain, type CardUnitRow } from "./units";

/*
 * Everything a card render needs, from the database: the organisation, its designs (the member's
 * primary role design, else the plan's, else the organisation default, else the built-in default), the
 * plan's printable fields, and the member's details with their current valid-until date and unit chain.
 */

const UNIT_SELECT = { id: true, name: true, code: true, level: true, path: true } as const;

export const CARD_INCLUDE = {
  plan: { select: { id: true, name: true } },
  member: {
    select: {
      id: true, organisationId: true, name: true, photoUrl: true, fieldValues: true, anonymisedAt: true,
      unit: { select: UNIT_SELECT },
      user: { select: { id: true, profileImageUrl: true } },
      roles: { where: { isPrimary: true, role: { archivedAt: null } }, select: { role: { select: { id: true, name: true } } } },
      terms: { select: { id: true, planId: true, status: true, startsAt: true, endsAt: true, graceUntil: true, paymentDueBy: true, renewedFromId: true, createdAt: true } },
    },
  },
} satisfies Prisma.MemberCardInclude;

type CardRecord = Prisma.MemberCardGetPayload<{ include: typeof CARD_INCLUDE }>;

export type CardOrgContext = {
  organisation: { id: string; name: string; slug: string; logoUrl: string | null; accentColor: string | null; timezone: string; status: string; unitLevels: string[] };
  designs: Array<{ planId: string | null; roleId: string | null; design: unknown; watermarkUrl: string | null; numberPrefix: string; numberFormat: string }>;
  fields: Map<string, Array<{ key: string; label: string; type: string }>>;
  /** Ancestor units loaded so far by `loadCardUnits`, by id. */
  units: Map<string, CardUnitRow>;
};

/** The public base URL that card QR codes point at. */
function cardVerifyUrl(token: string) {
  const base = (process.env.NEXT_PUBLIC_BASE_URL || process.env.AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${verifyPath(token)}`;
}

export async function loadCardOrgContext(organisationId: string): Promise<CardOrgContext | null> {
  const organisation = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { id: true, name: true, slug: true, logoUrl: true, accentColor: true, timezone: true, status: true, unitLevels: true },
  });
  if (!organisation) return null;
  const [designs, fields] = await Promise.all([
    // Only approved designs reach cards; drafts wait for the owner (lib/cards/approval.ts).
    prisma.cardDesign.findMany({ where: { organisationId, design: { not: Prisma.DbNull } }, select: { planId: true, roleId: true, design: true, watermarkUrl: true, numberPrefix: true, numberFormat: true } }),
    prisma.planField.findMany({ where: { organisationId, adminOnly: false }, orderBy: { sortOrder: "asc" }, select: { planId: true, key: true, label: true, type: true } }),
  ]);
  const byPlan = new Map<string, Array<{ key: string; label: string; type: string }>>();
  for (const field of fields) byPlan.set(field.planId, [...(byPlan.get(field.planId) ?? []), field]);
  return { organisation, designs, fields: byPlan, units: new Map() };
}

/**
 * Load the ancestor units of these cards' members into `ctx`, in one query for the lot, so
 * `holderFor` can print each member's whole chain. Call it once per page of cards before `holderFor`.
 */
export async function loadCardUnits(ctx: CardOrgContext, cards: ReadonlyArray<Pick<CardRecord, "member">>) {
  const units = cards.flatMap((card) => (card.member.unit ? [card.member.unit] : []));
  for (const unit of units) ctx.units.set(unit.id, unit);
  const missing = missingAncestorIds(units, ctx.units);
  if (missing.length === 0) return;
  const rows = await prisma.orgUnit.findMany({ where: { organisationId: ctx.organisation.id, id: { in: missing } }, select: UNIT_SELECT });
  for (const row of rows) ctx.units.set(row.id, row);
}

export function brandingFor(ctx: CardOrgContext, watermarkUrl: string | null): CardBranding {
  const organisationId = ctx.organisation.id;
  return {
    orgAccent: ctx.organisation.accentColor,
    organisationLogoUrl: managedImageUrl(ctx.organisation.logoUrl, { kind: "organisation", organisationId, category: "organisation-logos" }),
    watermarkUrl: managedImageUrl(watermarkUrl, { kind: "organisation", organisationId, category: "member-id-watermarks" }),
  };
}

export type DesignSource = "role" | "plan" | "organisation" | "default";

/** The organisation default row: neither a plan's nor a role's. */
export function organisationDesignRow(ctx: CardOrgContext) {
  return ctx.designs.find((row) => row.planId === null && row.roleId === null);
}

/**
 * The design a card uses: its member's primary role design, else its plan's, else the organisation
 * default, else the built-in one.
 */
export function designFor(ctx: CardOrgContext, plan: { id: string; name: string }, roleId: string | null = null): CardInput & { design: CardDesign; source: DesignSource } {
  const byRole = roleId ? ctx.designs.find((row) => row.roleId === roleId) : undefined;
  const byPlan = ctx.designs.find((row) => row.planId === plan.id);
  const fallback = organisationDesignRow(ctx);
  const row = byRole ?? byPlan ?? fallback;
  const design = withOwnArtwork(normalizeCardDesign(row?.design, { organisationName: ctx.organisation.name, planName: plan.name }), ctx.organisation.id);
  return { design, branding: brandingFor(ctx, row?.watermarkUrl ?? null), source: byRole ? "role" : byPlan ? "plan" : fallback ? "organisation" : "default" };
}

/** The member's primary role on a loaded card, if it is still in use. */
export function cardRoleId(card: CardRecord) {
  return card.member.roles[0]?.role.id ?? null;
}

/** What a card prints about its member, read now: the valid-until date follows renewals. */
export function holderFor(card: CardRecord, ctx: CardOrgContext, now = new Date()): CardHolder {
  const chain = card.member.terms.filter((term) => term.planId === card.planId);
  const current = deriveStatus(chain, now).current;
  return {
    memberId: card.memberId,
    verifyToken: card.verifyToken,
    verifyUrl: cardVerifyUrl(card.verifyToken),
    displayName: card.member.name,
    role: card.member.roles[0]?.role.name ?? null,
    planName: card.plan.name,
    details: memberDetails(ctx.fields.get(card.planId) ?? [], card.member.fieldValues),
    photoUrl: memberPhotoUrl(card.member),
    idNumber: card.cardNumber,
    validUntil: current?.startsAt ? formatValidUntil(current.endsAt, ctx.organisation.timezone) : null,
    units: unitChain(card.member.unit, ctx.units, ctx.organisation.unitLevels),
  };
}

/** One card ready to render, or null when it doesn't exist (or its member was erased). */
export async function loadCardForRender(cardId: string) {
  const card = await prisma.memberCard.findUnique({ where: { id: cardId }, include: CARD_INCLUDE });
  if (!card || card.member.anonymisedAt) return null;
  const ctx = await loadCardOrgContext(card.organisationId);
  if (!ctx) return null;
  await loadCardUnits(ctx, [card]);
  const { design, branding } = designFor(ctx, card.plan, cardRoleId(card));
  return { card, ctx, input: { design, branding } satisfies CardInput, holder: holderFor(card, ctx) };
}

/** Every live member role with its card status and live card count, for Settings → Cards (lib/cards/roleCards.ts). */
export async function loadRoleCardRows(organisationId: string) {
  const [roles, designs, counts] = await Promise.all([
    prisma.memberRole.findMany({ where: { organisationId, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.cardDesign.findMany({ where: { organisationId, roleId: { not: null } }, select: { roleId: true, design: true, draft: true, numberFormat: true } }),
    prisma.$queryRaw<Array<{ roleId: string; count: bigint }>>`
      SELECT a."roleId", count(*) AS count FROM "MemberCard" c
      JOIN "MemberRoleAssignment" a ON a."memberId" = c."memberId" AND a."organisationId" = c."organisationId" AND a."isPrimary"
      WHERE c."organisationId" = ${organisationId} AND c."revokedAt" IS NULL
      GROUP BY a."roleId"`,
  ]);
  return roleCardRows(
    roles,
    designs.map((row) => ({ roleId: row.roleId, live: row.design !== null, hasDraft: row.draft !== null, numberFormat: row.numberFormat })),
    new Map(counts.map((row) => [row.roleId, Number(row.count)])),
  );
}
