import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { defaultCardDesign } from "@/lib/cards/design/presets";
import { CARD_VERSION_LIMIT, DRAFT_VERSION_WINDOW_MS, snapshotPlan, versionsToPrune } from "@/lib/cards/versionPolicy";
import { recordCardVersion } from "@/lib/cards/versions";

const at = (iso: string) => new Date(iso);
const minutes = (base: Date, n: number) => new Date(base.getTime() + n * 60_000);
const T0 = at("2026-11-20T10:00:00.000Z");

describe("snapshotPlan", () => {
  it("adds the first version", () => {
    expect(snapshotPlan(null, "DRAFT", T0)).toEqual({ action: "create" });
  });

  it("folds draft saves inside the window into the newest draft version", () => {
    expect(snapshotPlan({ id: "v1", kind: "DRAFT", createdAt: T0 }, "DRAFT", minutes(T0, 9))).toEqual({ action: "update", id: "v1" });
  });

  it("starts a new draft version once the window has passed", () => {
    expect(snapshotPlan({ id: "v1", kind: "DRAFT", createdAt: T0 }, "DRAFT", new Date(T0.getTime() + DRAFT_VERSION_WINDOW_MS))).toEqual({ action: "create" });
  });

  it("never folds a draft into an approved version, and always keeps approvals", () => {
    expect(snapshotPlan({ id: "v1", kind: "APPROVED", createdAt: T0 }, "DRAFT", minutes(T0, 1))).toEqual({ action: "create" });
    expect(snapshotPlan({ id: "v1", kind: "DRAFT", createdAt: T0 }, "APPROVED", minutes(T0, 1))).toEqual({ action: "create" });
  });

  it("doesn't fold into a version from the future (clock skew)", () => {
    expect(snapshotPlan({ id: "v1", kind: "DRAFT", createdAt: minutes(T0, 5) }, "DRAFT", T0)).toEqual({ action: "create" });
  });
});

describe("versionsToPrune", () => {
  const rows = Array.from({ length: CARD_VERSION_LIMIT + 3 }, (_, index) => ({ id: `v${String(index).padStart(2, "0")}`, kind: index % 4 ? "DRAFT" : "APPROVED", createdAt: minutes(T0, index * 15) }));

  it("keeps the 30 newest and drops the oldest, whatever the input order", () => {
    const shuffled = [...rows].reverse().sort((a, b) => (a.id.charCodeAt(2) % 3) - (b.id.charCodeAt(2) % 3));
    expect(versionsToPrune(shuffled).sort()).toEqual(["v00", "v01", "v02"]);
  });

  it("drops nothing at or under the limit", () => {
    expect(versionsToPrune(rows.slice(0, CARD_VERSION_LIMIT))).toEqual([]);
  });
});

describe("recordCardVersion", () => {
  const design = defaultCardDesign({ organisationName: "Example", planName: "" });
  const snapshot = { organisationId: "org_1", cardDesignId: "cd_1", design, numberPrefix: "EX", numberFormat: "{PREFIX}-{SEQ:4}", createdById: "user_1" } as const;
  const tx = {
    $queryRaw: vi.fn(),
    cardDesignVersion: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    tx.cardDesignVersion.create.mockImplementation(async ({ data }: { data: { kind: string; createdAt: Date } }) => ({ id: "new", kind: data.kind, createdAt: data.createdAt }));
  });

  it("locks the design row and updates the newest draft inside the window", async () => {
    tx.cardDesignVersion.findMany.mockResolvedValue([{ id: "v1", kind: "DRAFT", createdAt: T0 }]);
    await recordCardVersion(tx as never, { ...snapshot, kind: "DRAFT" }, minutes(T0, 3));
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.cardDesignVersion.findMany.mock.calls[0][0].where).toEqual({ organisationId: "org_1", cardDesignId: "cd_1" });
    expect(tx.cardDesignVersion.update).toHaveBeenCalledWith({ where: { id: "v1" }, data: expect.objectContaining({ numberPrefix: "EX", createdById: "user_1" }) });
    expect(tx.cardDesignVersion.create).not.toHaveBeenCalled();
  });

  it("adds an approved version and deletes the oldest past the limit, scoped to the design", async () => {
    const existing = Array.from({ length: CARD_VERSION_LIMIT }, (_, index) => ({ id: `v${index}`, kind: "DRAFT", createdAt: minutes(T0, -index * 20) }));
    tx.cardDesignVersion.findMany.mockResolvedValue(existing);
    await recordCardVersion(tx as never, { ...snapshot, kind: "APPROVED" }, minutes(T0, 1));
    expect(tx.cardDesignVersion.create.mock.calls[0][0].data).toMatchObject({ organisationId: "org_1", cardDesignId: "cd_1", kind: "APPROVED" });
    expect(tx.cardDesignVersion.deleteMany).toHaveBeenCalledWith({ where: { organisationId: "org_1", cardDesignId: "cd_1", id: { in: [`v${CARD_VERSION_LIMIT - 1}`] } } });
  });
});
