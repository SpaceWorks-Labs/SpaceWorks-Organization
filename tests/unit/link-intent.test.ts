import { beforeAll, describe, expect, it } from "vitest";
import { LINK_INTENT_TTL_MS, intentCoversProvider, signLinkIntent, verifyLinkIntent } from "@/lib/linkIntent";

beforeAll(() => { process.env.AUTH_SECRET = "a-test-secret-that-is-longer-than-thirty-two-bytes"; });

describe("link intent", () => {
  const intent = { userId: "user_1", provider: "google" };

  it("round-trips the user and provider it was signed for", () => {
    expect(verifyLinkIntent(signLinkIntent(intent))).toEqual(intent);
  });

  it("expires after ten minutes", () => {
    const now = Date.now();
    const value = signLinkIntent(intent, now);
    expect(verifyLinkIntent(value, now + LINK_INTENT_TTL_MS - 1)).toEqual(intent);
    expect(verifyLinkIntent(value, now + LINK_INTENT_TTL_MS)).toBeNull();
  });

  it("refuses a tampered body, a swapped signature and a different secret", () => {
    const value = signLinkIntent(intent);
    const [body, signature] = value.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "user_2", p: "google", e: Date.now() + 60_000 })).toString("base64url");
    expect(verifyLinkIntent(`${forged}.${signature}`)).toBeNull();
    expect(verifyLinkIntent(`${body}.${signature.slice(0, -2)}AA`)).toBeNull();
    const other = signLinkIntent({ userId: "user_2", provider: "google" }).split(".")[1];
    expect(verifyLinkIntent(`${body}.${other}`)).toBeNull();
    process.env.AUTH_SECRET = "another-secret-that-is-also-longer-than-thirty-two";
    expect(verifyLinkIntent(value)).toBeNull();
    process.env.AUTH_SECRET = "a-test-secret-that-is-longer-than-thirty-two-bytes";
  });

  it("refuses missing, malformed and oversized values", () => {
    expect(verifyLinkIntent(undefined)).toBeNull();
    expect(verifyLinkIntent("")).toBeNull();
    expect(verifyLinkIntent("one-part")).toBeNull();
    expect(verifyLinkIntent(`${"a".repeat(600)}.x`)).toBeNull();
  });

  it("covers its own provider, and the credentials family of a SAML or bridge provider, and nothing else", () => {
    expect(intentCoversProvider(intent, "google")).toBe(true);
    expect(intentCoversProvider(intent, "github")).toBe(false);
    expect(intentCoversProvider({ userId: "u", provider: "saml-acme" }, "saml")).toBe(true);
    expect(intentCoversProvider({ userId: "u", provider: "saml-acme" }, "saml-acme")).toBe(true);
    expect(intentCoversProvider({ userId: "u", provider: "saml-acme" }, "supabase")).toBe(false);
    expect(intentCoversProvider({ userId: "u", provider: "supabase" }, "saml")).toBe(false);
    expect(intentCoversProvider({ userId: "u", provider: "oidc-work" }, "saml")).toBe(false);
  });
});
