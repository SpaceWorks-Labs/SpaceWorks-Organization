import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("frontend production boundaries", () => {
  it("pages the team list and sends emails only to admin viewers", () => {
    const team = source("lib/views/app__dashboard__orgSlug__team__page.ts");
    expect(team).toContain("take: MEMBERS_PAGE_SIZE");
    expect(team).toContain("email: adminView");
  });

  it("keeps production errors category-only", () => {
    const iconButton = source("components/ui/button.tsx");
    // IconButton requires a label and renders it as the accessible name.
    expect(iconButton).toContain("aria-label={label}");
    for (const path of ["app/error.tsx", "app/global-error.tsx"]) {
      const boundary = source(path);
      expect(boundary).toContain('process.env.NODE_ENV === "development"');
      expect(boundary).toMatch(/else console\.error\("\[ui\] (?:route|global) error"\)/);
    }
  });

  it("provides accessible navigation, reduced motion, and install metadata", () => {
    const chrome = source("components/chrome/ChromeSwitch.tsx");
    const appShell = source("components/chrome/AppShell.tsx");
    const styles = source("app/styles/motion.css");
    const manifest = source("app/manifest.ts");
    expect(chrome).toContain('href="#main-content"');
    expect(chrome).toContain('id="main-content"');
    expect(appShell).toContain('id="main-content"');
    expect(styles).toContain("prefers-reduced-motion: reduce");
    expect(manifest).toContain('display: "standalone"');
    expect(manifest).toContain('start_url: "/dashboard"');
  });

  it("requires confirmations for destructive team and security actions", () => {
    expect(source("components/team/MemberRoleActions.tsx")).toContain("from the team?");
    expect(source("components/team/OrgInviteLinkPanel.tsx")).toContain('title="Revoke invite link?"');
    expect(source("components/security/SignOutEverywhereCard.tsx")).toContain('title="Sign out everywhere?"');
    expect(source("components/security/AccountSecurityClient.tsx")).toContain('title="Turn off two-step verification?"');
  });
});
