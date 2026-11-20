import { describe, expect, it, vi, beforeEach } from "vitest";
import { decodeWire, encodeWire } from "@/lib/frontend/codec";
import { collectInvalidations, trackedRevalidation } from "@/lib/frontend/revalidation";

const mocks = vi.hoisted(() => ({ peer: vi.fn(), limited: vi.fn(), view: vi.fn(), action: vi.fn() }));
vi.mock("@/lib/frontend/peer", () => ({ isFrontendPeer: mocks.peer }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: mocks.limited }));
vi.mock("@/lib/frontend/registry", () => ({ viewReaders: { safe: mocks.view }, backendActions: { mutate: mocks.action } }));
import { assertSafeView, frontendRequest } from "@/lib/frontend/handler";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://members.example.test");
  mocks.peer.mockReset().mockReturnValue(true);
  mocks.limited.mockReset().mockResolvedValue(false);
  mocks.view.mockReset().mockResolvedValue({ name: "Safe view" });
  mocks.action.mockReset().mockResolvedValue({ ok: true });
});
const request = async (args: unknown[], origin = "https://members.example.test") => new Request("https://api.example.test/api/frontend/view/safe", { method: "POST", headers: { origin }, body: JSON.stringify(await encodeWire(args)) });

describe("split frontend protocol", () => {
  it("preserves dates, optional values, maps, sets and duplicate form files", async () => {
    const form = new FormData(); form.append("tag", "one"); form.append("tag", "two");
    form.append("photo", new File(["hello"], "photo.txt", { type: "text/plain" }));
    const value = { when: new Date("2030-01-01Z"), missing: undefined, large: BigInt(42), map: new Map([["a", 1]]), set: new Set(["b"]), form };
    const decoded = decodeWire(await encodeWire(value)) as typeof value;
    expect(decoded.when).toEqual(value.when); expect(decoded.missing).toBeUndefined();
    expect(decoded.large).toBe(BigInt(42)); expect(decoded.map).toEqual(value.map); expect(decoded.set).toEqual(value.set);
    expect(decoded.form.getAll("tag")).toEqual(["one", "two"]);
    expect(await (decoded.form.get("photo") as File).text()).toBe("hello");
  });
  it("transports a realistic binary upload without recursive base64 validation", async () => {
    const file = new File([new Uint8Array(1024 * 1024).fill(7)], "fixture.bin");
    const result = decodeWire(await encodeWire(file)) as File;
    expect(result.size).toBe(file.size);
    expect(new Uint8Array(await result.arrayBuffer())[100]).toBe(7);
  });
  it("rejects prototype injection, malformed files and excessive nesting", () => {
    expect(() => decodeWire(["object", [["__proto__", ["object", []]]]])).toThrow();
    expect(() => decodeWire(["file", { name: "x", type: "x", data: "!" }])).toThrow();
    let nested: unknown = ["null"]; for (let i = 0;i < 50;i++) nested = ["array", [nested]];
    expect(() => decodeWire(nested)).toThrow();
  });
  it("keeps invalidations isolated across concurrent requests", async () => {
    const callback = vi.fn(), revalidate = trackedRevalidation(callback);
    const output = await Promise.all(["/first", "/second"].map((path) => collectInvalidations(async () => { await Promise.resolve(); revalidate(path); return path; })));
    expect(output.map((item) => item.invalidations)).toEqual([[{ path: "/first" }], [{ path: "/second" }]]);
    expect(callback).toHaveBeenCalledWith("/first");
  });
  it("rejects known secret fields at any nesting level", () => {
    expect(() => assertSafeView({ nested: [{ passwordHash: "forbidden" }] })).toThrow();
    expect(() => assertSafeView({ users: new Map([["id", { mfaSecretEncrypted: "forbidden" }]]) })).toThrow();
    for (const key of ["secretEncrypted", "webhookSecretEncrypted", "configEncrypted", "smtpPasswordEncrypted", "clientSecretEncrypted", "applePrivateKeyEncrypted", "accessTokenEncrypted", "verifyToken", "someNewHash", "signingSecret", "inviteTokenHash"]) {
      expect(() => assertSafeView({ rows: [{ [key]: "forbidden" }] }), key).toThrow();
    }
    expect(() => assertSafeView({ hasSecret: true, hasWebhookSecret: false, token: "join-link" })).not.toThrow();
  });
  it("requires both the peer credential and exact origin", async () => {
    mocks.peer.mockReturnValue(false);
    expect((await frontendRequest(await request([]), "view", "safe")).status).toBe(404);
    mocks.peer.mockReturnValue(true);
    expect((await frontendRequest(await request([], "https://elsewhere.example.test"), "view", "safe")).status).toBe(404);
    expect(mocks.view).not.toHaveBeenCalled();
  });
  it("uses a fixed registry and rejects permission claims in view inputs", async () => {
    expect((await frontendRequest(await request([]), "view", "constructor")).status).toBe(404);
    expect((await frontendRequest(await request([{ ctx: { organisation: { slug: "org" }, event: { id: "event" }, permissions: ["OWNER"] } }]), "view", "safe")).status).toBe(400);
    expect(mocks.view).not.toHaveBeenCalled();
    const response = await frontendRequest(await request([{ params: { orgSlug: "org" } }]), "view", "safe");
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("converts local navigation, hides failures and rejects secret view output", async () => {
    mocks.view.mockRejectedValueOnce({ digest: "NEXT_REDIRECT;replace;/login;307;" });
    expect((await (await frontendRequest(await request([]), "view", "safe")).json()).navigation).toEqual({ type: "redirect", location: "/login" });
    mocks.view.mockRejectedValueOnce({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect((await (await frontendRequest(await request([]), "view", "safe")).json()).navigation.type).toBe("not-found");
    const log = vi.spyOn(console, "error").mockImplementation(() => { });
    mocks.view.mockResolvedValueOnce({ passwordHash: "must never cross" });
    const response = await frontendRequest(await request([]), "view", "safe");
    expect(response.status).toBe(500); expect(await response.text()).not.toContain("must never cross"); log.mockRestore();
  });
});
