import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(), orgAccess: vi.fn(), rateLimit: vi.fn(), audit: vi.fn(), revalidate: vi.fn(), settings: vi.fn(),
  instanceFind: vi.fn(), instanceUpsert: vi.fn(), instanceUpdateMany: vi.fn(),
  orgFind: vi.fn(), orgUpsert: vi.fn(), orgUpdate: vi.fn(), userFind: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({ requireSuperAdmin: mocks.requireSuperAdmin, orgActionAccess: mocks.orgAccess }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: mocks.rateLimit }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/instanceConfigSecrets", () => ({ encryptInstanceConfigSecret: (value: string) => `enc:${value}`, decryptInstanceConfigSecret: (value: string) => value.slice(4) }));
vi.mock("@/lib/orgSecrets", () => ({ encryptOrgSecret: (value: string) => `enc:${value}`, decryptOrgSecret: (value: string) => value.slice(4) }));
vi.mock("@/lib/instanceSettings", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/instanceSettings")>()), getEmailSettings: mocks.settings }));
vi.mock("@/lib/db", () => ({ prisma: {
  instanceSetting: { findUnique: mocks.instanceFind, upsert: mocks.instanceUpsert, updateMany: mocks.instanceUpdateMany },
  orgEmailSettings: { findUnique: mocks.orgFind, upsert: mocks.orgUpsert, update: mocks.orgUpdate },
  user: { findUnique: mocks.userFind },
  emailSuppression: { count: vi.fn().mockResolvedValue(0) },
} }));

import { saveInstanceEmailProvider, sendInstanceTestEmail } from "@/app/actions/instance-email";
import { saveOrgEmailSettings, sendOrgTestEmail } from "@/app/actions/org-email";

const fetchMock = vi.fn();
const SECRETS = ["re_live_instance_key", "re_org_key", "whsec_instance_secret"];
const everything = () => JSON.stringify([mocks.audit.mock.calls, mocks.revalidate.mock.calls]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  mocks.requireSuperAdmin.mockResolvedValue({ user: { id: "admin_1", email: "admin@example.test" } });
  mocks.orgAccess.mockResolvedValue({ ok: true, userId: "user_1", organisation: { id: "org_1", slug: "club", name: "Club" } });
  mocks.rateLimit.mockResolvedValue(false);
  mocks.settings.mockResolvedValue({ from: "Space Works <noreply@example.test>", provider: "smtp", providerConfig: {} });
  mocks.instanceFind.mockResolvedValue(null);
  mocks.userFind.mockResolvedValue({ email: "me@example.test" });
});
afterEach(() => { fetchMock.mockReset(); vi.unstubAllGlobals(); });

describe("platform email provider actions", () => {
  it("saves the provider with secrets encrypted, audited by field name only, and returns no secret", async () => {
    const result = await saveInstanceEmailProvider({ emailProvider: "resend", resendApiKey: SECRETS[0], webhookSecret: SECRETS[2] });
    expect(result).toEqual({ ok: true });
    const stored = mocks.instanceUpsert.mock.calls[0][0].create;
    expect(stored.emailProvider).toBe("resend");
    expect(stored.emailProviderConfigEncrypted.startsWith("enc:")).toBe(true);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "INSTANCE_EMAIL_PROVIDER_UPDATED", metadata: { provider: "resend", changed: "resendApiKey,webhookSecret" } }));
    expect(everything()).not.toMatch(/re_live_instance_key|whsec_instance_secret/);
  });

  it("keeps a saved secret when the form leaves it blank", async () => {
    mocks.instanceFind.mockResolvedValue({ emailProviderConfigEncrypted: `enc:${JSON.stringify({ resendApiKey: SECRETS[0] })}` });
    await saveInstanceEmailProvider({ emailProvider: "resend", resendApiKey: "", postmarkMessageStream: "outbound" });
    const saved = JSON.parse(mocks.instanceUpsert.mock.calls[0][0].update.emailProviderConfigEncrypted.slice(4));
    expect(saved.resendApiKey).toBe(SECRETS[0]);
    expect(mocks.audit.mock.calls[0][0].metadata.changed).toBe("postmarkMessageStream");
  });

  it("refuses a bad region and is gated by the super-admin check and the rate limit", async () => {
    expect((await saveInstanceEmailProvider({ emailProvider: "ses", sesRegion: "not a region" })).ok).toBe(false);
    mocks.rateLimit.mockResolvedValue(true);
    expect((await saveInstanceEmailProvider({ emailProvider: "resend" })).ok).toBe(false);
    expect(mocks.instanceUpsert).not.toHaveBeenCalled();
    mocks.requireSuperAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(sendInstanceTestEmail({ emailProvider: "resend", resendApiKey: "k" })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a test through unsaved form values, to the admin's own address, before anything is saved", async () => {
    const result = await sendInstanceTestEmail({ emailProvider: "resend", resendApiKey: SECRETS[0] });
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.authorization).toBe(`Bearer ${SECRETS[0]}`);
    expect(JSON.parse(init.body).to).toEqual(["admin@example.test"]);
    expect(mocks.instanceUpsert).not.toHaveBeenCalled();
    expect(mocks.instanceUpdateMany).not.toHaveBeenCalled();
    expect(everything()).not.toContain(SECRETS[0]);
  });

  it("reports a refused test without echoing the key, and an incomplete provider without sending", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    const failed = await sendInstanceTestEmail({ emailProvider: "resend", resendApiKey: SECRETS[0] });
    expect(failed.ok).toBe(false);
    expect(JSON.stringify(failed)).not.toContain(SECRETS[0]);
    fetchMock.mockClear();
    expect((await sendInstanceTestEmail({ emailProvider: "postmark" })).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("limits tests per hour", async () => {
    mocks.rateLimit.mockResolvedValue(true);
    expect(await sendInstanceTestEmail({ emailProvider: "resend", resendApiKey: "k" })).toMatchObject({ ok: false });
    expect(mocks.rateLimit).toHaveBeenCalledWith("testEmail", "admin_1");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("organisation email actions", () => {
  const form = { organisationSlug: "club", enabled: true, fromName: "Club", fromAddress: "club@example.org", replyTo: "", emailProvider: "resend" as const, resendApiKey: SECRETS[1] };

  it("refuses people without the settings permission", async () => {
    mocks.orgAccess.mockResolvedValue({ ok: false, error: "Not allowed." });
    expect(await saveOrgEmailSettings(form)).toEqual({ ok: false, error: "Not allowed." });
    expect(await sendOrgTestEmail(form)).toEqual({ ok: false, error: "Not allowed." });
    expect(mocks.orgUpsert).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves any provider with its secrets encrypted and audits field names only", async () => {
    mocks.orgFind.mockResolvedValue(null);
    expect(await saveOrgEmailSettings(form)).toEqual({ ok: true });
    const values = mocks.orgUpsert.mock.calls[0][0].create;
    expect(values).toMatchObject({ emailProvider: "resend", enabled: true });
    expect(values.providerConfigEncrypted).toBe(`enc:${JSON.stringify({ resendApiKey: SECRETS[1] })}`);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "ORG_EMAIL_SETTINGS_SAVED", organisationId: "org_1", metadata: { enabled: true, provider: "resend", changed: "resendApiKey" } }));
    expect(everything()).not.toContain(SECRETS[1]);
  });

  it("needs an SMTP host only for SMTP, and keeps a blank saved password", async () => {
    expect((await saveOrgEmailSettings({ ...form, emailProvider: "smtp", resendApiKey: undefined })).ok).toBe(false);
    mocks.orgFind.mockResolvedValue({ providerConfigEncrypted: null, smtpPasswordEncrypted: "enc:old", smtpHost: "smtp.example.org", smtpPort: 587, smtpUser: null });
    expect(await saveOrgEmailSettings({ ...form, emailProvider: "smtp", resendApiKey: undefined, smtpHost: "smtp.example.org", smtpPort: 587 })).toEqual({ ok: true });
    expect(mocks.orgUpsert.mock.calls[0][0].update).not.toHaveProperty("smtpPasswordEncrypted");
  });

  it("tests unsaved values with saved secrets filling the blanks, and records only a test of what is saved", async () => {
    mocks.orgFind.mockResolvedValue({ organisationId: "org_1", fromAddress: "club@example.org", fromName: "Club", replyTo: null, emailProvider: "resend", providerConfigEncrypted: `enc:${JSON.stringify({ resendApiKey: SECRETS[1] })}`, smtpHost: null, smtpPort: 587, smtpUser: null, smtpPasswordEncrypted: null });
    expect(await sendOrgTestEmail({ organisationSlug: "club", emailProvider: "resend" })).toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe(`Bearer ${SECRETS[1]}`);
    expect(mocks.orgUpdate).toHaveBeenCalledTimes(1);
    mocks.orgUpdate.mockClear();
    expect(await sendOrgTestEmail({ organisationSlug: "club", emailProvider: "resend", resendApiKey: "re_other" })).toEqual({ ok: true });
    expect(fetchMock.mock.calls[1][1].headers.authorization).toBe("Bearer re_other");
    expect(mocks.orgUpdate).not.toHaveBeenCalled();
  });

  it("reports a refused test without the key", async () => {
    mocks.orgFind.mockResolvedValue({ organisationId: "org_1", fromAddress: "club@example.org", fromName: "", replyTo: null, emailProvider: "resend", providerConfigEncrypted: null, smtpHost: null, smtpPort: 587, smtpUser: null, smtpPasswordEncrypted: null });
    fetchMock.mockResolvedValue(new Response("{}", { status: 403 }));
    const result = await sendOrgTestEmail({ organisationSlug: "club", emailProvider: "resend", resendApiKey: SECRETS[1] });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(SECRETS[1]);
  });
});
