import { describe, expect, it } from "vitest";
import { counterRolledBack, verifyAssertion, verifyRegistration } from "@/lib/passkeys/verify";
import { passkeyRelyingParty } from "@/lib/passkeys/config";
import { SoftPasskey } from "../helpers/softPasskey";

// The hermetic base URL is http://localhost:3000, so the relying party id is "localhost".
const rp = passkeyRelyingParty();
const challenge = "Y2hhbGxlbmdlLWZvci10ZXN0cw";
const ceremony = { rpID: rp.rpID, origin: rp.origin, challenge };
const stored = (key: SoftPasskey, counter = 0) => ({ credentialId: key.id, publicKey: key.publicKey, counter, transports: ["internal"] });

describe("relying party", () => {
  it("is the configured public origin and its hostname, never taken from a request", () => {
    expect(passkeyRelyingParty({ NEXT_PUBLIC_BASE_URL: "https://members.example.org/path", AUTH_URL: "https://other.test" } as never)).toMatchObject({ rpID: "members.example.org", origin: "https://members.example.org" });
    expect(passkeyRelyingParty({ AUTH_URL: "https://auth.example.org" } as never).rpID).toBe("auth.example.org");
  });
});

describe("passkey registration check", () => {
  it("accepts a real attestation with user verification and returns the credential", async () => {
    const key = new SoftPasskey();
    const result = await verifyRegistration(key.register(ceremony), challenge);
    expect(result).toMatchObject({ ok: true, credential: { id: key.id, counter: 0 } });
  });
  it("refuses a wrong challenge, a wrong origin and a wrong relying party id", async () => {
    const key = new SoftPasskey();
    expect(await verifyRegistration(key.register(ceremony), "b3RoZXI")).toMatchObject({ ok: false });
    expect(await verifyRegistration(key.register({ ...ceremony, clientOrigin: "https://evil.example" }), challenge)).toMatchObject({ ok: false });
    expect(await verifyRegistration(key.register({ ...ceremony, rpIDForHash: "evil.example" }), challenge)).toMatchObject({ ok: false });
  });
  it("refuses an authenticator that did not verify the user", async () => {
    expect(await verifyRegistration(new SoftPasskey().register({ ...ceremony, uv: false }), challenge)).toMatchObject({ ok: false });
  });
});

describe("passkey assertion check", () => {
  it("accepts a real assertion and reports the new counter", async () => {
    const key = new SoftPasskey();
    expect(await verifyAssertion(key.assert({ ...ceremony, counter: 3 }), challenge, stored(key, 2))).toMatchObject({ ok: true, newCounter: 3 });
    expect(await verifyAssertion(key.assert(ceremony), challenge, stored(key, 0))).toMatchObject({ ok: true, newCounter: 0 });
  });
  it("refuses a counter that stood still or went backwards, naming it so it can be audited", async () => {
    const key = new SoftPasskey();
    expect(await verifyAssertion(key.assert({ ...ceremony, counter: 5 }), challenge, stored(key, 5))).toEqual({ ok: false, reason: "counter_rollback" });
    expect(await verifyAssertion(key.assert({ ...ceremony, counter: 2 }), challenge, stored(key, 5))).toEqual({ ok: false, reason: "counter_rollback" });
    expect(await verifyAssertion(key.assert({ ...ceremony, counter: 0 }), challenge, stored(key, 5))).toEqual({ ok: false, reason: "counter_rollback" });
    expect(counterRolledBack(0, 0)).toBe(false);
  });
  it("refuses a wrong challenge, origin or relying party id, a missing user verification and a forged signature", async () => {
    const key = new SoftPasskey();
    const bad = async (response: ReturnType<SoftPasskey["assert"]>) => (await verifyAssertion(response, challenge, stored(key))).ok;
    expect(await verifyAssertion(key.assert(ceremony), "b3RoZXI", stored(key))).toMatchObject({ ok: false, reason: "bad_assertion" });
    expect(await bad(key.assert({ ...ceremony, clientOrigin: "https://evil.example" }))).toBe(false);
    expect(await bad(key.assert({ ...ceremony, rpIDForHash: "evil.example" }))).toBe(false);
    expect(await bad(key.assert({ ...ceremony, uv: false }))).toBe(false);
    expect(await bad(key.assert(ceremony, new SoftPasskey()))).toBe(false);
  });
});
