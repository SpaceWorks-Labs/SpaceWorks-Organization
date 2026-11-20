import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.AUTH_SECRET = "s".repeat(48);

type Row = { kind: string; key: string; providerId: string; payload: unknown; expiresAt: Date };
const db = vi.hoisted(() => ({ rows: new Map<string, Row>() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    samlLoginState: {
      create: async ({ data }: { data: Row }) => {
        if (db.rows.has(data.key)) throw new Error("unique");
        db.rows.set(data.key, data);
      },
      deleteMany: async () => ({ count: 0 }),
    },
    // The ticket and request-id statements are single atomic DELETE ... RETURNING; this models that.
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const kind = strings.join("?").includes("'ticket'") ? "ticket" : "request";
      const [key, second, third] = values as [string, unknown, unknown];
      const now = (kind === "ticket" ? second : third) as Date;
      const row = db.rows.get(key);
      if (!row || row.kind !== kind || row.expiresAt <= now || (kind === "request" && row.providerId !== second)) return [];
      if (kind === "ticket" && (row.payload as { flow?: string }).flow !== third) return [];
      db.rows.delete(key);
      return [{ providerId: row.providerId, payload: row.payload }];
    },
  },
}));

import { consumeSamlTicket, issueSamlTicket, samlCacheProvider } from "@/lib/saml/state";
import { flowHash, newFlowToken } from "@/lib/saml/flow";

const identity = { email: "person@example.test", name: "Pat", subject: "person@example.test" };
const flowToken = newFlowToken();
const flow = flowHash(flowToken);
beforeEach(() => db.rows.clear());

describe("SAML one-time tickets", () => {
  it("are random, stored only as a hash, and usable exactly once", async () => {
    const ticket = await issueSamlTicket("prov_1", identity, flow);
    expect(ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect([...db.rows.keys()].some((key) => key.includes(ticket))).toBe(false);
    expect(await consumeSamlTicket(ticket, flowToken)).toEqual({ ...identity, providerId: "prov_1" });
    expect(await consumeSamlTicket(ticket, flowToken)).toBeNull();
  });
  it("are refused without the flow cookie or with another browser's, and a wrong cookie does not use the ticket up", async () => {
    const ticket = await issueSamlTicket("prov_1", identity, flow);
    expect(await consumeSamlTicket(ticket, null)).toBeNull();
    expect(await consumeSamlTicket(ticket, newFlowToken())).toBeNull();
    expect(await consumeSamlTicket(ticket, flowToken)).toEqual({ ...identity, providerId: "prov_1" });
  });
  it("issued with no flow hash can never be used", async () => {
    const ticket = await issueSamlTicket("prov_1", identity, null);
    expect(await consumeSamlTicket(ticket, flowToken)).toBeNull();
  });
  it("carry the flow hash of the AuthnRequest that started them", async () => {
    let seen: string | null = "unset";
    const started = samlCacheProvider("prov_1", { hash: flow });
    await started.saveAsync("_req3", "now");
    expect(await samlCacheProvider("prov_1", { onConsume: (hash) => { seen = hash; } }).consumeAsync!("_req3")).toBe("now");
    expect(seen).toBe(flow);
  });
  it("expire after two minutes", async () => {
    const ticket = await issueSamlTicket("prov_1", identity, flow);
    const [row] = [...db.rows.values()];
    expect(row.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(120_000);
    row.expiresAt = new Date(Date.now() - 1);
    expect(await consumeSamlTicket(ticket, flowToken)).toBeNull();
  });
  it("refuse anything that is not a ticket", async () => {
    expect(await consumeSamlTicket("short", flowToken)).toBeNull();
    expect(await consumeSamlTicket("x".repeat(43), flowToken)).toBeNull();
  });
});

describe("SAML request ids", () => {
  it("are single use and bound to their provider", async () => {
    const mine = samlCacheProvider("prov_1");
    const other = samlCacheProvider("prov_2");
    await mine.saveAsync("_req1", "now");
    expect(await other.consumeAsync!("_req1")).toBeNull();
    expect(await mine.consumeAsync!("_req1")).toBe("now");
    expect(await mine.consumeAsync!("_req1")).toBeNull();
  });
  it("expire after ten minutes", async () => {
    const cache = samlCacheProvider("prov_1");
    await cache.saveAsync("_req2", "now");
    const row = db.rows.get("_req2")!;
    expect(row.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(600_000);
    row.expiresAt = new Date(Date.now() - 1);
    expect(await cache.consumeAsync!("_req2")).toBeNull();
  });
  it("remember assertion ids so a captured assertion cannot be replayed", async () => {
    const cache = samlCacheProvider("prov_1");
    expect(await cache.saveIfAbsentAsync!("_a1", "1", Date.now() + 60_000)).toBe(true);
    expect(await cache.saveIfAbsentAsync!("_a1", "1", Date.now() + 60_000)).toBe(false);
  });
});
