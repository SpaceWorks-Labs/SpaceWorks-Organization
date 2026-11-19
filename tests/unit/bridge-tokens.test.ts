import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT, exportJWK, generateKeyPair, type JWK } from "jose";
import { FIREBASE_JWKS_URL, clearJwksCache, verifyFirebaseIdToken, verifySupabaseToken } from "@/lib/bridgeTokens";

const PROJECT = "demo-project";
const SUPABASE = { url: "https://abc.supabase.co", anonKey: "anon-key" };
const now = () => Math.floor(Date.now() / 1000);

let privateKey: CryptoKey;
let jwks: { keys: JWK[] };
let userResponse: { status: number; body: unknown };
let fetchMock: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  privateKey = pair.privateKey;
  jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" }] };
});

beforeEach(() => {
  clearJwksCache();
  userResponse = { status: 200, body: { id: "uid-1", email: "person@example.test", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Person" } } };
  fetchMock = vi.fn(async (url: string) => {
    if (url === FIREBASE_JWKS_URL || url.endsWith("/.well-known/jwks.json")) return Response.json(jwks);
    if (url.endsWith("/auth/v1/user")) return new Response(JSON.stringify(userResponse.body), { status: userResponse.status });
    return new Response("no", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

type Claims = Record<string, unknown>;
const sign = (claims: Claims, options: { issuer?: string; audience?: string; expiresIn?: number; alg?: string } = {}) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: options.alg ?? "RS256", kid: "k1" })
    .setIssuer(options.issuer ?? "")
    .setAudience(options.audience ?? "")
    .setExpirationTime(now() + (options.expiresIn ?? 600))
    .sign(privateKey);

const firebaseToken = (claims: Claims = {}, options: Parameters<typeof sign>[1] = {}) =>
  sign({ sub: "uid-1", iat: now() - 5, auth_time: now() - 5, email: "Person@Example.test", email_verified: true, name: "Person", ...claims },
    { issuer: `https://securetoken.google.com/${PROJECT}`, audience: PROJECT, ...options });
const supabaseToken = (claims: Claims = {}, options: Parameters<typeof sign>[1] = {}) =>
  sign({ sub: "uid-1", email: "person@example.test", ...claims }, { issuer: `${SUPABASE.url}/auth/v1`, audience: "authenticated", ...options });

describe("Firebase ID token verification", () => {
  it("accepts a valid token and lowercases the email", async () => {
    expect(await verifyFirebaseIdToken(await firebaseToken(), { projectId: PROJECT })).toEqual({ ok: true, identity: { sub: "uid-1", email: "person@example.test", name: "Person" } });
  });
  it("refuses a wrong issuer or audience", async () => {
    expect(await verifyFirebaseIdToken(await firebaseToken({}, { issuer: "https://securetoken.google.com/other" }), { projectId: PROJECT })).toEqual({ ok: false, reason: "invalid_token" });
    expect(await verifyFirebaseIdToken(await firebaseToken({}, { audience: "other" }), { projectId: PROJECT })).toEqual({ ok: false, reason: "invalid_token" });
  });
  it("refuses an expired token", async () => {
    expect(await verifyFirebaseIdToken(await firebaseToken({}, { expiresIn: -3600 }), { projectId: PROJECT })).toEqual({ ok: false, reason: "invalid_token" });
  });
  it("refuses an auth_time or iat in the future, and a missing auth_time", async () => {
    expect((await verifyFirebaseIdToken(await firebaseToken({ auth_time: now() + 3600 }), { projectId: PROJECT })).ok).toBe(false);
    expect((await verifyFirebaseIdToken(await firebaseToken({ iat: now() + 3600 }), { projectId: PROJECT })).ok).toBe(false);
    expect((await verifyFirebaseIdToken(await firebaseToken({ auth_time: undefined }), { projectId: PROJECT })).ok).toBe(false);
  });
  it("refuses an unverified or missing email", async () => {
    expect(await verifyFirebaseIdToken(await firebaseToken({ email_verified: false }), { projectId: PROJECT })).toEqual({ ok: false, reason: "unverified_email" });
    expect(await verifyFirebaseIdToken(await firebaseToken({ email: undefined, phone_number: "+15550100" }), { projectId: PROJECT })).toEqual({ ok: false, reason: "no_email" });
  });
  it("refuses a token signed by another key", async () => {
    const other = await generateKeyPair("RS256");
    const forged = await new SignJWT({ sub: "uid-1", iat: now(), auth_time: now(), email: "a@example.test", email_verified: true })
      .setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(`https://securetoken.google.com/${PROJECT}`).setAudience(PROJECT).setExpirationTime(now() + 600).sign(other.privateKey);
    expect(await verifyFirebaseIdToken(forged, { projectId: PROJECT })).toEqual({ ok: false, reason: "invalid_token" });
  });
  it("reports an unreachable key set as unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    expect(await verifyFirebaseIdToken(await firebaseToken(), { projectId: PROJECT })).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("Supabase token verification", () => {
  it("accepts a valid token whose email Supabase confirms", async () => {
    expect(await verifySupabaseToken(await supabaseToken(), SUPABASE)).toEqual({ ok: true, identity: { sub: "uid-1", email: "person@example.test", name: "Person" } });
    expect(fetchMock).toHaveBeenCalledWith("https://abc.supabase.co/auth/v1/user", expect.objectContaining({ headers: expect.objectContaining({ apikey: "anon-key" }) }));
  });
  it("refuses a wrong issuer or audience", async () => {
    expect((await verifySupabaseToken(await supabaseToken({}, { issuer: "https://evil.supabase.co/auth/v1" }), SUPABASE)).ok).toBe(false);
    expect((await verifySupabaseToken(await supabaseToken({}, { audience: "anon" }), SUPABASE)).ok).toBe(false);
  });
  it("refuses an expired token", async () => {
    expect((await verifySupabaseToken(await supabaseToken({}, { expiresIn: -3600 }), SUPABASE)).ok).toBe(false);
  });
  it("refuses an unconfirmed email, and a user that does not match the token", async () => {
    userResponse.body = { id: "uid-1", email: "person@example.test", email_confirmed_at: null };
    expect(await verifySupabaseToken(await supabaseToken(), SUPABASE)).toEqual({ ok: false, reason: "unverified_email" });
    userResponse.body = { id: "uid-2", email: "person@example.test", email_confirmed_at: "2026-01-01" };
    expect(await verifySupabaseToken(await supabaseToken(), SUPABASE)).toEqual({ ok: false, reason: "invalid_token" });
  });
  it("refuses a token with no email (phone-only)", async () => {
    expect(await verifySupabaseToken(await supabaseToken({ email: undefined, phone: "+15550100" }), SUPABASE)).toEqual({ ok: false, reason: "no_email" });
  });
  it("refuses the legacy HS256 secret without calling Supabase", async () => {
    const token = await new SignJWT({ sub: "uid-1", email: "person@example.test" }).setProtectedHeader({ alg: "HS256" }).setIssuer(`${SUPABASE.url}/auth/v1`).setAudience("authenticated").setExpirationTime(now() + 600).sign(new TextEncoder().encode("legacy-shared-secret-legacy-shared-secret"));
    expect(await verifySupabaseToken(token, SUPABASE)).toEqual({ ok: false, reason: "unsupported_signing_key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("refuses a token Supabase rejects", async () => {
    userResponse = { status: 401, body: {} };
    expect(await verifySupabaseToken(await supabaseToken(), SUPABASE)).toEqual({ ok: false, reason: "invalid_token" });
  });
});
