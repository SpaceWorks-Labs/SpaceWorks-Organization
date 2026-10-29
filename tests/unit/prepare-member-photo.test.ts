import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
import { prepareMemberPhoto } from "@/lib/membership/photo";

const file = (body: Uint8Array) => new File([body as Uint8Array<ArrayBuffer>], "photo.png", { type: "image/png" });

describe("preparing member photos before writes", () => {
  it("refuses a forged image signature and a valid header with an undecodable body", async () => {
    expect(await prepareMemberPhoto(file(new Uint8Array([1, 2, 3])))).toHaveProperty("error");
    const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: "red" } }).png().toBuffer();
    expect(await prepareMemberPhoto(file(png.subarray(0, 33)))).toHaveProperty("error");
  });

  it("refuses more than 5 MB before reading the bytes", async () => {
    const oversized = file(new Uint8Array(5 * 1024 * 1024 + 1));
    const read = vi.spyOn(oversized, "arrayBuffer");
    expect(await prepareMemberPhoto(oversized)).toEqual({ error: "Photos must be 5 MB or smaller." });
    expect(read).not.toHaveBeenCalled();
  });

  it("refuses unsafe dimensions", async () => {
    const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: "red" } }).png().toBuffer();
    png.writeUInt32BE(30_000, 16);
    png.writeUInt32BE(30_000, 20);
    expect(await prepareMemberPhoto(file(png))).toHaveProperty("error");
  });

  it("accepts a decoded image and returns square WebP bytes with metadata stripped", async () => {
    const png = await sharp({ create: { width: 320, height: 240, channels: 3, background: "red" } }).withMetadata().png().toBuffer();
    const result = await prepareMemberPhoto(file(png));
    expect(result).not.toHaveProperty("error");
    if ("error" in result) throw new Error(result.error);
    const metadata = await sharp(result.body).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 600, height: 600 });
    expect(metadata.exif).toBeUndefined();
  });
});
