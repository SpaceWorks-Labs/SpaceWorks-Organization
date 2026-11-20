import "server-only";

import {
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { PAGE_FILE_KEY } from "@/lib/publicPage/links";
import { storageBucket, storageClient as client, storageConfigured } from "./client";
import { looksLikePdf, MAX_PAGE_FILE_BYTES, PAGE_FILE_TYPE } from "./pageFiles";

type UploadInput = {
  key: string;
  body: Buffer | Uint8Array | Blob;
  contentType?: string;
  organisationId?: string;
  userId?: string;
};

const ORGANISATION_DERIVATIVE_KEY =
  /^organisations\/([A-Za-z0-9_-]{1,128})\/(organisation-logos|member-id-photos|member-id-watermarks|member-id-artwork|page-images)\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i;
const USER_DERIVATIVE_KEY =
  /^users\/([A-Za-z0-9_-]{1,128})\/profile-images\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i;
/** A member's own photos: organisations/<org>/members/<member>/photo-<uuid>.webp (lib/storage/memberPhotos.ts). */
const MEMBER_PHOTO_KEY =
  /^organisations\/([A-Za-z0-9_-]{1,128})\/members\/[A-Za-z0-9_-]{1,64}\/photo-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i;

export function isPublicDerivativeKey(key: string) {
  return ORGANISATION_DERIVATIVE_KEY.test(key) || MEMBER_PHOTO_KEY.test(key) || USER_DERIVATIVE_KEY.test(key) || PAGE_FILE_KEY.test(key);
}

async function bytes(input: UploadInput["body"]) {
  return input instanceof Blob
    ? Buffer.from(await input.arrayBuffer())
    : Buffer.from(input);
}

export async function uploadFile(input: UploadInput): Promise<{ key: string }> {
  const isPageFile = PAGE_FILE_KEY.test(input.key);
  const organisationKeyMatch = ORGANISATION_DERIVATIVE_KEY.exec(input.key) ?? MEMBER_PHOTO_KEY.exec(input.key) ?? (isPageFile ? /^organisations\/([^/]+)\//.exec(input.key) : null);
  const userKeyMatch = USER_DERIVATIVE_KEY.exec(input.key);
  const validOwner =
    (organisationKeyMatch &&
      input.organisationId === organisationKeyMatch[1]) ||
    (userKeyMatch && input.userId === userKeyMatch[1]);
  if (!validOwner || input.contentType !== (isPageFile ? PAGE_FILE_TYPE : "image/webp")) {
    throw new Error("Invalid public derivative storage metadata.");
  }
  const uploadBody = await bytes(input.body);
  // A page file is a PDF by its first bytes, not by what the browser said, and is size-capped.
  if (isPageFile && (uploadBody.length > MAX_PAGE_FILE_BYTES || !looksLikePdf(uploadBody))) {
    throw new Error("Invalid page file.");
  }
  if (storageConfigured()) {
    await client().send(
      new PutObjectCommand({
        Bucket: storageBucket(),
        Key: input.key,
        Body: uploadBody,
        ContentType: input.contentType || "application/octet-stream",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    await prisma.asset.upsert({
      where: { key: input.key },
      create: {
        key: input.key,
        contentType: input.contentType || "application/octet-stream",
        byteSize: BigInt(uploadBody.length),
        provider: "s3",
        organisationId: input.organisationId || null,
      },
      update: {
        contentType: input.contentType || "application/octet-stream",
        byteSize: BigInt(uploadBody.length),
        provider: "s3",
        fileData: null,
        organisationId: input.organisationId || null,
      },
    });
    return { key: input.key };
  }
  if (process.env.NODE_ENV === "production")
    throw new Error("Private object storage is not configured.");
  await prisma.asset.upsert({
    where: { key: input.key },
    create: {
      key: input.key,
      contentType: input.contentType || "application/octet-stream",
      byteSize: BigInt(uploadBody.length),
      provider: "database",
      fileData: new Uint8Array(uploadBody),
      organisationId: input.organisationId || null,
    },
    update: {
      contentType: input.contentType || "application/octet-stream",
      byteSize: BigInt(uploadBody.length),
      provider: "database",
      fileData: new Uint8Array(uploadBody),
      organisationId: input.organisationId || null,
    },
  });
  return { key: input.key };
}

export async function downloadFile(key: string) {
  if (!isPublicDerivativeKey(key)) return null;
  const asset = await prisma.asset.findUnique({
    where: { key },
    select: { provider: true, fileData: true, contentType: true },
  });
  if (!asset || asset.contentType !== (PAGE_FILE_KEY.test(key) ? PAGE_FILE_TYPE : "image/webp")) return null;
  if (asset.provider === "s3") {
    if (!storageConfigured())
      throw new Error("Private object storage is not configured.");
    const object = await client().send(
      new GetObjectCommand({ Bucket: storageBucket(), Key: key }),
    );
    if (!object.Body) return null;
    return {
      body: await object.Body.transformToByteArray(),
      contentType:
        object.ContentType || asset.contentType || "application/octet-stream",
    };
  }
  return asset.fileData
    ? {
        body: asset.fileData,
        contentType: asset.contentType || "application/octet-stream",
      }
    : null;
}

export function getPublicUrl(key: string): string {
  if (!isPublicDerivativeKey(key))
    throw new Error("Invalid public derivative key.");
  const base = (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/$/, "");
  return `${base}/api/uploads/${key.replace(/^\//, "")}`;
}
