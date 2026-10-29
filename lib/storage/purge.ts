import "server-only";

import { DeleteObjectsCommand, ListObjectsV2Command, ListObjectVersionsCommand, type ObjectIdentifier } from "@aws-sdk/client-s3";
import { storageBucket, storageClient } from "./client";

/*
 * Delete objects for good, with their history. Silo keeps bucket versioning on, so a plain delete only adds
 * a delete marker and the earlier versions (a member's old photos, an export with their details) stay
 * recoverable. Every version and delete marker is listed (ListObjectVersions) and deleted by VersionId, up
 * to 1000 per request. Stores without versioning (R2, plain S3) list only their current objects, with a
 * null version or none. If the store refuses the versions API, current objects are deleted instead, and
 * that is logged.
 */

const BATCH = 1000;
const REFUSED = new Set(["NotImplemented", "AccessDenied", "MethodNotAllowed", "InvalidRequest"]);

type PurgeTarget = { prefix: string } | { keys: string[] };

function refused(error: unknown) {
  const failure = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return REFUSED.has(failure.name ?? failure.Code ?? "") || [403, 405, 501].includes(failure.$metadata?.httpStatusCode ?? 0);
}

class Refused extends Error {}

/** Delete in batches; errors the store reports per object fail the call (or count as refused). */
async function deleteBatches(objects: ObjectIdentifier[], versioned: boolean) {
  for (let start = 0; start < objects.length; start += BATCH) {
    const result = await storageClient().send(new DeleteObjectsCommand({ Bucket: storageBucket(), Delete: { Objects: objects.slice(start, start + BATCH), Quiet: true } }));
    const errors = result.Errors ?? [];
    if (errors.length === 0) continue;
    if (versioned && errors.every((error) => REFUSED.has(error.Code ?? ""))) throw new Refused();
    throw new Error(`Storage refused to delete ${errors.length} objects.`);
  }
}

/** Every version and delete marker under `prefix` (only `exact` when given). */
async function listVersions(prefix: string, exact?: string) {
  const found: ObjectIdentifier[] = [];
  let keyMarker: string | undefined;
  let versionMarker: string | undefined;
  for (;;) {
    const page = await storageClient().send(new ListObjectVersionsCommand({ Bucket: storageBucket(), Prefix: prefix, KeyMarker: keyMarker, VersionIdMarker: versionMarker, MaxKeys: BATCH }));
    for (const item of [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]) {
      if (!item.Key?.startsWith(prefix) || (exact !== undefined && item.Key !== exact)) continue;
      found.push(item.VersionId ? { Key: item.Key, VersionId: item.VersionId } : { Key: item.Key });
    }
    if (!page.IsTruncated) return found;
    keyMarker = page.NextKeyMarker;
    versionMarker = page.NextVersionIdMarker;
  }
}

/** Current objects only: the fallback when the versions API is refused. */
async function listCurrent(target: PurgeTarget) {
  if ("keys" in target) return target.keys.map((Key) => ({ Key }));
  const found: ObjectIdentifier[] = [];
  let token: string | undefined;
  do {
    const page = await storageClient().send(new ListObjectsV2Command({ Bucket: storageBucket(), Prefix: target.prefix, ContinuationToken: token, MaxKeys: BATCH }));
    for (const item of page.Contents ?? []) if (item.Key?.startsWith(target.prefix)) found.push({ Key: item.Key });
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return found;
}

/** Delete every version of the target's objects. Returns the keys that had anything stored. */
export async function purgeObjects(target: PurgeTarget): Promise<string[]> {
  try {
    const objects = "keys" in target
      ? (await Promise.all([...new Set(target.keys)].map((key) => listVersions(key, key)))).flat()
      : await listVersions(target.prefix);
    await deleteBatches(objects, true);
    return [...new Set(objects.map((item) => item.Key!))];
  } catch (error) {
    if (!(error instanceof Refused) && !refused(error)) throw error;
    console.error("[storage] the store refused object versions; deleting current objects only, earlier versions may remain");
    const objects = await listCurrent(target);
    await deleteBatches(objects, false);
    return [...new Set(objects.map((item) => item.Key!))];
  }
}
