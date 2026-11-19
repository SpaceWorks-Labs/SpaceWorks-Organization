import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ assertPublicHost: vi.fn() }));
vi.mock("@/lib/net/publicHost", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/net/publicHost")>()), assertPublicHost: mocks.assertPublicHost }));

import { CHAT_CONFIG_SCHEMAS, describeTarget } from "@/lib/chat/config";
import { ChatGoneError, sendChatMessage, signWebhook } from "@/lib/chat/send";
import { PrivateHostError } from "@/lib/net/publicHost";

const fetchMock = vi.fn();
const config = { url: "https://hooks.example.org/swo?x=1", secret: "a-long-enough-signing-secret" };

beforeEach(() => {
  mocks.assertPublicHost.mockResolvedValue(undefined);
  fetchMock.mockResolvedValue(new Response("", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("signed webhook destination", () => {
  it("accepts https addresses with a long secret and refuses the rest", () => {
    const schema = CHAT_CONFIG_SCHEMAS.WEBHOOK;
    expect(schema.safeParse(config).success).toBe(true);
    expect(schema.safeParse({ ...config, url: "http://hooks.example.org/x" }).success).toBe(false);
    expect(schema.safeParse({ ...config, url: "https://user:pass@hooks.example.org/x" }).success).toBe(false);
    expect(schema.safeParse({ ...config, url: "not a url" }).success).toBe(false);
    expect(schema.safeParse({ ...config, secret: "short" }).success).toBe(false);
  });

  it("describes the destination by host only, never the secret or path", () => {
    expect(describeTarget("WEBHOOK", config)).toBe("Signed webhook hooks.example.org");
  });

  it("posts the text with an HMAC-SHA256 signature over timestamp and body that a receiver can verify", async () => {
    await sendChatMessage("WEBHOOK", config, "New application");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(config.url);
    expect(init.redirect).toBe("error");
    expect(init.body).toBe(JSON.stringify({ text: "New application" }));
    const { "x-spaceworks-timestamp": timestamp, "x-spaceworks-signature": signature } = init.headers;
    expect(signature).toBe(`sha256=${crypto.createHmac("sha256", config.secret).update(`${timestamp}.${init.body}`).digest("hex")}`);
    expect(Math.abs(Number(timestamp) - Date.now() / 1000)).toBeLessThan(10);
    expect(JSON.stringify(init)).not.toContain(config.secret);
  });

  it("signs deterministically for a given time and changes the signature when the body changes", () => {
    const at = Date.UTC(2026, 10, 19);
    expect(signWebhook("s".repeat(16), "{}", at)).toEqual(signWebhook("s".repeat(16), "{}", at));
    expect(signWebhook("s".repeat(16), "{}", at)["x-spaceworks-signature"]).not.toBe(signWebhook("s".repeat(16), '{"a":1}', at)["x-spaceworks-signature"]);
  });

  it("checks the host is public before connecting, and treats a refusal as gone", async () => {
    mocks.assertPublicHost.mockRejectedValue(new PrivateHostError());
    await expect(sendChatMessage("WEBHOOK", config, "x")).rejects.toBeInstanceOf(PrivateHostError);
    expect(mocks.assertPublicHost).toHaveBeenCalledWith("hooks.example.org");
    expect(fetchMock).not.toHaveBeenCalled();
    mocks.assertPublicHost.mockResolvedValue(undefined);
    fetchMock.mockResolvedValue(new Response("", { status: 404 }));
    await expect(sendChatMessage("WEBHOOK", config, "x")).rejects.toBeInstanceOf(ChatGoneError);
  });
});
