import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn(), platform: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { smsCode: { findUnique: m.find, updateMany: m.update } } }));
vi.mock("@/lib/sms/settings", () => ({ platformSmsSender: m.platform }));

import { deliverSmsCode } from "@/lib/sms/outbox";
import { SmsProviderError } from "@/lib/sms/providers/types";
import { PermanentOutboxError } from "@/lib/outboxKinds";

const future = () => new Date(Date.now() + 5 * 60_000);
const payload = () => ({ codeId: "c1", to: "+919876543210", code: "123456", expiresAt: future().toISOString() });
const live = { providerRef: null, consumedAt: null, expiresAt: future() };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_BASE_URL = "https://swo.example";
  m.find.mockResolvedValue(live);
  m.update.mockResolvedValue({ count: 1 });
  m.send.mockResolvedValue({ providerRef: "SM1" });
  m.platform.mockResolvedValue({ provider: "twilio", sender: { send: m.send }, config: { twilioAccountSid: "AC", twilioAuthToken: "t", twilioFrom: "+1555" } });
});

describe("sms-code outbox delivery", () => {
  it("sends the code and the product name through the provider, with the outbox id and the report address", async () => {
    expect(await deliverSmsCode(payload(), "<swo-abc123@outbox.invalid>")).toBe("sent");
    expect(m.send).toHaveBeenCalledWith({ to: "+919876543210", text: "123456 is your Space Works Organization code.", code: "123456", brand: "Space Works Organization", key: "swo-abc123", statusCallback: "https://swo.example/api/sms/webhooks/twilio" });
    expect(m.update).toHaveBeenCalledWith({ where: { id: "c1", providerRef: null }, data: { providerRef: "SM1", deliveryState: "sent" } });
  });
  it("never sends again once the provider accepted, even if the row is delivered twice", async () => {
    m.find.mockResolvedValue({ ...live, providerRef: "SM1" });
    expect(await deliverSmsCode(payload(), "<swo-abc123@outbox.invalid>")).toBe("sent");
    expect(m.send).not.toHaveBeenCalled();
  });
  it("still reports sent when recording the provider's id fails, so the row is not retried", async () => {
    m.update.mockRejectedValue(new Error("db down"));
    expect(await deliverSmsCode(payload(), "<swo-abc123@outbox.invalid>")).toBe("sent");
    expect(m.send).toHaveBeenCalledTimes(1);
  });
  it("drops a code that is gone, used or expired", async () => {
    m.find.mockResolvedValueOnce(null);
    expect(await deliverSmsCode(payload(), "<swo-a@outbox.invalid>")).toBe("dropped");
    m.find.mockResolvedValueOnce({ ...live, consumedAt: new Date() });
    expect(await deliverSmsCode(payload(), "<swo-a@outbox.invalid>")).toBe("dropped");
    m.find.mockResolvedValueOnce({ ...live, expiresAt: new Date(Date.now() - 1000) });
    expect(await deliverSmsCode(payload(), "<swo-a@outbox.invalid>")).toBe("dropped");
    expect(m.send).not.toHaveBeenCalled();
  });
  it("gives up when no provider is set up, and on a refusal, but retries a temporary failure", async () => {
    m.platform.mockResolvedValueOnce(null);
    await expect(deliverSmsCode(payload(), "<swo-a@outbox.invalid>")).rejects.toBeInstanceOf(PermanentOutboxError);
    m.send.mockRejectedValueOnce(new SmsProviderError("refused", false, 400));
    await expect(deliverSmsCode(payload(), "<swo-a@outbox.invalid>")).rejects.toBeInstanceOf(PermanentOutboxError);
    expect(m.update).toHaveBeenLastCalledWith({ where: { id: "c1" }, data: { deliveryState: "failed", deliveryError: "400" } });
    m.send.mockRejectedValueOnce(new SmsProviderError("busy", true, 503));
    await expect(deliverSmsCode(payload(), "<swo-a@outbox.invalid>")).rejects.toMatchObject({ retryable: true });
  });
  it("asks for no delivery reports when the provider cannot verify them", async () => {
    m.platform.mockResolvedValue({ provider: "twilio", sender: { send: m.send }, config: { twilioAccountSid: "AC", twilioApiKeySid: "SK", twilioApiKeySecret: "s", twilioFrom: "+1" } });
    await deliverSmsCode(payload(), "<swo-a@outbox.invalid>");
    expect(m.send.mock.calls[0][0].statusCallback).toBeUndefined();
  });
});
