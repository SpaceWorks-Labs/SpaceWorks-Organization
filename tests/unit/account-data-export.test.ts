import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  audit: vi.fn(),
  rateLimit: vi.fn(),
  user: vi.fn(),
  accounts: vi.fn(),
  teamMembers: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: mocks.audit }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimitById: mocks.rateLimit }));
vi.mock("@/lib/db", () => ({ prisma: {
  user: { findUnique: mocks.user },
  account: { findMany: mocks.accounts },
  teamMember: { findMany: mocks.teamMembers },
} }));

import { GET } from "@/app/api/exports/account/route";
import { ACCOUNT_EXPORT_LIMIT, buildAccountDataExport, type AccountExportSource } from "@/lib/accountDataExport";

const SECRETS = {
  passwordHash: "$2b$12$secret-password-hash",
  mfaSecretEncrypted: "enc:mfa-seed-value",
  recoveryCodeHashes: ["recovery-hash-1"],
  sessionVersion: 7,
  access_token: "oauth-access-token",
  refresh_token: "oauth-refresh-token",
  id_token: "oauth-id-token",
};

/** Source rows polluted with secret columns, as if a loader over-selected. */
function pollutedSource(): AccountExportSource {
  const source = {
    user: {
      name: "Ada Lovelace",
      email: "ada@example.test",
      emailVerified: new Date("2030-01-01T00:00:00Z"),
      createdAt: new Date("2029-12-01T00:00:00Z"),
      mfaEnabledAt: new Date("2030-01-02T00:00:00Z"),
      passwordHash: SECRETS.passwordHash,
      mfaSecretEncrypted: SECRETS.mfaSecretEncrypted,
      recoveryCodeHashes: SECRETS.recoveryCodeHashes,
      sessionVersion: SECRETS.sessionVersion,
    },
    signInProviders: [{ provider: "google", access_token: SECRETS.access_token, refresh_token: SECRETS.refresh_token, id_token: SECRETS.id_token }],
    teamMembers: [{ orgRole: { name: "Owner" }, createdAt: new Date("2030-01-03T00:00:00Z"), organisation: { name: "Analytical Society", slug: "analytical" } }],
  };
  return source as unknown as AccountExportSource;
}

describe("account data export shaping", () => {
  it("includes the user's own data", () => {
    const data = buildAccountDataExport(pollutedSource(), new Date("2030-04-01T00:00:00Z"));
    expect(data.profile).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.test",
      emailVerified: true,
      emailVerifiedAt: "2030-01-01T00:00:00.000Z",
      accountCreatedAt: "2029-12-01T00:00:00.000Z",
      twoFactorAuthenticationEnabled: true,
      linkedSignInProviders: ["google"],
    });
    expect(data.organisationTeams).toEqual([{ organisation: "Analytical Society", organisationSlug: "analytical", role: "Owner", joinedAt: "2030-01-03T00:00:00.000Z" }]);
    expect(data.truncated.organisationTeams).toBe(false);
  });

  it("caps each collection and says so", () => {
    const source = pollutedSource();
    source.teamMembers = Array.from({ length: ACCOUNT_EXPORT_LIMIT + 1 }, () => source.teamMembers[0]);
    const data = buildAccountDataExport(source);
    expect(data.organisationTeams).toHaveLength(ACCOUNT_EXPORT_LIMIT);
    expect(data.truncated.organisationTeams).toBe(true);
  });

  it("never copies secrets, hashes, or bearer tokens into the file", () => {
    const json = JSON.stringify(buildAccountDataExport(pollutedSource()));
    for (const value of [SECRETS.passwordHash, SECRETS.mfaSecretEncrypted, SECRETS.recoveryCodeHashes[0], SECRETS.access_token, SECRETS.refresh_token, SECRETS.id_token]) {
      expect(json).not.toContain(value);
    }
    for (const key of ["passwordHash", "mfaSecret", "recoveryCode", "sessionVersion", "access_token", "refresh_token", "id_token"]) {
      expect(json).not.toContain(`"${key}`);
    }
  });
});

describe("account data export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user_1" } });
    mocks.rateLimit.mockResolvedValue(true);
    mocks.user.mockResolvedValue({ name: "Ada", email: "ada@example.test", emailVerified: null, createdAt: new Date("2030-01-01T00:00:00Z"), mfaEnabledAt: null });
    mocks.accounts.mockResolvedValue([]);
    mocks.teamMembers.mockResolvedValue([]);
  });

  it("requires a signed-in user and reads nothing otherwise", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    for (const query of [mocks.user, mocks.accounts, mocks.teamMembers]) expect(query).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("is rate limited per user before any data is read", async () => {
    mocks.rateLimit.mockResolvedValue(false);
    const response = await GET();
    expect(response.status).toBe(429);
    expect(mocks.rateLimit).toHaveBeenCalledWith("dataExport", "user:user_1");
    expect(mocks.user).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("queries only the session user's rows and returns an audited, private attachment", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="space-works-organization-account-data-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(response.headers.get("cache-control")).toBe("private, no-store");

    expect(mocks.user.mock.calls[0][0].where).toEqual({ id: "user_1" });
    expect(mocks.accounts.mock.calls[0][0].where).toEqual({ userId: "user_1" });
    expect(mocks.teamMembers.mock.calls[0][0].where).toEqual({ userId: "user_1" });

    // Explicit selects never request secret columns.
    expect(mocks.user.mock.calls[0][0].select).not.toHaveProperty("passwordHash");
    expect(mocks.user.mock.calls[0][0].select).not.toHaveProperty("mfaSecretEncrypted");
    expect(mocks.user.mock.calls[0][0].select).not.toHaveProperty("recoveryCodeHashes");
    expect(mocks.accounts.mock.calls[0][0].select).toEqual({ provider: true });

    expect(mocks.audit).toHaveBeenCalledWith({ action: "ACCOUNT_DATA_EXPORTED", actorUserId: "user_1", targetType: "User", targetId: "user_1" });
    const body = JSON.parse(await response.text());
    expect(body.profile.email).toBe("ada@example.test");
  });
});
