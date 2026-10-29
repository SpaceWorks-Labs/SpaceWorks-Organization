import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ findMany: vi.fn(), deleteMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { asset: { findMany: db.findMany, deleteMany: db.deleteMany } } }));

import { DeleteObjectsCommand, ListObjectsV2Command, ListObjectVersionsCommand } from "@aws-sdk/client-s3";
import { storageClient } from "@/lib/storage/client";
import { deleteFilesWithHistory, deleteMemberPhotos, memberPhotoKey, memberPhotoPrefix } from "@/lib/storage/memberPhotos";
import { isPublicDerivativeKey } from "@/lib/storage";
import { managedImageKey, memberPhotoUrl } from "@/lib/cards/imageUrl";

const uuid = "123e4567-e89b-42d3-a456-426614174000";
const ENV = ["S3_BUCKET", "S3_REGION", "S3_ENDPOINT", "S3_FORCE_PATH_STYLE", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const;
const saved = Object.fromEntries(ENV.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of ENV) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
  vi.restoreAllMocks();
  db.findMany.mockReset();
  db.deleteMany.mockReset();
});

function useBucket(settings: Partial<Record<(typeof ENV)[number], string>>) {
  for (const name of ENV) delete process.env[name];
  Object.assign(process.env, settings);
}

describe("member photo keys", () => {
  it("puts every photo under the member's own prefix", () => {
    expect(memberPhotoPrefix("org_1", "mem_1")).toBe("organisations/org_1/members/mem_1/");
    expect(memberPhotoKey("org_1", "mem_1", uuid)).toBe(`organisations/org_1/members/mem_1/photo-${uuid}.webp`);
    expect(memberPhotoKey("org_1", "mem_1")).toMatch(/^organisations\/org_1\/members\/mem_1\/photo-[0-9a-f-]{36}\.webp$/);
    expect(() => memberPhotoPrefix("org_1", "../mem")).toThrow();
    expect(() => memberPhotoKey("org_1", "mem_1", "not-a-uuid")).toThrow();
  });

  it("serves the new layout and still reads the old one", () => {
    expect(isPublicDerivativeKey(memberPhotoKey("org_1", "mem_1", uuid))).toBe(true);
    expect(isPublicDerivativeKey(`organisations/org_1/member-id-photos/${uuid}.webp`)).toBe(true);
    expect(isPublicDerivativeKey(`organisations/org_1/members/mem_1/other-${uuid}.webp`)).toBe(false);
    expect(isPublicDerivativeKey(`organisations/org_1/members/../photo-${uuid}.webp`)).toBe(false);
  });

  it("draws only the member's own photo on their card", () => {
    const own = `/api/uploads/organisations/org_1/members/mem_1/photo-${uuid}.webp`;
    const scope = { kind: "member", organisationId: "org_1", memberId: "mem_1" } as const;
    expect(managedImageKey(own, scope)).toBe(own.slice("/api/uploads/".length));
    expect(managedImageKey(own, { ...scope, memberId: "mem_2" })).toBeNull();
    expect(managedImageKey(own, { ...scope, organisationId: "org_2" })).toBeNull();
    expect(managedImageKey(`/api/uploads/organisations/org_1/member-id-photos/${uuid}.webp`, scope)).not.toBeNull();
    expect(memberPhotoUrl({ id: "mem_2", organisationId: "org_1", photoUrl: own, user: null })).toBeNull();
    expect(memberPhotoUrl({ id: "mem_1", organisationId: "org_1", photoUrl: own, user: null })).toBe(own);
  });
});

describe("one S3 client", () => {
  it("reaches Cloudflare R2: its endpoint, region auto, path-style addressing", async () => {
    useBucket({ S3_BUCKET: "swo", S3_REGION: "auto", S3_ENDPOINT: "https://account.r2.cloudflarestorage.com", S3_FORCE_PATH_STYLE: "1", S3_ACCESS_KEY_ID: "key", S3_SECRET_ACCESS_KEY: "secret" });
    const client = storageClient();
    expect(await client.config.region()).toBe("auto");
    expect(client.config.forcePathStyle).toBe(true);
    const endpoint = await client.config.endpoint!();
    expect(endpoint.hostname).toBe("account.r2.cloudflarestorage.com");
    expect(await client.config.requestChecksumCalculation()).toBe("WHEN_REQUIRED");
    expect(storageClient()).toBe(client);
  });

  it("reaches Silo (MinIO) on the VPS, and builds a new client when the settings change", async () => {
    useBucket({ S3_BUCKET: "swo", S3_REGION: "auto", S3_ENDPOINT: "https://account.r2.cloudflarestorage.com", S3_FORCE_PATH_STYLE: "1" });
    const r2 = storageClient();
    useBucket({ S3_BUCKET: "spaceworks-organization", S3_REGION: "us-east-1", S3_ENDPOINT: "https://minio:9000", S3_FORCE_PATH_STYLE: "1" });
    const silo = storageClient();
    expect(silo).not.toBe(r2);
    expect((await silo.config.endpoint!()).hostname).toBe("minio");
    expect(silo.config.forcePathStyle).toBe(true);
  });
});

type Command = ListObjectVersionsCommand | ListObjectsV2Command | DeleteObjectsCommand;
const prefix = "organisations/org_1/members/mem_1/";
const R2 = { S3_BUCKET: "swo", S3_REGION: "auto", S3_ENDPOINT: "https://account.r2.cloudflarestorage.com", S3_FORCE_PATH_STYLE: "1" };

/** Record what reaches the bucket; `answer` replies to each command. */
function bucket(answer: (command: Command) => unknown) {
  const sent: Command[] = [];
  vi.spyOn(storageClient(), "send").mockImplementation(async (command: unknown) => {
    sent.push(command as Command);
    return answer(command as Command);
  });
  const deleted = () => sent.filter((command) => command instanceof DeleteObjectsCommand).map((command) => command.input.Delete!.Objects!);
  return { sent, deleted };
}

describe("erasing a member's photos", () => {
  it("deletes every version and delete marker under the prefix, page by page, by VersionId", async () => {
    useBucket(R2);
    const { sent, deleted } = bucket((command) => {
      if (command instanceof ListObjectVersionsCommand) {
        return command.input.KeyMarker
          ? { Versions: [{ Key: `${prefix}photo-${uuid}.webp`, VersionId: "v3" }], IsTruncated: false }
          : {
              Versions: [{ Key: `${prefix}photo-old.webp`, VersionId: "v1" }, { Key: `${prefix}photo-old.webp`, VersionId: "v2" }],
              DeleteMarkers: [{ Key: `${prefix}photo-old.webp`, VersionId: "m1" }],
              IsTruncated: true, NextKeyMarker: `${prefix}photo-old.webp`, NextVersionIdMarker: "m1",
            };
      }
      return {};
    });
    db.findMany.mockResolvedValue([{ key: `${prefix}photo-${uuid}.webp` }]);
    db.deleteMany.mockResolvedValue({ count: 1 });

    expect(await deleteMemberPhotos("org_1", "mem_1")).toBe(2);
    const lists = sent.filter((command) => command instanceof ListObjectVersionsCommand);
    expect(lists.map((command) => [command.input.Prefix, command.input.VersionIdMarker])).toEqual([[prefix, undefined], [prefix, "m1"]]);
    expect(deleted()).toEqual([[
      { Key: `${prefix}photo-old.webp`, VersionId: "v1" }, { Key: `${prefix}photo-old.webp`, VersionId: "v2" },
      { Key: `${prefix}photo-old.webp`, VersionId: "m1" }, { Key: `${prefix}photo-${uuid}.webp`, VersionId: "v3" },
    ]]);
    expect(sent.some((command) => command instanceof ListObjectsV2Command)).toBe(false);
    expect(db.deleteMany).toHaveBeenCalledWith({ where: { key: { startsWith: prefix } } });
  });

  it("handles unversioned stores and deletes at most 1000 objects per request", async () => {
    useBucket(R2);
    const versions = Array.from({ length: 1500 }, (_, index) => ({ Key: `${prefix}photo-${index}.webp`, VersionId: index % 2 ? "null" : undefined }));
    const { deleted } = bucket((command) => (command instanceof ListObjectVersionsCommand ? { Versions: versions, IsTruncated: false } : {}));
    db.findMany.mockResolvedValue([]);
    db.deleteMany.mockResolvedValue({ count: 0 });
    expect(await deleteMemberPhotos("org_1", "mem_1")).toBe(1500);
    expect(deleted().map((batch) => batch.length)).toEqual([1000, 500]);
    expect(deleted()[0]!.slice(0, 2)).toEqual([{ Key: `${prefix}photo-0.webp` }, { Key: `${prefix}photo-1.webp`, VersionId: "null" }]);
  });

  it("falls back to current objects, and logs it, when the store refuses the versions API", async () => {
    useBucket(R2);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { deleted } = bucket((command) => {
      if (command instanceof ListObjectVersionsCommand) throw Object.assign(new Error("not implemented"), { name: "NotImplemented", $metadata: { httpStatusCode: 501 } });
      if (command instanceof ListObjectsV2Command) return { Contents: [{ Key: `${prefix}photo-${uuid}.webp` }], IsTruncated: false };
      return {};
    });
    db.findMany.mockResolvedValue([]);
    db.deleteMany.mockResolvedValue({ count: 0 });
    expect(await deleteMemberPhotos("org_1", "mem_1")).toBe(1);
    expect(deleted()).toEqual([[{ Key: `${prefix}photo-${uuid}.webp` }]]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("refused object versions"));
  });

  it("fails rather than pretending when the store won't delete a version", async () => {
    useBucket(R2);
    bucket((command) => (command instanceof ListObjectVersionsCommand
      ? { Versions: [{ Key: `${prefix}photo-a.webp`, VersionId: "v1" }], IsTruncated: false }
      : { Errors: [{ Key: `${prefix}photo-a.webp`, VersionId: "v1", Code: "InternalError" }] }));
    db.findMany.mockResolvedValue([]);
    await expect(deleteMemberPhotos("org_1", "mem_1")).rejects.toThrow("refused to delete");
    expect(db.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes every version of a single replaced or moved photo, and only that key", async () => {
    useBucket(R2);
    const key = `organisations/org_1/member-id-photos/${uuid}.webp`;
    const { sent, deleted } = bucket((command) => (command instanceof ListObjectVersionsCommand
      ? { Versions: [{ Key: key, VersionId: "v1" }, { Key: `${key}.other`, VersionId: "x" }], DeleteMarkers: [{ Key: key, VersionId: "m1" }], IsTruncated: false }
      : {}));
    db.findMany.mockResolvedValue([{ key }]);
    db.deleteMany.mockResolvedValue({ count: 1 });
    await deleteFilesWithHistory([key]);
    expect((sent[0] as ListObjectVersionsCommand).input.Prefix).toBe(key);
    expect(deleted()).toEqual([[{ Key: key, VersionId: "v1" }, { Key: key, VersionId: "m1" }]]);
    expect(db.deleteMany).toHaveBeenCalledWith({ where: { key: { in: [key] } } });
  });

  it("without object storage, deletes the Asset rows under the prefix", async () => {
    useBucket({});
    db.findMany.mockResolvedValue([{ key: "organisations/org_1/members/mem_1/photo-a.webp" }]);
    db.deleteMany.mockResolvedValue({ count: 1 });
    expect(await deleteMemberPhotos("org_1", "mem_1")).toBe(1);
    expect(db.deleteMany).toHaveBeenCalledWith({ where: { key: { startsWith: "organisations/org_1/members/mem_1/" } } });
  });
});
