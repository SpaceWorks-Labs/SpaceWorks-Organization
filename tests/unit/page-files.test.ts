import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ download: vi.fn(), put: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/storage/client", () => ({ storageConfigured: () => false, storageBucket: () => "b", storageClient: () => ({ send: mocks.put }) }));
vi.mock("@/lib/db", () => ({ prisma: { asset: { upsert: mocks.upsert } } }));

import { isPublicDerivativeKey, uploadFile } from "@/lib/storage";
import { looksLikePdf, MAX_PAGE_FILE_BYTES, safeDownloadName } from "@/lib/storage/pageFiles";
import { isPageUploadKeyFor } from "@/lib/publicPage/links";
import { newSection, sectionSchema } from "@/lib/publicPage/sections";

const uuid = "123e4567-e89b-42d3-a456-426614174000";
const key = `organisations/org_1/page-files/${uuid}.pdf`;
const pdf = new Uint8Array([...Buffer.from("%PDF-1.7\n%test\n")]);

describe("page files (PDF downloads)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("recognises a PDF by its first bytes and cleans a download name", () => {
    expect(looksLikePdf(pdf)).toBe(true);
    expect(looksLikePdf(new Uint8Array(Buffer.from("<html><script>alert(1)</script>")))).toBe(false);
    expect(safeDownloadName('../../Membership "form".pdf')).toBe("Membership _form.pdf");
    expect(safeDownloadName("")).toBe("download.pdf");
    expect(safeDownloadName("a\r\nSet-Cookie: x=1")).not.toMatch(/[\r\n:]/);
  });

  it("stores only this organisation's PDFs, as application/pdf, with the PDF signature and under the size cap", async () => {
    expect(isPublicDerivativeKey(key)).toBe(true);
    await uploadFile({ key, body: pdf, contentType: "application/pdf", organisationId: "org_1" });
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    await expect(uploadFile({ key, body: pdf, contentType: "application/pdf", organisationId: "org_2" })).rejects.toThrow();
    await expect(uploadFile({ key, body: pdf, contentType: "image/webp", organisationId: "org_1" })).rejects.toThrow();
    await expect(uploadFile({ key, body: new Uint8Array(Buffer.from("not a pdf at all")), contentType: "application/pdf", organisationId: "org_1" })).rejects.toThrow();
    await expect(uploadFile({ key, body: new Uint8Array(MAX_PAGE_FILE_BYTES + 1).fill(0x25), contentType: "application/pdf", organisationId: "org_1" })).rejects.toThrow();
    // A PDF can't be stored under an image key, nor an image under a file key.
    await expect(uploadFile({ key: `organisations/org_1/page-images/${uuid}.webp`, body: pdf, contentType: "application/pdf", organisationId: "org_1" })).rejects.toThrow();
  });

  it("lets a downloads section hold the organisation's own images or PDFs, and nothing else", () => {
    expect(isPageUploadKeyFor(key, "org_1")).toBe(true);
    expect(isPageUploadKeyFor(key, "org_2")).toBe(false);
    expect(isPageUploadKeyFor(`organisations/org_1/page-images/${uuid}.webp`, "org_1")).toBe(true);
    const parse = (fileKey: string) => sectionSchema.safeParse({ ...newSection("downloads", "sect000001"), files: [{ key: fileKey, label: "Form" }] }).success;
    expect(parse(key)).toBe(true);
    expect(parse(`organisations/org_1/page-images/${uuid}.webp`)).toBe(true);
    expect(parse(`organisations/org_1/organisation-logos/${uuid}.webp`)).toBe(false);
    expect(parse("https://example.test/a.pdf")).toBe(false);
  });
});

describe("serving a page file", () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it("is an attachment with a safe name, application/pdf and nosniff", async () => {
    vi.doMock("@/lib/storage", async (original) => ({ ...(await original<typeof import("@/lib/storage")>()), downloadFile: mocks.download }));
    mocks.download.mockResolvedValue({ body: pdf, contentType: "application/pdf" });
    const { GET } = await import("@/app/api/uploads/[...key]/route");
    const response = await GET(new NextRequest(`https://members.example.test/api/uploads/${key}?name=${encodeURIComponent('Fees "2026"\r\n')}`), { params: Promise.resolve({ key: key.split("/") }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="Fees _2026.pdf"');
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
