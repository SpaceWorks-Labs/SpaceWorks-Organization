/**
 * A realistic (fake) production environment for the documented free-tier
 * stack: Render + Supabase + Upstash + Cloudflare R2 + Brevo. Mirrors
 * `.env.production.example`; none of these values are real credentials.
 */
export function freeTierCloudEnv(): Record<string, string> {
  const key = Buffer.alloc(32, 7).toString("base64");
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://postgres.abcdefghijklmnop:fake-password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5&sslmode=require",
    DIRECT_URL: "postgresql://postgres.abcdefghijklmnop:fake-password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require",
    AUTH_SECRET: "s".repeat(44),
    AUTH_URL: "https://events.example.org",
    NEXT_PUBLIC_BASE_URL: "https://events.example.org",
    REDIS_URL: "rediss://default:fake-upstash-token@eu1-example-12345.upstash.io:6379",
    CRON_SECRET: "c".repeat(44),
    HEALTHCHECK_SECRET: "h".repeat(44),
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: key,
    MFA_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
    TRUSTED_PROXY_IP_HEADER: "cf-connecting-ip",
    EMAIL_FROM: "Space Works Events <events@example.org>",
    SMTP_HOST: "smtp-relay.brevo.com",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_USER: "123abc001@smtp-brevo.com",
    SMTP_PASSWORD: "xsmtpsib-fake-key",
    S3_BUCKET: "spaceworks-organization",
    S3_REGION: "auto",
    S3_ENDPOINT: "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
    S3_ACCESS_KEY_ID: "fake-r2-access-key-id",
    S3_SECRET_ACCESS_KEY: "fake-r2-secret-access-key",
    S3_FORCE_PATH_STYLE: "1",
    SUPER_ADMIN_EMAIL: "admin@example.org",
  };
}
