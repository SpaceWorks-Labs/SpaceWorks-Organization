import "server-only";
import { Queue, type ConnectionOptions } from "bullmq";
import { JOB_OPTIONS, QUEUE_NAMES, type QueueJob, type QueueName } from "./definitions";

/** Separate from the short-lived rate-limit client: blocking workers retry indefinitely. */
export function queueConnection(blocking = false, url = process.env.REDIS_URL): ConnectionOptions {
  if (!url || url === "memory://") throw new Error("Redis is required for background jobs.");
  const parsed = new URL(url);
  if (!["redis:", "rediss:"].includes(parsed.protocol)) throw new Error("Invalid Redis protocol.");
  const db = parsed.pathname.slice(1) || "0";
  if (!/^\d+$/.test(db)) throw new Error("Invalid Redis database.");
  return {
    host: parsed.hostname, port: Number(parsed.port || 6379), db: Number(db),
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    ...(parsed.protocol === "rediss:" ? { tls: {} } : {}),
    maxRetriesPerRequest: blocking ? null : 1,
    connectTimeout: 2_000,
    enableOfflineQueue: blocking,
    retryStrategy: blocking ? times => Math.min(times * 500, 10_000) : () => null,
  };
}
export function createQueues(prefix = "swo:jobs", connection = queueConnection()) {
  return Object.fromEntries(QUEUE_NAMES.map(name => {
    const queue = new Queue<QueueJob, unknown, string>(name, { connection, prefix, defaultJobOptions: JOB_OPTIONS });
    queue.on("error", () => console.error("[queue] Redis connection failed"));
    return [name, queue];
  })) as Record<QueueName, Queue<QueueJob, unknown, string>>;
}
export type Queues = ReturnType<typeof createQueues>;
const KEY = Symbol.for("swo.queues");
type Global = typeof globalThis & { [KEY]?: Queues };
export function getQueues(blocking = false): Queues {
  const global = globalThis as Global;
  if (global[KEY]) return global[KEY];
  const queues = createQueues(process.env.JOBS_QUEUE_PREFIX || "swo:jobs", queueConnection(blocking));
  global[KEY] = queues;
  if (!blocking) {
    // A request must fail promptly, but the next request can reconnect after an outage.
    for (const queue of Object.values(queues)) queue.on("error", () => {
      if (global[KEY] === queues) {
        delete global[KEY];
        void closeQueues(queues).catch(() => undefined);
      }
    });
  }
  return queues;
}
export async function closeQueues(queues: Queues) {
  await Promise.all(QUEUE_NAMES.map(name => queues[name].close()));
}
