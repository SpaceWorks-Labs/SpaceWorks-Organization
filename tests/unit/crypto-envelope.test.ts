import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

// Ciphertext produced by the code before the envelope helper existed. It must keep opening.
const fixtures = JSON.parse(readFileSync("tests/unit/fixtures/envelope-v1.json", "utf8")) as Record<string, { plain: string; sealed: string; org?: string }>;

beforeAll(() => {
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.PAYMENT_SECRETS_KEY = Buffer.alloc(32, 9).toString("base64");
});

const tamper = (sealed: string) => {
  const parts = sealed.split(".");
  const last = Buffer.from(parts[3], "base64url");
  last[0] ^= 1;
  return [parts[0], parts[1], parts[2], last.toString("base64url")].join(".");
};

describe("AES-256-GCM envelope", () => {
  it("opens ciphertext made by the previous implementations", async () => {
    const { decryptMfaSecret } = await import("@/lib/mfa");
    const { decryptInstanceConfigSecret } = await import("@/lib/instanceConfigSecrets");
    const { decryptOrgSecret } = await import("@/lib/orgSecrets");
    const { decryptPaymentSecret } = await import("@/lib/payments/secrets");
    expect(decryptMfaSecret(fixtures.mfa.sealed)).toBe(fixtures.mfa.plain);
    expect(decryptInstanceConfigSecret(fixtures.instance.sealed)).toBe(fixtures.instance.plain);
    expect(decryptOrgSecret(fixtures.orgEmail.sealed, "org_1", "email")).toBe(fixtures.orgEmail.plain);
    expect(decryptOrgSecret(fixtures.orgChat.sealed, "org_1", "chat")).toBe(fixtures.orgChat.plain);
    expect(decryptPaymentSecret(fixtures.payment.sealed, "org_1")).toBe(fixtures.payment.plain);
  });

  it("round-trips and keeps the v1 format", async () => {
    const { encryptMfaSecret, decryptMfaSecret } = await import("@/lib/mfa");
    const { encryptPaymentSecret, decryptPaymentSecret } = await import("@/lib/payments/secrets");
    const sealed = encryptMfaSecret("seed");
    expect(sealed.split(".")).toHaveLength(4);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(decryptMfaSecret(sealed)).toBe("seed");
    expect(encryptMfaSecret("seed")).not.toBe(sealed);
    expect(decryptPaymentSecret(encryptPaymentSecret("k", "org_9"), "org_9")).toBe("k");
  });

  it("refuses tampering, another tenant, another purpose and another key family", async () => {
    const { decryptMfaSecret } = await import("@/lib/mfa");
    const { decryptInstanceConfigSecret } = await import("@/lib/instanceConfigSecrets");
    const { decryptOrgSecret } = await import("@/lib/orgSecrets");
    const { decryptPaymentSecret } = await import("@/lib/payments/secrets");
    expect(() => decryptMfaSecret(tamper(fixtures.mfa.sealed))).toThrow();
    expect(() => decryptPaymentSecret(tamper(fixtures.payment.sealed), "org_1")).toThrow();
    expect(() => decryptPaymentSecret(fixtures.payment.sealed, "org_2")).toThrow();
    expect(() => decryptOrgSecret(fixtures.orgEmail.sealed, "org_2", "email")).toThrow();
    expect(() => decryptOrgSecret(fixtures.orgEmail.sealed, "org_1", "chat")).toThrow();
    expect(() => decryptInstanceConfigSecret(fixtures.mfa.sealed)).toThrow();
    expect(() => decryptMfaSecret("v2.a.b.c")).toThrow("Invalid encrypted MFA secret.");
    expect(() => decryptMfaSecret("v1.a.b")).toThrow("Invalid encrypted MFA secret.");
  });
});
