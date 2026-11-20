import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateRuntimeEnvironment } from "@/lib/env";
import { freeTierCloudEnv } from "../helpers/freeTierCloudEnv";

const original = { ...process.env };
const key = Buffer.alloc(32, 3).toString("base64");

beforeEach(() => {
  Object.assign(process.env, {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://user:pass@db.example.test/sworg?sslmode=require",
    AUTH_SECRET: "a".repeat(32), AUTH_URL: "https://members.example.test", NEXT_PUBLIC_BASE_URL: "https://members.example.test",
    REDIS_URL: "rediss://redis.example.test", CRON_SECRET: "c".repeat(32), HEALTHCHECK_SECRET: "h".repeat(32),
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: key, MFA_ENCRYPTION_KEY: key, PAYMENT_SECRETS_KEY: key, EMAIL_FROM: "Space Works Organization <noreply@example.test>",
    SMTP_SERVICE: "test", SMTP_ALLOW_UNAUTHENTICATED: "1", TRUSTED_PROXY_IP_HEADER: "x-forwarded-for",
    S3_BUCKET: "private-assets", S3_REGION: "us-east-1",
  });
  delete process.env.CI;
  delete process.env.ALLOW_INSECURE_PRODUCTION_TESTS;
  // Optional settings a CI job or developer shell may export (e.g. a plaintext
  // DIRECT_URL for the test database) must not leak into the fixture.
  for (const name of ["ALLOW_PLAIN_HTTP", "DIRECT_URL", "TRUSTED_PROXY_HOPS", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_FORCE_PATH_STYLE"]) delete process.env[name];
});

afterEach(() => {
  for (const name of Object.keys(process.env)) if (!(name in original)) delete process.env[name];
  Object.assign(process.env, original);
});

describe("production environment validation", () => {
  it("accepts a complete TLS-protected configuration", () => expect(validateRuntimeEnvironment).not.toThrow());
  it("treats empty optional email settings (compose passes ${NAME:-}) as unset", () => {
    for (const name of ["SMTP_USER", "SMTP_PASSWORD", "AWS_SES_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "SES_TOPIC_ARN", "RESEND_API_KEY", "POSTMARK_SERVER_TOKEN", "EMAIL_WEBHOOK_SECRET"]) process.env[name] = "";
    expect(validateRuntimeEnvironment).not.toThrow();
  });
  it("rejects plaintext database and public origins", () => {
    process.env.DATABASE_URL = "postgresql://user:pass@db.example.test/sworg?sslmode=disable";
    expect(validateRuntimeEnvironment).toThrow(/DATABASE_URL must require TLS/);
    process.env.DATABASE_URL = "postgresql://user:pass@db.example.test/sworg?sslmode=require";
    process.env.AUTH_URL = "http://members.example.test";
    process.env.NEXT_PUBLIC_BASE_URL = "http://members.example.test";
    expect(validateRuntimeEnvironment).toThrow(/same HTTPS origin/);
    process.env.ALLOW_PLAIN_HTTP = "1";
    expect(validateRuntimeEnvironment).not.toThrow();
    process.env.REDIS_URL = "redis://redis.example.test";
    expect(validateRuntimeEnvironment).toThrow(/REDIS_URL must use TLS/);
  });
  it("rejects missing secrets and half-configured object credentials", () => {
    delete process.env.CRON_SECRET;
    expect(validateRuntimeEnvironment).toThrow(/CRON_SECRET/);
    process.env.CRON_SECRET = "c".repeat(32);
    process.env.S3_ACCESS_KEY_ID = "access";
    expect(validateRuntimeEnvironment).toThrow(/S3_SECRET_ACCESS_KEY/);
  });
  it("accepts the free-tier cloud stack (Supabase, Upstash, R2, Brevo)", () => {
    Object.assign(process.env, freeTierCloudEnv());
    expect(validateRuntimeEnvironment).not.toThrow();
  });
  it("requires TLS on DIRECT_URL and pgbouncer mode on the transaction pooler", () => {
    Object.assign(process.env, freeTierCloudEnv());
    process.env.DIRECT_URL = "postgresql://postgres.ref:pw@aws-0-eu-central-1.pooler.supabase.com:5432/postgres";
    expect(validateRuntimeEnvironment).toThrow(/DIRECT_URL must require TLS/);
    process.env.DIRECT_URL = "";
    expect(validateRuntimeEnvironment).not.toThrow();
    process.env.DATABASE_URL = "postgresql://postgres.ref:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require";
    expect(validateRuntimeEnvironment).toThrow(/pgbouncer=true/);
  });
});
