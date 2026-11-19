import "server-only";

import type { EmailSuppressionReason } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recipientsOf, type Mailer } from "./providers/types";

/** The address bounced or complained before, so nothing is sent. Permanent: retrying cannot help. */
export class EmailSuppressedError extends Error {
  override name = "EmailSuppressedError";
  constructor() {
    super("Not sent: the provider reported this address as bounced or as a complaint.");
  }
}

/**
 * Wrap a transport so it never sends to an address on the suppression list. The list belongs to the sending
 * account: `organisationId` null is the platform's, an organisation with its own provider keeps its own.
 */
export function withSuppression<T extends Mailer>(mailer: T, organisationId: string | null): Mailer {
  return {
    async sendMail(options) {
      const addresses = recipientsOf(options.to).map((address) => address.toLowerCase());
      if (addresses.length > 0 && (await prisma.emailSuppression.count({ where: { organisationId, address: { in: addresses } } })) > 0) throw new EmailSuppressedError();
      return mailer.sendMail(options);
    },
    close: () => mailer.close?.(),
  };
}

export type SuppressionEntry = { address: string; reason: EmailSuppressionReason };

/** Add addresses to a list; ones already there are left as they are. Returns how many were new. */
export async function recordSuppressions(entries: SuppressionEntry[], source: { organisationId: string | null; provider: string }) {
  const seen = new Set<string>();
  const data = entries.flatMap(({ address, reason }) => {
    const lower = address.trim().toLowerCase();
    if (!lower || lower.length > 320 || seen.has(lower)) return [];
    seen.add(lower);
    return [{ organisationId: source.organisationId, address: lower, reason, provider: source.provider }];
  });
  if (data.length === 0) return 0;
  return (await prisma.emailSuppression.createMany({ data, skipDuplicates: true })).count;
}
