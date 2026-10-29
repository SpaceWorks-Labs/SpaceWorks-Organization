import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { checkAccentContrast } from "./contrast";
import { documentImageKeys, isPageImageKeyFor, pageDocumentSchema, readPageDocument, type PageDocument } from "./sections";

/**
 * Validate a page document from the editor: the schema, every image belonging to this organisation and
 * still stored, and an accent whose button label can be read.
 */
export async function validatePageDocument(organisationId: string, input: unknown): Promise<{ ok: true; document: PageDocument } | { ok: false; error: string; issues: Record<string, string[]> }> {
  const parsed = pageDocumentSchema.safeParse(input);
  if (!parsed.success) {
    const issues: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) (issues[issue.path.join(".") || "_root"] ??= []).push(issue.message);
    return { ok: false, error: "Some sections need attention.", issues };
  }
  const document = parsed.data;
  const keys = [...new Set(documentImageKeys(document))];
  if (keys.some((key) => !isPageImageKeyFor(key, organisationId))) return { ok: false, error: "An image belongs to another organisation. Upload it again.", issues: {} };
  if (keys.length) {
    const stored = await prisma.asset.count({ where: { organisationId, key: { in: keys } } });
    if (stored !== keys.length) return { ok: false, error: "An image is missing. Upload it again.", issues: {} };
  }
  if (document.accentColor && checkAccentContrast(document.accentColor).level === "fail") {
    return { ok: false, error: "Button labels can't be read on that accent. Choose another colour.", issues: { accentColor: ["Choose another colour"] } };
  }
  return { ok: true, document };
}

const asJson = (value: unknown) => value as Prisma.InputJsonValue;

export async function savePageDraft(organisationId: string, document: PageDocument, userId: string) {
  await prisma.organisationPage.upsert({
    where: { organisationId },
    create: { organisationId, draft: asJson(document), updatedById: userId },
    update: { draft: asJson(document), updatedById: userId },
  });
}

/** Publish a document: it becomes the live columns, and the draft is cleared. */
export async function publishPage(organisationId: string, document: PageDocument, userId: string, now = new Date()) {
  const live = { tagline: document.tagline, coverAssetKey: document.coverAssetKey, accentColor: document.accentColor, sections: asJson(document.sections), publishedAt: now, updatedById: userId };
  await prisma.organisationPage.upsert({
    where: { organisationId },
    create: { organisationId, ...live },
    update: { ...live, draft: Prisma.DbNull },
  });
}

type StoredPage = { published: PageDocument | null; publishedAt: Date | null; draft: PageDocument | null; revision: string };

/** The stored page: what is live (null when unpublished) and any unpublished draft. */
export async function loadStoredPage(organisationId: string): Promise<StoredPage> {
  const page = await prisma.organisationPage.findUnique({ where: { organisationId } });
  if (!page) return { published: null, publishedAt: null, draft: null, revision: "new" };
  const published = page.publishedAt ? readPageDocument({ tagline: page.tagline, coverAssetKey: page.coverAssetKey, accentColor: page.accentColor, sections: page.sections }) : null;
  return { published, publishedAt: page.publishedAt, draft: page.draft ? readPageDocument(page.draft) : null, revision: page.updatedAt.toISOString() };
}
