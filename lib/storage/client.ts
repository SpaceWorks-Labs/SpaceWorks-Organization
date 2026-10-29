import "server-only";

import { S3Client } from "@aws-sdk/client-s3";

/*
 * The one S3 client for every stored file (public image derivatives, private files, member photos). The
 * same settings reach any S3-compatible store:
 * - Silo (MinIO) on a VPS: S3_ENDPOINT=https://minio:9000, S3_FORCE_PATH_STYLE=1, any S3_REGION.
 * - Cloudflare R2: S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com, S3_REGION=auto,
 *   S3_FORCE_PATH_STYLE=1.
 * - Amazon S3: no endpoint, the bucket's region, path style off (or an IAM role instead of keys).
 * Checksums are sent only where an operation requires one: R2 and older MinIO releases reject some of the
 * optional checksum headers newer SDKs add by default.
 */

export function storageConfigured() {
  return Boolean(process.env.S3_BUCKET && process.env.S3_REGION);
}

export function storageBucket() {
  return process.env.S3_BUCKET!;
}

const CACHE = Symbol.for("swo.s3Client");
type ClientHolder = typeof globalThis & { [CACHE]?: { signature: string; client: S3Client } };

/** A client for the configured bucket, reused while the settings stay the same. */
export function storageClient(): S3Client {
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === "1";
  const signature = JSON.stringify([process.env.S3_REGION, endpoint, forcePathStyle, accessKeyId, secretAccessKey]);
  const holder = globalThis as ClientHolder;
  if (holder[CACHE]?.signature === signature) return holder[CACHE].client;
  const client = new S3Client({
    region: process.env.S3_REGION!,
    ...(endpoint ? { endpoint } : {}),
    forcePathStyle,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
  });
  holder[CACHE] = { signature, client };
  return client;
}
