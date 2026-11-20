import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ valueFindMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { orgGroupingValue: { findMany: mocks.valueFindMany } } }));

import { compileCondition } from "@/lib/groups/compile";
import { conditionValueIds } from "@/lib/groups/valueIds";
import type { Condition } from "@/lib/groups/schema";

const ctx = { organisationId: "org1", timezone: "Asia/Kolkata", now: new Date("2026-06-01T00:00:00Z") };
beforeEach(() => vi.clearAllMocks());

describe("smart groups and archived grouping values", () => {
  it("asks only for live values, so an archived value matches nobody", async () => {
    mocks.valueFindMany.mockResolvedValue([]);
    const where = await compileCondition(ctx, { type: "grouping", groupingId: "g1", valueIds: ["archived"] });
    expect(mocks.valueFindMany.mock.calls[0][0].where).toMatchObject({ organisationId: "org1", groupingId: "g1", id: { in: ["archived"] }, archivedAt: null });
    expect(where).toEqual({ id: { in: [] } });
  });

  it("still matches through the live values of a rule that also names an archived one", async () => {
    mocks.valueFindMany.mockResolvedValue([{ path: "v1" }]);
    const where = await compileCondition(ctx, { type: "grouping", groupingId: "g1", valueIds: ["v1", "archived"] });
    expect(JSON.stringify(where)).toContain('"path":"v1"');
  });

  it("lists every value a condition names, through and, or and not", () => {
    const condition: Condition = {
      type: "and",
      items: [{ type: "grouping", groupingId: "g1", valueIds: ["a", "b"] }, { type: "not", item: { type: "or", items: [{ type: "grouping", groupingId: "g2", valueIds: ["c"] }, { type: "paymentDue" }] } }],
    };
    expect(conditionValueIds(condition)).toEqual(["a", "b", "c"]);
    expect(conditionValueIds({ type: "paymentDue" })).toEqual([]);
  });
});
