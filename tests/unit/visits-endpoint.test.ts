import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findOrg: vi.fn(), record: vi.fn(), limit: vi.fn(), seenIds: [] as string[] }));
vi.mock("@/lib/db", () => ({ prisma: { organisation: { findUnique: mocks.findOrg } } }));
vi.mock("@/lib/visits/record", () => ({ recordVisit: mocks.record }));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimitById: async (_bucket: string, id: string) => { mocks.seenIds.push(id); return mocks.limit(); },
  getClientIpFromHeaders: (headers: Headers) => headers.get("x-real-ip") ?? "unknown",
}));

import { POST } from "@/app/api/visits/route";
import { isBotUserAgent } from "@/lib/visits/bots";
import { parseVisit } from "@/lib/visits/route";

const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const post = (body: string, headers: Record<string, string> = {}) =>
  POST(new Request("https://example.org/api/visits", { method: "POST", body, headers: { "user-agent": BROWSER, "x-real-ip": "203.0.113.9", ...headers } }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.seenIds.length = 0;
  mocks.limit.mockReturnValue(true);
  mocks.findOrg.mockResolvedValue({ id: "org_1", status: "ACTIVE" });
});

describe("parseVisit", () => {
  it("accepts approved templates only", () => {
    expect(parseVisit(JSON.stringify({ route: "/" }))).toEqual({ route: "/", orgSlug: null });
    expect(parseVisit(JSON.stringify({ route: "/docs/:slug", orgSlug: "ignored" }))).toEqual({ route: "/docs/:slug", orgSlug: null });
    expect(parseVisit(JSON.stringify({ route: "/o/:orgSlug", orgSlug: "example-org" }))).toEqual({ route: "/o/:orgSlug", orgSlug: "example-org" });
  });

  it("rejects private routes, tokens, literal paths, and organisation templates without a slug", () => {
    for (const route of ["/dashboard/:orgSlug", "/pay/:token", "/verify/:token", "/account", "/login", "/super-admin", "/o/example-org", "/docs/getting-started", "/privacy?x=1", "/o/:orgSlug/join/:planSlug/extra", "", 5]) {
      expect(parseVisit(JSON.stringify({ route, orgSlug: "example-org" }))).toBeNull();
    }
    expect(parseVisit(JSON.stringify({ route: "/o/:orgSlug" }))).toBeNull();
    expect(parseVisit(JSON.stringify({ route: "/o/:orgSlug", orgSlug: "../x" }))).toBeNull();
    expect(parseVisit("not json")).toBeNull();
    expect(parseVisit("[]")).toBeNull();
    expect(parseVisit(`{"route":"/","pad":"${"x".repeat(2000)}"}`)).toBeNull();
  });
});

describe("isBotUserAgent", () => {
  it("drops obvious bots and empty agents but not browsers", () => {
    for (const agent of [null, "", "Googlebot/2.1", "curl/8.4", "Mozilla/5.0 HeadlessChrome/126", "UptimeRobot/2.0", "python-requests/2.31", "Slackbot-LinkExpanding"]) expect(isBotUserAgent(agent)).toBe(true);
    expect(isBotUserAgent(BROWSER)).toBe(false);
  });
});

describe("POST /api/visits", () => {
  it("always answers 204 and writes nothing for rejected visits", async () => {
    for (const res of [await post("garbage"), await post(JSON.stringify({ route: "/pay/:token" })), await post(JSON.stringify({ route: "/" }), { "user-agent": "curl/8" })]) {
      expect(res.status).toBe(204);
      expect(await res.text()).toBe("");
    }
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("counts a platform page with no organisation", async () => {
    expect((await post(JSON.stringify({ route: "/about" }))).status).toBe(204);
    expect(mocks.record).toHaveBeenCalledWith(null, "/about");
    expect(mocks.findOrg).not.toHaveBeenCalled();
  });

  it("accepts the text body a sendBeacon sends and counts an active organisation page", async () => {
    await post(JSON.stringify({ route: "/o/:orgSlug", orgSlug: "example-org" }), { "content-type": "text/plain;charset=UTF-8" });
    expect(mocks.findOrg).toHaveBeenCalledWith(expect.objectContaining({ where: { slug: "example-org" } }));
    expect(mocks.record).toHaveBeenCalledWith("org_1", "/o/:orgSlug");
  });

  it("ignores an unknown or inactive organisation, still with 204", async () => {
    mocks.findOrg.mockResolvedValueOnce(null);
    expect((await post(JSON.stringify({ route: "/o/:orgSlug", orgSlug: "nobody" }))).status).toBe(204);
    mocks.findOrg.mockResolvedValueOnce({ id: "org_2", status: "ARCHIVED" });
    expect((await post(JSON.stringify({ route: "/o/:orgSlug", orgSlug: "gone" }))).status).toBe(204);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("is rate limited per hashed address and never keys on the raw address", async () => {
    mocks.limit.mockReturnValue(false);
    expect((await post(JSON.stringify({ route: "/" }))).status).toBe(204);
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.seenIds[0]).toMatch(/^visit:[0-9a-f]{32}$/);
    expect(mocks.seenIds.join()).not.toContain("203.0.113.9");
  });

  it("does not read or count a body over the cap, declared or streamed", async () => {
    const big = JSON.stringify({ route: "/", pad: "x".repeat(5000) });
    expect((await post(big, { "content-length": String(big.length) })).status).toBe(204);
    expect((await post(big)).status).toBe(204);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("answers 204 even when counting fails", async () => {
    mocks.record.mockRejectedValueOnce(new Error("database down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await post(JSON.stringify({ route: "/" }))).status).toBe(204);
  });
});
