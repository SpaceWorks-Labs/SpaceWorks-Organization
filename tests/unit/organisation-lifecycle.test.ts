import { describe, expect, it } from "vitest";
import type { OrganisationStatus } from "@prisma/client";
import { canDeleteInStatus, canResubmit, decisionsFor, isReviewDecision, REVIEW_DECISIONS } from "@/lib/organisationLifecycle";
import { organisationAllows, CAPABILITY_LIST } from "@/lib/permissionRoles";

const ALL_STATUSES: OrganisationStatus[] = ["PENDING_REVIEW", "CHANGES_REQUESTED", "ACTIVE", "REJECTED", "SUSPENDED", "ARCHIVED"];

describe("organisation review decisions", () => {
  it("offers only the decisions that make sense for each status", () => {
    expect(decisionsFor("PENDING_REVIEW")).toEqual(["approve", "request-changes", "reject"]);
    expect(decisionsFor("CHANGES_REQUESTED")).toEqual(["approve", "reject"]);
    expect(decisionsFor("ACTIVE")).toEqual(["suspend", "archive"]);
    expect(decisionsFor("SUSPENDED")).toEqual(["reactivate", "archive"]);
    expect(decisionsFor("ARCHIVED")).toEqual(["reactivate"]);
    expect(decisionsFor("REJECTED")).toEqual([]);
  });

  it("always explains refusals, change requests and suspensions to the owners", () => {
    for (const decision of ["request-changes", "reject", "suspend"] as const) {
      expect(REVIEW_DECISIONS[decision].reasonRequired).toBe(true);
      expect(REVIEW_DECISIONS[decision].notice).not.toBeNull();
    }
    expect(REVIEW_DECISIONS.approve.reasonRequired).toBe(false);
  });

  it("asks for confirmation before taking access away", () => {
    expect(REVIEW_DECISIONS.reject.confirm).toBeTruthy();
    expect(REVIEW_DECISIONS.suspend.confirm).toBeTruthy();
    expect(REVIEW_DECISIONS.archive.confirm).toBeTruthy();
    expect(REVIEW_DECISIONS.approve.confirm).toBeUndefined();
  });

  it("recognises only known decisions", () => {
    expect(isReviewDecision("approve")).toBe(true);
    expect(isReviewDecision("toString")).toBe(false);
    expect(isReviewDecision("delete")).toBe(false);
    expect(isReviewDecision(undefined)).toBe(false);
  });

  it("lets the team edit only an application sent back for changes", () => {
    expect(ALL_STATUSES.filter(canResubmit)).toEqual(["CHANGES_REQUESTED"]);
  });

  it("keeps suspended and archived organisations from being deleted", () => {
    expect(ALL_STATUSES.filter((status) => !canDeleteInStatus(status))).toEqual(["SUSPENDED", "ARCHIVED"]);
  });
});

describe("what an organisation's status allows", () => {
  const capabilities = CAPABILITY_LIST;

  it("opens everything once active", () => {
    expect(capabilities.every((capability) => organisationAllows("ACTIVE", capability))).toBe(true);
  });

  it("opens nothing before approval or after a refusal", () => {
    for (const status of ["PENDING_REVIEW", "CHANGES_REQUESTED", "REJECTED"] as const) {
      expect(capabilities.filter((capability) => organisationAllows(status, capability))).toEqual([]);
    }
  });

  it("keeps only finance, viewing and erasure decisions open while suspended or archived", () => {
    for (const status of ["SUSPENDED", "ARCHIVED"] as const) {
      expect(capabilities.filter((capability) => organisationAllows(status, capability)).sort()).toEqual(
        // accounts.manage and reports.gstr1 were split out of payments.manage and reports.finance, and keep what those had.
        ["accounts.manage", "erasure.decide", "members.export", "members.view", "org.view", "payments.manage", "payments.view", "reports.finance", "reports.gstr1"],
      );
    }
  });
});
