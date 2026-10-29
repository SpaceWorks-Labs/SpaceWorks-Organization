import { crc32 } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { readZip, zipStream, type ZipEntry } from "@/lib/cards/zip";

async function* entries(list: ZipEntry[], fail = false) {
  for (const entry of list) yield entry;
  if (fail) throw new Error("render failed");
}

async function collect(stream: ReadableStream<Uint8Array>) {
  return Buffer.from(await new Response(stream).arrayBuffer());
}

const FILES: ZipEntry[] = [
  { name: "SWO-0001-annual-asha.pdf", data: new TextEncoder().encode("%PDF-1.7 first") },
  { name: "SWO-0002-annual-ശ്രീ.pdf", data: new Uint8Array(70_000).fill(7) },
];

describe("streaming ZIP", () => {
  it("writes each entry as it arrives, with a central directory that matches", async () => {
    const onEnd = vi.fn();
    const zip = await collect(zipStream(entries(FILES), onEnd));
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(readZip(zip).map((entry) => [entry.name, Buffer.from(entry.data)])).toEqual(FILES.map((entry) => [entry.name, Buffer.from(entry.data)]));

    // Read it the way unzip tools do: from the end record through the central directory.
    const end = zip.length - 22;
    expect(zip.readUInt32LE(end)).toBe(0x06054b50);
    expect(zip.readUInt16LE(end + 10)).toBe(FILES.length);
    let offset = zip.readUInt32LE(end + 16);
    expect(zip.readUInt32LE(end + 12)).toBe(end - offset);
    for (const file of FILES) {
      const nameLength = zip.readUInt16LE(offset + 28);
      expect(zip.toString("utf8", offset + 46, offset + 46 + nameLength)).toBe(file.name);
      expect(zip.readUInt32LE(offset + 16)).toBe(crc32(file.data) >>> 0);
      const local = zip.readUInt32LE(offset + 42);
      expect(zip.readUInt32LE(local)).toBe(0x04034b50);
      offset += 46 + nameLength;
    }
  });

  it("an empty set is still a valid archive", async () => {
    const zip = await collect(zipStream(entries([])));
    expect(zip).toHaveLength(22);
    expect(zip.readUInt32LE(0)).toBe(0x06054b50);
  });

  it("releases what the producer holds when rendering fails or the download stops", async () => {
    const failed = vi.fn();
    await expect(collect(zipStream(entries(FILES, true), failed))).rejects.toThrow("render failed");
    expect(failed).toHaveBeenCalledTimes(1);

    const cancelled = vi.fn();
    let closed = false;
    async function* endless() {
      try {
        for (let index = 0; ; index += 1) yield { name: `${index}.pdf`, data: new Uint8Array(10) };
      } finally {
        closed = true;
      }
    }
    const reader = zipStream(endless(), cancelled).getReader();
    await reader.read();
    await reader.cancel();
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(closed).toBe(true);
  });

  it("keeps the producer's slot until the card being rendered when the download stops has finished", async () => {
    const released = vi.fn();
    let finishRender: (entry: IteratorResult<ZipEntry>) => void = () => undefined;
    const slow: AsyncIterable<ZipEntry> = {
      [Symbol.asyncIterator]: () => ({
        next: () => new Promise<IteratorResult<ZipEntry>>((resolve) => (finishRender = resolve)),
        return: async () => ({ done: true, value: undefined }),
      }),
    };
    const stream = zipStream(slow, released);
    // The stream pulls the first entry straight away; stop the download while it renders.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const cancelling = stream.cancel();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(released).not.toHaveBeenCalled();
    finishRender({ done: false, value: FILES[0]! });
    await cancelling;
    expect(released).toHaveBeenCalledTimes(1);
  });
});
