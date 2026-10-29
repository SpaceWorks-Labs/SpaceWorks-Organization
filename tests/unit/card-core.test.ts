import { describe, expect, it } from "vitest";
import { cardState, deriveCardPrefix, formatValidUntil, memberDetails, VERIFY_TOKEN_PATTERN } from "@/lib/cards/core";
import { newVerifyToken } from "@/lib/cards/issue";
import { exportCardsWhere, parseExportFilter } from "@/lib/cards/exportFilter";
import { managedImageUrl } from "@/lib/cards/imageUrl";
import { validUntilLine } from "@/lib/cards/types";

describe("verify tokens", () => {
  it("are 43 base64url characters and never repeat", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newVerifyToken()));
    expect(tokens.size).toBe(200);
    for (const token of tokens) expect(token).toMatch(VERIFY_TOKEN_PATTERN);
  });

  it("rejects anything that is not a token", () => {
    for (const value of ["", "short", "a".repeat(42), "a".repeat(44), `${"a".repeat(42)}/`, `${"a".repeat(42)}=`]) expect(VERIFY_TOKEN_PATTERN.test(value)).toBe(false);
  });
});

describe("card numbers", () => {
  it("derive a prefix from the organisation name", () => {
    expect(deriveCardPrefix("SpaceWorks")).toBe("SPA");
    expect(deriveCardPrefix("Kerala Makers Guild")).toBe("KMG");
    expect(deriveCardPrefix("ശ്രീ സംഘം")).toBe("M");
  });

  it("print the last valid day in the organisation's time zone, or Lifetime", () => {
    // A term ending at midnight IST on 1 April is valid until 31 March.
    expect(formatValidUntil(new Date("2027-03-31T18:30:00Z"), "Asia/Kolkata")).toBe("31 Mar 2027");
    expect(formatValidUntil(null, "Asia/Kolkata")).toBe("Lifetime");
    expect(validUntilLine("Valid until", "31 Mar 2027")).toBe("Valid until 31 Mar 2027");
    expect(validUntilLine("Valid until", formatValidUntil(null, "Asia/Kolkata"))).toBe("Lifetime");
  });

  it("tell live, replaced and revoked cards apart", () => {
    expect(cardState({ revokedAt: null, revokedReason: null })).toBe("live");
    expect(cardState({ revokedAt: new Date(), revokedReason: "REISSUED" })).toBe("replaced");
    expect(cardState({ revokedAt: new Date(), revokedReason: "REVOKED" })).toBe("revoked");
  });

  it("print answers in field order, skipping empty ones and formatting dates", () => {
    const fields = [{ key: "blood", label: "Blood group", type: "TEXT" }, { key: "dob", label: "Born", type: "DATE" }, { key: "vol", label: "Volunteer", type: "CHECKBOX" }, { key: "none", label: "Empty", type: "TEXT" }];
    expect(memberDetails(fields, { dob: "1998-02-14", blood: "O+", vol: true, none: " " })).toEqual([
      { key: "blood", label: "Blood group", value: "O+" },
      { key: "dob", label: "Born", value: "14 Feb 1998" },
      { key: "vol", label: "Volunteer", value: "Yes" },
    ]);
  });
});

describe("card artwork", () => {
  const key = "organisations/org1/member-id-photos/0f8fad5b-d9cb-469f-a165-70867728950e.webp";
  it("draws only managed uploads of the right organisation and kind", () => {
    expect(managedImageUrl(`/api/uploads/${key}`, { kind: "organisation", organisationId: "org1", category: "member-id-photos" })).toBe(`/api/uploads/${key}`);
    expect(managedImageUrl(`/api/uploads/${key}`, { kind: "organisation", organisationId: "org2", category: "member-id-photos" })).toBeNull();
    expect(managedImageUrl("https://evil.example/photo.webp")).toBeNull();
    expect(managedImageUrl("/api/uploads/organisations/org1/../x.webp")).toBeNull();
  });
});

describe("bulk export filter", () => {
  it("keeps only known values", () => {
    expect(parseExportFilter({ status: "active", planId: "p1", unitId: "bad id!", roleId: 5, q: "  priya  " })).toEqual({ status: "active", planId: "p1", unitId: null, roleId: null, q: "priya" });
    expect(parseExportFilter("nonsense").status).toBe("all");
  });

  it("selects live cards inside the requester's scope", () => {
    const where = exportCardsWhere({ organisationId: "org1", unitId: "u1", unitPath: "root/u1" }, parseExportFilter({ planId: "p1" }), { contact: true });
    expect(where).toMatchObject({ organisationId: "org1", revokedAt: null, planId: "p1" });
    expect(JSON.stringify(where.member)).toContain("root/u1");
  });

  it("searches email only for staff who may see contact details", () => {
    const scope = { organisationId: "org1", unitId: null, unitPath: null };
    expect(JSON.stringify(exportCardsWhere(scope, parseExportFilter({ q: "gmail" }), { contact: true }).member)).toContain("email");
    expect(JSON.stringify(exportCardsWhere(scope, parseExportFilter({ q: "gmail" }), { contact: false }).member)).not.toContain("email");
  });
});
