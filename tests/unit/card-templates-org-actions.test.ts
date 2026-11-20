import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  write: vi.fn(),
  read: vi.fn(),
  rateLimit: vi.fn(),
  audit: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  deleteMany: vi.fn(),
  lock: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({ orgActionAccess: mocks.write }));
vi.mock("@/lib/cards/designerAccess", () => ({ cardDesignerReadAccess: mocks.read }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: mocks.rateLimit }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: mocks.audit }));
vi.mock("@/lib/db", () => {
  const cardTemplate = { findMany: mocks.findMany, count: mocks.count, create: mocks.create, deleteMany: mocks.deleteMany };
  return { prisma: { cardTemplate, $transaction: (run: (tx: unknown) => unknown) => run({ cardTemplate, $executeRaw: mocks.lock }) } };
});

import { deleteCardTemplate, listCardTemplates, saveCardTemplate } from "@/app/actions/card-templates";
import { defaultCardDesign } from "@/lib/cards/design/presets";
import { CARD_TEMPLATE_LIMIT, cleanTemplateName, templateDesign } from "@/lib/cards/orgTemplates";

const UUID = "0b5c3f9e-2a41-4c6d-9e8f-1a2b3c4d5e6f";
const artwork = (organisationId: string) => `/api/uploads/organisations/${organisationId}/member-id-artwork/${UUID}.webp`;
const context = { organisationName: "Example", planName: "" };
const org = { id: "org_1", slug: "example-org", name: "Example", status: "ACTIVE" };

function designWithArtwork() {
  const design = defaultCardDesign(context);
  return { ...design, front: { ...design.front, background: { ...design.front.background, imageUrl: artwork("org_2") } }, back: { ...design.back, background: { ...design.back.background, imageUrl: artwork("org_1") } } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.write.mockResolvedValue({ ok: true, userId: "user_1", organisation: org });
  mocks.read.mockResolvedValue({ ok: true, userId: "user_1", organisation: org });
  mocks.rateLimit.mockResolvedValue(false);
  mocks.count.mockResolvedValue(0);
  mocks.create.mockImplementation(async ({ data }: { data: { name: string; design: unknown } }) => ({ id: "tpl_1", name: data.name, design: data.design, createdAt: new Date("2026-11-20T10:00:00Z") }));
  mocks.deleteMany.mockResolvedValue({ count: 1 });
});

describe("template names and designs", () => {
  it("trims names, collapses spaces and refuses empty or over-long ones", () => {
    expect(cleanTemplateName("  Gold   members ")).toBe("Gold members");
    expect(cleanTemplateName("   ")).toBeNull();
    expect(cleanTemplateName("x".repeat(61))).toBeNull();
    expect(cleanTemplateName("x".repeat(60))).toHaveLength(60);
    expect(cleanTemplateName(42)).toBeNull();
  });

  it("normalises both sides and keeps only the organisation's own artwork", () => {
    const design = templateDesign(designWithArtwork(), "org_1", context);
    expect(design.front.background.imageUrl).toBeNull();
    expect(design.back.background.imageUrl).toBe(artwork("org_1"));
    expect(templateDesign("not a design", "org_1", context).front.widthMm).toBeGreaterThan(0);
  });
});

describe("saveCardTemplate", () => {
  const call = (input: Record<string, unknown> = {}) => saveCardTemplate({ organisationSlug: "example-org", name: "Gold", design: designWithArtwork(), ...input });

  it("needs cards.design to write, before anything is read or written", async () => {
    mocks.write.mockResolvedValue({ ok: false, error: "Only staff for the whole organisation can change this." });
    await expect(call()).resolves.toMatchObject({ ok: false });
    expect(mocks.write).toHaveBeenCalledWith("example-org", "cards.design");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("refuses a missing name without touching the database", async () => {
    await expect(call({ name: "  " })).resolves.toMatchObject({ ok: false });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("stores the scoped design under the caller's organisation and audits it", async () => {
    const result = await call();
    expect(result).toMatchObject({ ok: true, data: { template: { id: "tpl_1", name: "Gold" } } });
    const data = mocks.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ organisationId: "org_1", name: "Gold", createdById: "user_1" });
    expect(JSON.stringify(data.design)).not.toContain("org_2");
    expect(mocks.lock).toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "CARD_TEMPLATE_SAVED", organisationId: "org_1", targetType: "CardTemplate", targetId: "tpl_1" }));
  });

  it("stops at 50 templates per organisation", async () => {
    mocks.count.mockResolvedValue(CARD_TEMPLATE_LIMIT);
    await expect(call()).resolves.toMatchObject({ ok: false });
    expect(mocks.count).toHaveBeenCalledWith({ where: { organisationId: "org_1" } });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});

describe("deleteCardTemplate", () => {
  it("deletes only inside the caller's organisation, and a template elsewhere is not found", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    await expect(deleteCardTemplate({ organisationSlug: "example-org", templateId: "tpl_other" })).resolves.toEqual({ ok: false, error: "Not found." });
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { id: "tpl_other", organisationId: "org_1" } });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("audits a deletion", async () => {
    await expect(deleteCardTemplate({ organisationSlug: "example-org", templateId: "tpl_1" })).resolves.toEqual({ ok: true });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "CARD_TEMPLATE_DELETED", targetId: "tpl_1" }));
  });
});

describe("listCardTemplates", () => {
  it("reads with cards.design, from the caller's organisation only, re-scoping artwork", async () => {
    mocks.findMany.mockResolvedValue([{ id: "tpl_1", name: "Gold", createdAt: new Date("2026-11-20T10:00:00Z"), design: designWithArtwork() }]);
    const result = await listCardTemplates({ organisationSlug: "example-org" });
    expect(mocks.read).toHaveBeenCalledWith("example-org", ["cards.design"]);
    expect(mocks.findMany.mock.calls[0][0].where).toEqual({ organisationId: "org_1" });
    expect(result.ok && result.data?.templates[0]?.design.front.background.imageUrl).toBeNull();
  });

  it("passes a refusal through", async () => {
    mocks.read.mockResolvedValue({ ok: false, error: "Not found." });
    await expect(listCardTemplates({ organisationSlug: "other-org" })).resolves.toEqual({ ok: false, error: "Not found." });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
