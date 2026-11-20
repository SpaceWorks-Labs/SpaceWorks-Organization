import "server-only";

import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/** Next value of a gapless per-organisation counter, allocated inside the caller's transaction. */
export async function nextCounter(tx: Tx, organisationId: string, name: string): Promise<number> {
  const [row] = await tx.$queryRaw<Array<{ value: number }>>`
    INSERT INTO "OrgCounter" ("organisationId", "name", "next") VALUES (${organisationId}, ${name}, 2)
    ON CONFLICT ("organisationId", "name") DO UPDATE SET "next" = "OrgCounter"."next" + 1
    RETURNING "next" - 1 AS value`;
  return Number(row.value);
}
