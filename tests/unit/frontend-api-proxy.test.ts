import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ headers: vi.fn() }));
vi.mock("@/lib/frontend/request", () => ({ backendHeaders: mocks.headers, backendUrl: (path: string) => new URL(path, "https://api.example.test") }));
import { proxyBackendApi } from "@/lib/frontend/httpProxy";

beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://members.example.test"); vi.stubEnv("BACKEND_ORIGIN", "https://api.example.test"); mocks.headers.mockReset().mockResolvedValue(new Headers({ "x-swe-frontend-key": "test-peer" })); });

describe("frontend API proxy", () => {
  it("never gives browser calls access to private peer or operational endpoints", async () => {
    for (const path of ["frontend/view/private", "%66rontend/action/private", "%2566rontend/action/private", "FRONTEND/action/private", "internal/outbox", "health/db", "x%2f..%2ffrontend/view/private"]) {
      expect((await proxyBackendApi(new Request(`https://members.example.test/api/${path}`))).status).toBe(404);
    }
    expect(mocks.headers).not.toHaveBeenCalled();
  });
  it("rejects cross-origin writes before forwarding any cookies", async () => {
    const response = await proxyBackendApi(new Request("https://members.example.test/api/rsvp", { method: "POST", headers: { origin: "https://attacker.example.test", cookie: "session=value" } }));
    expect(response.status).toBe(404); expect(mocks.headers).not.toHaveBeenCalled();
  });
  it("preserves multiple host-only auth cookies and redirects to the frontend", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: [["set-cookie", "csrf=one; Path=/; HttpOnly; Secure; SameSite=Lax"], ["set-cookie", "session=two; Path=/; HttpOnly; Secure; SameSite=Lax"], ["location", "https://api.example.test/account"]] }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const response = await proxyBackendApi(new Request("https://members.example.test/api/auth/session", { headers: { "x-forwarded-for": "spoofed", "x-swe-frontend-key": "spoofed" } }));
      expect(response.headers.getSetCookie()).toHaveLength(2);
      expect(response.headers.get("location")).toBe("https://members.example.test/account");
      const forwarded = fetchMock.mock.calls[0][1].headers as Headers;
      expect(forwarded.has("x-forwarded-for")).toBe(false); expect(forwarded.get("x-swe-frontend-key")).toBe("test-peer");
    } finally { vi.unstubAllGlobals(); }
  });
  it("lets email and SMS provider webhooks through without an Origin and forwards only their signature headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const signatures = { "svix-id": "msg_1", "svix-timestamp": "1", "svix-signature": "v1,abc", "x-twilio-signature": "sig", "x-amz-sns-message-type": "Notification", authorization: "Basic abc", "content-type": "application/json" };
    try {
      for (const path of ["/api/email/webhooks/resend", "/api/sms/webhooks/twilio"]) {
        fetchMock.mockClear();
        const response = await proxyBackendApi(new Request(`https://members.example.test${path}`, { method: "POST", headers: signatures, body: "{}" }));
        expect(response.status).toBe(200);
        const forwarded = fetchMock.mock.calls[0][1].headers as Headers;
        for (const [name, value] of Object.entries(signatures)) expect(forwarded.get(name)).toBe(value);
      }
    } finally { vi.unstubAllGlobals(); }
  });
  it("does not forward signature headers on any other path, and still refuses other cross-origin posts and look-alike webhook paths", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const headers = { origin: "https://members.example.test", "svix-id": "msg_1", "x-twilio-signature": "sig", "x-amz-sns-topic-arn": "arn" };
      await proxyBackendApi(new Request("https://members.example.test/api/rsvp", { method: "POST", headers, body: "{}" }));
      const forwarded = fetchMock.mock.calls[0][1].headers as Headers;
      expect(forwarded.has("svix-id")).toBe(false); expect(forwarded.has("x-twilio-signature")).toBe(false); expect(forwarded.has("x-amz-sns-topic-arn")).toBe(false);
      fetchMock.mockClear();
      for (const path of ["/api/email/webhooks/resend/extra", "/api/email/webhooks", "/api/sms/webhooks/a/b", "/api/email/other/resend"]) {
        expect((await proxyBackendApi(new Request(`https://members.example.test${path}`, { method: "POST", body: "{}" }))).status).toBe(404);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});
