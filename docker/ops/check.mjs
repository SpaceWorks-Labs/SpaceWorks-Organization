// Operator checks for a running stack, run from the ops service:
//   scripts/spaceworks-compose.sh bundled run --rm ops
// Safe output only: no connection URLs, credentials or response bodies.
import Redis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";

const bundled = process.env.SWO_TOPOLOGY !== "cloud";
const results = [];
async function check(name, run) {
  try {
    await run();
    results.push(`ok    ${name}`);
  } catch {
    results.push(`FAIL  ${name}`);
    process.exitCode = 1;
  }
}
const assert = (condition) => { if (!condition) throw new Error(); };

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, connectTimeout: 5000, maxRetriesPerRequest: 1 });
redis.on("error", () => {});
const s3 = new S3Client({
  region: process.env.S3_REGION, endpoint: process.env.S3_ENDPOINT, forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "1",
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
});

await check("database connection uses TLS", async () => {
  const [{ ssl }] = await prisma.$queryRaw`SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()`;
  assert(ssl);
});
if (bundled) {
  await check("runtime database role cannot change schema or roles", async () => {
    const [role] = await prisma.$queryRaw`SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user`;
    const [{ owns }] = await prisma.$queryRaw`SELECT count(*)::int AS owns FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user`;
    assert(!role.rolsuper && !role.rolcreatedb && !role.rolcreaterole && owns === 0);
  });
}
await check("every migration is applied", async () => {
  const [{ failed }] = await prisma.$queryRaw`SELECT count(*)::int AS failed FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL`;
  assert(failed === 0);
});
await check("Redis answers over TLS with its password", async () => {
  assert(process.env.REDIS_URL?.startsWith("rediss://"));
  await redis.connect();
  assert((await redis.ping()) === "PONG");
});
await check("private bucket is reachable", () => s3.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET })));
await check("app readiness (/api/health/db)", async () => {
  const response = await fetch("http://backend:3000/api/health/db", {
    headers: { Authorization: `Bearer ${process.env.HEALTHCHECK_SECRET}` }, signal: AbortSignal.timeout(10_000),
  });
  await response.body?.cancel();
  assert(response.ok);
});
// The BullMQ worker and beat answer /health only while their Redis heartbeat is fresh.
for (const role of ["worker", "beat"]) {
  await check(`${role} is healthy (/health)`, async () => {
    const response = await fetch(`http://${role}:${process.env.JOBS_HEALTH_PORT || 3460}/health`, { signal: AbortSignal.timeout(10_000) });
    await response.body?.cancel();
    assert(response.ok);
  });
}
await check("internal job endpoint refuses requests without the secret", async () => {
  const response = await fetch("http://backend:3000/api/internal/outbox", { method: "POST", signal: AbortSignal.timeout(10_000) });
  await response.body?.cancel();
  assert(response.status === 404);
});
await check("SMTP relay is configured", async () => assert(process.env.SMTP_HOST && process.env.SMTP_HOST !== "CHANGE_ME"));

redis.disconnect();
s3.destroy();
await prisma.$disconnect();
console.log(results.join("\n"));
console.log(process.exitCode ? "Some checks failed; inspect the services in a trusted operator session." : "All checks passed.");
