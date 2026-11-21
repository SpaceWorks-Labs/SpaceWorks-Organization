import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { checkAccentContrast } from "./contrast";
import { documentImageKeys, isPageUploadKeyFor, pageDocumentSchema, readPageDocument, type PageDocument } from "./sections";

/**
 * Validate a page document from the editor: the schema, every image belonging to this organisation and
 * still stored, and an accent whose button label can be read.
 */
/** A page document may not be larger than this once written as JSON (the editor autosaves, so every save is checked). */
export const MAX_PAGE_DOCUMENT_BYTES = 120_000;
/** Published versions kept per organisation, newest first. */
export const MAX_PAGE_VERSIONS = 20;

export async function validatePageDocument(organisationId: string, input: unknown): Promise<{ ok: true; document: PageDocument } | { ok: false; error: string; issues: Record<string, string[]> }> {
  const parsed = pageDocumentSchema.safeParse(input);
  if (!parsed.success) {
    const issues: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) (issues[issue.path.join(".") || "_root"] ??= []).push(issue.message);
    return { ok: false, error: "Some sections need attention.", issues };
  }
  const document = parsed.data;
  if (Buffer.byteLength(JSON.stringify(document)) > MAX_PAGE_DOCUMENT_BYTES) return { ok: false, error: "The page is too large. Remove some content.", issues: {} };
  const keys = [...new Set(documentImageKeys(document))];
  if (keys.some((key) => !isPageUploadKeyFor(key, organisationId))) return { ok: false, error: "An image or file belongs to another organisation. Upload it again.", issues: {} };
  if (keys.length) {
    const stored = await prisma.asset.count({ where: { organisationId, key: { in: keys } } });
    if (stored !== keys.length) return { ok: false, error: "An image or file is missing. Upload it again.", issues: {} };
  }
  if (document.accentColor && checkAccentContrast(document.accentColor).level === "fail") {
    return { ok: false, error: "Button labels can't be read on that accent. Choose another colour.", issues: { accentColor: ["Choose another colour"] } };
  }
  return { ok: true, document };
}

const asJson = (value: unknown) => value as Prisma.InputJsonValue;

/** Save the draft (visitors never see it). Returns the new revision the editor holds, and when it was saved. */
export async function savePageDraft(organisationId: string, document: PageDocument, userId: string, now = new Date()) {
  const row = await prisma.organisationPage.upsert({
    where: { organisationId },
    create: { organisationId, draft: asJson(document), draftSavedAt: now, draftSavedById: userId, updatedById: userId },
    update: { draft: asJson(document), draftSavedAt: now, draftSavedById: userId, updatedById: userId },
    select: { updatedAt: true },
  });
  return { revision: row.updatedAt.toISOString(), savedAt: now };
}

/**
 * Publish a document: it becomes the live columns, the draft is cleared, and the document is kept as a version (the
 * newest `MAX_PAGE_VERSIONS` stay), all in one transaction.
 */
export async function publishPage(organisationId: string, document: PageDocument, userId: string, now = new Date()) {
  const live = { tagline: document.tagline, coverAssetKey: document.coverAssetKey, accentColor: document.accentColor, sections: asJson(document.sections), publishedAt: now, publishedById: userId, updatedById: userId };
  await prisma.$transaction(async (tx) => {
    await tx.organisationPage.upsert({
      where: { organisationId },
      create: { organisationId, ...live },
      update: { ...live, draft: Prisma.DbNull, draftSavedAt: null, draftSavedById: null },
    });
    await tx.organisationPageVersion.create({ data: { organisationId, document: asJson(document), publishedAt: now, publishedById: userId } });
    const old = await tx.organisationPageVersion.findMany({ where: { organisationId }, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], skip: MAX_PAGE_VERSIONS, select: { id: true } });
    if (old.length) await tx.organisationPageVersion.deleteMany({ where: { organisationId, id: { in: old.map((row) => row.id) } } });
  });
}

export type PageVersionSummary = { id: string; publishedAt: Date; publishedByName: string | null; sections: number };

/** The kept published versions, newest first. No document content: restoring copies one into the draft. */
export async function listPageVersions(organisationId: string): Promise<PageVersionSummary[]> {
  const rows = await prisma.organisationPageVersion.findMany({ where: { organisationId }, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], take: MAX_PAGE_VERSIONS, select: { id: true, publishedAt: true, publishedById: true, document: true } });
  const ids = [...new Set(rows.flatMap((row) => (row.publishedById ? [row.publishedById] : [])))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const names = new Map(users.map((user) => [user.id, user.name]));
  return rows.map((row) => ({ id: row.id, publishedAt: row.publishedAt, publishedByName: (row.publishedById && names.get(row.publishedById)) || null, sections: readPageDocument(row.document).sections.length }));
}

/** One kept version's document, read leniently, for the editor's preview. Null when it isn't this organisation's. */
export async function loadPageVersion(organisationId: string, versionId: string): Promise<PageDocument | null> {
  const version = await prisma.organisationPageVersion.findFirst({ where: { id: versionId, organisationId }, select: { document: true } });
  return version ? readPageDocument(version.document) : null;
}

/** Copy a kept version into the draft. Null when it isn't this organisation's. Nothing live changes. */
export async function restorePageVersion(organisationId: string, versionId: string, userId: string) {
  const version = await prisma.organisationPageVersion.findFirst({ where: { id: versionId, organisationId }, select: { document: true } });
  if (!version) return null;
  const document = readPageDocument(version.document);
  const saved = await savePageDraft(organisationId, document, userId);
  return { document, ...saved };
}

type StoredPage = { published: PageDocument | null; publishedAt: Date | null; draft: PageDocument | null; draftSavedAt: Date | null; revision: string };

/** The stored page: what is live (null when unpublished) and any unpublished draft. */
export async function loadStoredPage(organisationId: string): Promise<StoredPage> {
  const page = await prisma.organisationPage.findUnique({ where: { organisationId } });
  if (!page) return { published: null, publishedAt: null, draft: null, draftSavedAt: null, revision: "new" };
  const published = page.publishedAt ? readPageDocument({ tagline: page.tagline, coverAssetKey: page.coverAssetKey, accentColor: page.accentColor, sections: page.sections }) : null;
  return { published, publishedAt: page.publishedAt, draft: page.draft ? readPageDocument(page.draft) : null, draftSavedAt: page.draftSavedAt, revision: page.updatedAt.toISOString() };
}
