import { crc32 } from "node:zlib";

/*
 * A minimal streaming ZIP writer (stored entries, no compression). Card PDFs are already compressed, so
 * storing them keeps memory and CPU low on small instances and avoids a dependency. Each entry is whole
 * when it arrives, so its CRC and size go in the local header (no data descriptors) and the entry is
 * written straight out; only the small central directory is held until the end.
 */

export type ZipEntry = { name: string; data: Uint8Array };

const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1; // 1980-01-01
const MAX_ZIP32 = 0xffff_ffff;

function headers(name: Buffer, crc: number, size: number, offset: number) {
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(0, 8); // stored
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(size, 18);
  local.writeUInt32LE(size, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(size, 20);
  central.writeUInt32LE(size, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  return { local: Buffer.concat([local, name]), central: Buffer.concat([central, name]) };
}

function endOfCentralDirectory(count: number, centralSize: number, centralOffset: number) {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  return end;
}

/** A reader that takes nothing for `idleMs`, or a download still going after `totalMs`, is stopped. */
export const ZIP_DEADLINES = { idleMs: 2 * 60_000, totalMs: 15 * 60_000 };

/**
 * A ZIP written as `entries` yields: one entry is read per pull, so a slow reader slows the producer.
 * `onEnd` runs once when the stream finishes, fails, is cancelled or misses a deadline (to release what the
 * producer holds); on a cancel or a deadline, only after the entry being produced has settled.
 */
export function zipStream(entries: AsyncIterable<ZipEntry>, onEnd: () => void = () => undefined, deadlines = ZIP_DEADLINES): ReadableStream<Uint8Array> {
  const iterator = entries[Symbol.asyncIterator]();
  const centrals: Buffer[] = [];
  let offset = 0;
  let ended = false;
  // The entry being produced: a cancel waits for it, so the producer's slot isn't released mid-render.
  let inFlight: Promise<unknown> | null = null;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let total: ReturnType<typeof setTimeout> | undefined;
  const end = () => {
    if (ended) return;
    ended = true;
    clearTimeout(idle);
    clearTimeout(total);
    onEnd();
  };
  const stop = async () => {
    await inFlight?.catch(() => undefined);
    end();
    await iterator.return?.();
  };
  // A client that starts a download and stops reading must not keep the producer's slot.
  const expire = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    controller.error(new Error("The download timed out."));
    void stop().catch(() => undefined);
  };
  return new ReadableStream<Uint8Array>({
    start(controller) {
      total = setTimeout(() => expire(controller), deadlines.totalMs);
    },
    async pull(controller) {
      clearTimeout(idle);
      try {
        const pending = iterator.next();
        inFlight = pending;
        const next = await pending.finally(() => {
          inFlight = null;
        });
        if (next.done) {
          const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
          for (const central of centrals) controller.enqueue(central);
          controller.enqueue(endOfCentralDirectory(centrals.length, centralSize, offset));
          controller.close();
          end();
          return;
        }
        const name = Buffer.from(next.value.name, "utf8");
        const data = Buffer.from(next.value.data.buffer, next.value.data.byteOffset, next.value.data.byteLength);
        if (centrals.length >= 0xffff || offset + 30 + name.length + data.length > MAX_ZIP32) throw new Error("ZIP too large.");
        const { local, central } = headers(name, crc32(data) >>> 0, data.length, offset);
        controller.enqueue(local);
        controller.enqueue(data);
        centrals.push(central);
        offset += local.length + data.length;
        if (!ended) idle = setTimeout(() => expire(controller), deadlines.idleMs);
      } catch (error) {
        end();
        controller.error(error);
      }
    },
    cancel: stop,
  });
}

/** Read entry names and contents back (stored entries with sizes in the local header). Used by tests. */
export function readZip(zip: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const size = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extra = zip.readUInt16LE(offset + 28);
    const name = zip.toString("utf8", offset + 30, offset + 30 + nameLength);
    const start = offset + 30 + nameLength + extra;
    entries.push({ name, data: zip.subarray(start, start + size) });
    offset = start + size;
  }
  return entries;
}
