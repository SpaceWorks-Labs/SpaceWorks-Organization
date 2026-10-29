import "server-only";

import type { OrgPaymentSettings } from "@prisma/client";
import { prisma } from "@/lib/db";
import { gatewayTakes } from "./config";
import { paymentSecretsConfigured } from "./secrets";
import { paymentGuidance, type PaymentGuidance } from "./unitInstructions";

type Settings = Pick<OrgPaymentSettings, "provider" | "offlineInstructions" | "secretEncrypted"> | null;

/** Whether members can pay online in this currency: a gateway is chosen, its keys are saved and readable, and it takes the currency. */
export function gatewayUsable(settings: Pick<OrgPaymentSettings, "provider" | "secretEncrypted"> | null, currency: string) {
  return Boolean(settings && settings.provider !== "NONE" && settings.secretEncrypted && paymentSecretsConfigured() && gatewayTakes(settings.provider, currency));
}

/** The units on a unit path (ids joined by "/"), top first. */
export async function unitChain(organisationId: string, unitPath: string | null | undefined) {
  if (!unitPath) return [];
  const ids = unitPath.split("/");
  const units = await prisma.orgUnit.findMany({ where: { organisationId, id: { in: ids } }, select: { id: true, name: true, paymentInstructions: true } });
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}

/**
 * How a member of `unitPath` pays a fee in `currency` offline. Pass the organisation's payment settings when
 * already loaded (null when it has none); they are read otherwise.
 */
export async function loadPaymentGuidance(organisationId: string, unitPath: string | null | undefined, currency: string, settings?: Settings): Promise<PaymentGuidance> {
  const [chain, found] = await Promise.all([
    unitChain(organisationId, unitPath),
    settings === undefined ? prisma.orgPaymentSettings.findUnique({ where: { organisationId }, select: { provider: true, offlineInstructions: true, secretEncrypted: true } }) : Promise.resolve(settings),
  ]);
  return paymentGuidance({ chain, orgInstructions: found?.offlineInstructions ?? "", online: gatewayUsable(found, currency) });
}
