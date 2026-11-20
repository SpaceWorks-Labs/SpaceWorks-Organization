import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  orgAccess: vi.fn(), admin: vi.fn(), limited: vi.fn(), audit: vi.fn(), orgFind: vi.fn(), orgUpsert: vi.fn(), orgUpdate: vi.fn(), userFind: vi.fn(),
  instFind: vi.fn(), instUpsert: vi.fn(), mailer: vi.fn(), sendMail: vi.fn(), smsConfig: vi.fn(),
}));
vi.mock("@/lib/permissions", () => ({ orgActionAccess: m.orgAccess, requireSuperAdmin: m.admin }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: m.limited }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: m.audit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/orgSecrets", () => ({ encryptOrgSecret: (value: string) => `enc:${value}`, decryptOrgSecret: (value: string) => value.slice(4) }));
vi.mock("@/lib/instanceConfigSecrets", () => ({ encryptInstanceConfigSecret: (value: string) => `enc:${value}`, decryptInstanceConfigSecret: (value: string) => value.slice(4) }));
vi.mock("@/lib/net/publicHost", () => ({ assertPublicHost: async () => undefined, PrivateHostError: class extends Error {} }));
vi.mock("@/lib/email/orgTransport", () => ({ organisationMailer: m.mailer, orgProviderConfig: (row: { cfg?: object }) => row.cfg ?? {} }));
vi.mock("@/lib/email/transporter", () => ({ assertEmailAccepted: () => undefined, buildPlatformMailer: () => null }));
vi.mock("@/lib/sms/settings", () => ({ getSmsSettings: async () => ({ saved: m.smsConfig(), config: m.smsConfig(), provider: "twilio" }), savedSmsConfig: async () => m.smsConfig() }));
vi.mock("@/lib/db", () => ({ prisma: {
  orgEmailSettings: { findUnique: m.orgFind, upsert: m.orgUpsert, update: m.orgUpdate },
  user: { findUnique: m.userFind },
  instanceSetting: { findUnique: m.instFind, upsert: m.instUpsert, updateMany: vi.fn() },
} }));

import { saveOrgEmailSettings, sendOrgTestEmail } from "@/app/actions/org-email";
import { saveInstanceEmailProvider } from "@/app/actions/instance-email";
import { saveInstanceServiceSettings } from "@/app/actions/instance-settings";
import { saveInstanceSmsProvider } from "@/app/actions/instance-sms";

const saved = { organisationId: "org_1", fromAddress: "club@example.org", fromName: "Club", replyTo: null, emailProvider: "smtp", cfg: {}, providerConfigEncrypted: null, smtpHost: "smtp.example.org", smtpPort: 587, smtpUser: "mailer", smtpPasswordEncrypted: "enc:saved-pass", smtpSecure: false };
const form = { organisationSlug: "club", emailProvider: "smtp" as const, smtpHost: "smtp.example.org", smtpPort: 587 as const, smtpUser: "mailer" };
const save = { ...form, enabled: true, fromName: "Club", fromAddress: "club@example.org", replyTo: "" };

beforeEach(() => {
  vi.clearAllMocks();
  m.orgAccess.mockResolvedValue({ ok: true, userId: "user_1", organisation: { id: "org_1", slug: "club", name: "Club" } });
  m.admin.mockResolvedValue({ user: { id: "admin_1", email: "a@example.test" } });
  m.limited.mockResolvedValue(false);
  m.orgFind.mockResolvedValue(saved);
  m.userFind.mockResolvedValue({ email: "me@example.test" });
  m.sendMail.mockResolvedValue({ accepted: ["me@example.test"] });
  m.mailer.mockResolvedValue({ sendMail: m.sendMail, close: () => undefined });
  m.instFind.mockResolvedValue(null);
});

describe("organisation SMTP: the saved password goes only to the target it was saved with", () => {
  const passwordUsed = () => m.mailer.mock.calls[0][2];
  it("reuses it for the same host, port and user", async () => {
    expect(await sendOrgTestEmail(form)).toEqual({ ok: true });
    expect(passwordUsed()).toBe("saved-pass");
  });
  it.each([
    ["host", { smtpHost: "evil.example.net" }], ["port", { smtpPort: 465 as const }], ["user", { smtpUser: "other" }],
  ])("does not send it to another %s: a typed password is required", async (_name, change) => {
    const result = await sendOrgTestEmail({ ...form, ...change });
    expect(result).toMatchObject({ ok: false, fieldErrors: { smtpPassword: [expect.any(String)] } });
    expect(m.mailer).not.toHaveBeenCalled();
  });
  it("uses a newly typed password for a new target", async () => {
    expect(await sendOrgTestEmail({ ...form, smtpHost: "other.example.org", smtpPassword: "typed" })).toEqual({ ok: true });
    expect(passwordUsed()).toBe("typed");
  });
  it("limits ports to 25, 465, 587 and 2525 for tests and saves", async () => {
    expect(await sendOrgTestEmail({ ...form, smtpPort: 6379 })).toMatchObject({ ok: false });
    expect(await saveOrgEmailSettings({ ...save, smtpPort: 6379 })).toMatchObject({ ok: false });
    expect(m.mailer).not.toHaveBeenCalled();
  });
  it("audits a test without addresses or secrets", async () => {
    await sendOrgTestEmail({ ...form, smtpPassword: "typed" });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "ORG_EMAIL_TEST_SENT", metadata: { provider: "smtp" } }));
    expect(JSON.stringify(m.audit.mock.calls)).not.toMatch(/typed|saved-pass|example/);
  });
  it("on save, refuses a retargeted authenticated server without a typed password, and keeps the password for the same target", async () => {
    expect(await saveOrgEmailSettings({ ...save, smtpHost: "evil.example.net" })).toMatchObject({ ok: false, fieldErrors: { smtpPassword: [expect.any(String)] } });
    expect(m.orgUpsert).not.toHaveBeenCalled();
    expect(await saveOrgEmailSettings(save)).toEqual({ ok: true });
    expect(m.orgUpsert.mock.calls[0][0].update).not.toHaveProperty("smtpPasswordEncrypted");
  });
  it("on save, drops the saved password when an unauthenticated server replaces the old target", async () => {
    expect(await saveOrgEmailSettings({ ...save, smtpHost: "relay.example.org", smtpUser: "" })).toEqual({ ok: true });
    expect(m.orgUpsert.mock.calls[0][0].update.smtpPasswordEncrypted).toBeNull();
  });
});

describe("SES secrets are not reused for another region or key", () => {
  const stored = { sesRegion: "eu-west-1", sesAccessKeyId: "AKIA1", sesSecretAccessKey: "ses-secret" };
  const ses = { emailProvider: "ses" as const, sesRegion: "eu-west-1", sesAccessKeyId: "AKIA1" };
  it("platform form: refuses a changed region or key id without the secret, accepts the unchanged one", async () => {
    m.instFind.mockResolvedValue({ emailProviderConfigEncrypted: `enc:${JSON.stringify(stored)}` });
    expect(await saveInstanceEmailProvider({ ...ses, sesRegion: "us-east-1" })).toMatchObject({ ok: false, fieldErrors: { sesSecretAccessKey: [expect.any(String)] } });
    expect(await saveInstanceEmailProvider({ ...ses, sesAccessKeyId: "AKIA2" })).toMatchObject({ ok: false });
    expect(m.instUpsert).not.toHaveBeenCalled();
    expect(await saveInstanceEmailProvider(ses)).toEqual({ ok: true });
    expect(await saveInstanceEmailProvider({ ...ses, sesRegion: "us-east-1", sesSecretAccessKey: "new" })).toEqual({ ok: true });
  });
  it("organisation form: refuses on save and test", async () => {
    m.orgFind.mockResolvedValue({ ...saved, emailProvider: "ses", cfg: stored });
    const body = { ...ses, sesRegion: "us-east-1", organisationSlug: "club" };
    expect(await saveOrgEmailSettings({ ...save, ...body })).toMatchObject({ ok: false, fieldErrors: { sesSecretAccessKey: [expect.any(String)] } });
    expect(await sendOrgTestEmail(body)).toMatchObject({ ok: false });
    expect(m.orgUpsert).not.toHaveBeenCalled();
    expect(m.mailer).not.toHaveBeenCalled();
  });
});

describe("platform SMTP password", () => {
  const base = { smtpHost: "smtp.example.test", smtpPort: 587, smtpSecure: false, smtpUser: "sender", smtpAllowUnauthenticated: false };
  it("is not reused when the host, port or user changes, and is kept for the same target", async () => {
    m.instFind.mockResolvedValue({ smtpPasswordEncrypted: "enc:old", smtpService: null, smtpHost: "smtp.example.test", smtpPort: 587, smtpUser: "sender" });
    expect(await saveInstanceServiceSettings({ ...base, smtpHost: "evil.example.net" })).toMatchObject({ ok: false });
    expect(await saveInstanceServiceSettings({ ...base, smtpPort: 465 })).toMatchObject({ ok: false });
    expect(m.instUpsert).not.toHaveBeenCalled();
    expect(await saveInstanceServiceSettings(base)).toEqual({ ok: true });
    expect(m.instUpsert.mock.calls[0][0].update).not.toHaveProperty("smtpPasswordEncrypted");
    expect(await saveInstanceServiceSettings({ ...base, smtpHost: "other.example.test", smtpPassword: "typed" })).toEqual({ ok: true });
  });
});

describe("Twilio secrets", () => {
  const sid = (c: string) => `AC${c.repeat(32)}`;
  it("are not reused with another account SID, but are with the same one", async () => {
    m.smsConfig.mockReturnValue({ twilioAccountSid: sid("a"), twilioAuthToken: "token", twilioFrom: "+15551234567" });
    const draft = { smsProvider: "twilio" as const, twilioAccountSid: sid("a"), twilioFrom: "+15551234567" };
    expect(await saveInstanceSmsProvider({ ...draft, twilioAccountSid: sid("b") })).toMatchObject({ ok: false, fieldErrors: { twilioAuthToken: [expect.any(String)] } });
    expect(m.instUpsert).not.toHaveBeenCalled();
    expect(await saveInstanceSmsProvider(draft)).toEqual({ ok: true });
  });
});
