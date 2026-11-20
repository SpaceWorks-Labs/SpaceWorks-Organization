import { describe, expect, it, vi } from "vitest";

const publicHost = vi.hoisted(() => ({ refuse: true }));
vi.mock("@/lib/net/publicHost", () => {
  class PrivateHostError extends Error {
    constructor() { super("That host points at a private or internal address. Use a public host name."); }
  }
  return {
    PrivateHostError,
    assertPublicHost: async () => { if (publicHost.refuse) throw new PrivateHostError(); },
  };
});

import { testOidcConnection } from "@/lib/oidc/discovery";
import { testSamlConfig } from "@/lib/saml/diagnose";

describe("super-admin provider test fetches", () => {
  it("OIDC refuses a private issuer host without fetching", async () => {
    const fetchImpl = vi.fn();
    const result = await testOidcConnection("https://10.0.0.5", fetchImpl as unknown as typeof fetch);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("private or internal") });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("SAML refuses a private metadata host without fetching, and never follows redirects", async () => {
    const certificate = `-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----`;
    const fetchImpl = vi.fn();
    const input = { idpCertificate: certificate, ssoUrl: "https://idp.example.test/sso", entityId: "https://idp.example.test", metadataUrl: "https://169.254.169.254/meta" };
    const result = await testSamlConfig(input, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });
});
