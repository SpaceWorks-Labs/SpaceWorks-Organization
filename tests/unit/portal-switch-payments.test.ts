import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { payment: { findMany: mocks.findMany } } }));
vi.mock("@/lib/permissions", () => ({ requireAuth: async () => ({ user: { id: "user_1" } }) }));
vi.mock("@/lib/portal/member", () => ({
  PORTAL_ORGANISATION_STATUSES: ["ACTIVE", "SUSPENDED", "ARCHIVED"],
  verifiedEmail: async () => "person@example.test",
}));

import { loadAccountPaymentsView } from "@/lib/views/app__account__payments__page";

beforeEach(() => mocks.findMany.mockResolvedValue([]));

describe("account payments follow the member-accounts switch", () => {
  it("only reads payments of organisations with the member portal on", async () => {
    await loadAccountPaymentsView();
    expect(mocks.findMany.mock.calls[0][0].where.organisation).toEqual({ memberPortal: true, status: { in: ["ACTIVE", "SUSPENDED", "ARCHIVED"] } });
  });
});
