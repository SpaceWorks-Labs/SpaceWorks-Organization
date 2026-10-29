import "server-only";

import { prisma } from "@/lib/db";
import { deriveStatus } from "@/lib/membership/lifecycle";
import { VERIFY_TOKEN_PATTERN } from "./core";
import { loadCardForRender } from "./data";

/*
 * The card a public /verify scan may draw (app/api/verify/[token]/card): only a live card (not revoked or
 * replaced) whose membership is current or in grace right now, whose member is not erased, in an active
 * organisation. Anything else is null, the same for every reason. Drawn on demand, never stored.
 */
export async function loadPublicCard(token: string, now = new Date()) {
  if (!VERIFY_TOKEN_PATTERN.test(token)) return null;
  const card = await prisma.memberCard.findUnique({ where: { verifyToken: token }, select: { id: true } });
  if (!card) return null;
  const loaded = await loadCardForRender(card.id);
  if (!loaded || loaded.card.revokedAt || loaded.ctx.organisation.status !== "ACTIVE") return null;
  const status = deriveStatus(loaded.card.member.terms.filter((term) => term.planId === loaded.card.planId), now).status;
  return status === "ACTIVE" || status === "GRACE" ? loaded : null;
}

/** Image URLs for the public check page: the front, and the back when the design has one. */
export async function publicCardImages(token: string, now = new Date()) {
  const loaded = await loadPublicCard(token, now);
  if (!loaded) return null;
  const base = `/api/verify/${token}/card`;
  return { front: `${base}?side=front`, back: loaded.input.design.backEnabled ? `${base}?side=back` : null };
}
