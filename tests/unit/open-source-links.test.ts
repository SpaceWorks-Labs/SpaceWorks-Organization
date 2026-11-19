import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHANGELOG_URL, GITHUB_URL, INSTALL_COMMAND, LICENSE_URL, RELEASE_URL, RELEASE_VERSION, docsPath } from "@/lib/openSource";

const root = join(import.meta.dirname, "../..");

describe("open-source links", () => {
  it("keeps the release constant equal to the root VERSION file", () => {
    expect(RELEASE_VERSION).toBe(readFileSync(join(root, "VERSION"), "utf8").trim());
  });

  it("points at the project repository", () => {
    expect(GITHUB_URL).toBe("https://github.com/SpaceWorks-Labs/SpaceWorks-Organization");
    for (const url of [LICENSE_URL, CHANGELOG_URL, RELEASE_URL]) expect(url.startsWith(`${GITHUB_URL}/`)).toBe(true);
  });

  it("uses the installer the self-hosting guide documents", () => {
    expect(INSTALL_COMMAND).toBe("curl -fsSL https://raw.githubusercontent.com/SpaceWorks-Labs/SpaceWorks-Organization/main/install.sh | bash");
    expect(readFileSync(join(root, "install.sh"), "utf8").length).toBeGreaterThan(0);
  });

  it("builds docs paths", () => {
    expect(docsPath("units")).toBe("/docs/units");
  });
});
