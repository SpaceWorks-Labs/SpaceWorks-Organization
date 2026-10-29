import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** The installer menu runs scripts of the installed release; updates must ship every one of them. */
const root = join(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const bundleBlock = read("scripts/install-host-bundle.sh").match(/HOST_BUNDLE_FILES=\(([\s\S]*?)\n\)/)?.[1] ?? "";
const bundle = bundleBlock.split(/\s+/).filter(Boolean);
const installer = read("install.sh");
const menuScripts = [...installer.matchAll(/TOOL=\(([a-z-]+\.sh)/g)].map((match) => `scripts/${match[1]}`);

describe("installer menu", () => {
  it("offers options 0 to 11", () => {
    expect(installer).toContain("Choose 0-11 [0]");
    for (let option = 1; option <= 11; option += 1) expect(installer).toMatch(new RegExp(`\\n  ${option}\\) `));
  });

  it("runs only scripts that exist and that updates replace", () => {
    expect(menuScripts.length).toBeGreaterThanOrEqual(9);
    for (const script of menuScripts) {
      expect(existsSync(join(root, script)), script).toBe(true);
      expect(bundle, script).toContain(script);
    }
  });

  it("ships every server tool and every bundled file exists", () => {
    const tools = readdirSync(join(root, "scripts")).filter((name) => /^vps-.*\.sh$/.test(name));
    for (const tool of tools) expect(bundle, tool).toContain(`scripts/${tool}`);
    for (const file of bundle) expect(existsSync(join(root, file)), file).toBe(true);
  });

  it("recovers super admins only through scripts/admin.sh, never a reset link", () => {
    const recover = read("scripts/vps-recover.sh");
    expect(recover).toContain('"$ROOT/scripts/admin.sh"');
    for (const command of ["reset-mfa", "set-password", "create"]) expect(recover).toContain(`admin ${command} --email`);
    expect(recover).not.toMatch(/https?:\/\/|token|\.mjs/);
  });
});
