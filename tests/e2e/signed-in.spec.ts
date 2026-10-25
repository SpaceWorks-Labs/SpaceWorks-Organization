import { expect, test, type Page } from "@playwright/test";
import { nextTotp } from "./totp";

// Signed-in journeys over the demo data from `npm run db:seed-demo` (plus `db:seed-reports`).
// The demo password comes from DEMO_PASSWORD and the staff authenticator from DEMO_MFA_SECRET; without them
// these tests are skipped.
const password = process.env.DEMO_PASSWORD;
const mfaSecret = process.env.DEMO_MFA_SECRET;
test.skip(!password || !mfaSecret, "DEMO_PASSWORD and DEMO_MFA_SECRET must be set; seed the demo data to run signed-in journeys.");

async function signIn(page: Page, email: string, retry = true): Promise<void> {
  // Type only after hydration, or React resets the controlled fields.
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill('input[autocomplete="email"]', email);
  await page.fill('input[autocomplete="current-password"]', password!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // Staff have an authenticator; members (just verified by the seed) go straight in.
  const code = page.getByLabel("Authenticator or recovery code");
  // Sign-in allows 10 attempts a minute from one address (proxy.ts), and a staff sign-in takes two, so a
  // long run of journeys can spend it. Then the sign-in fails; wait the minute out once and start again.
  const limited = page.getByText("Sign-in is temporarily unavailable");
  const signedIn = () => page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
  await Promise.race([code.waitFor({ timeout: 30_000 }), signedIn(), limited.waitFor({ timeout: 30_000 })]);
  if (await code.isVisible()) {
    await code.fill(await nextTotp(mfaSecret!));
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await Promise.race([signedIn(), limited.waitFor({ timeout: 30_000 })]).catch(() => undefined);
  }
  if (retry && (await limited.isVisible())) {
    await page.waitForTimeout(61_000);
    return signIn(page, email, false);
  }
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
}

test("an owner records an expense, sees it in the accounts and voids it", async ({ page }) => {
  await signIn(page, "owner@demo.test");
  await page.goto("/dashboard/tinkerspace/accounts");
  await expect(page.getByRole("heading", { name: "Accounts", level: 1 })).toBeVisible();

  const category = `E2E supplies ${Date.now()}`;
  await page.getByRole("button", { name: "Payment made" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Category").fill(category);
  await dialog.getByLabel("Amount").fill("1234.50");
  await dialog.getByRole("button", { name: "Record payment" }).click();
  await expect(dialog).toBeHidden();

  const statement = page.getByRole("table").first();
  await expect(statement.getByRole("row", { name: new RegExp(category) })).toContainText("₹1,234.50");

  const entry = page.locator("li", { hasText: category });
  await entry.getByRole("button", { name: "Void" }).click();
  const confirm = page.getByRole("alertdialog");
  await confirm.getByLabel("Reason").fill("End-to-end test");
  await confirm.getByRole("button", { name: "Void entry" }).click();
  await expect(entry).toContainText("Voided");
  await expect(statement.getByRole("row", { name: new RegExp(category) })).toHaveCount(0);
});

test("an owner sees the member list", async ({ page }) => {
  await signIn(page, "owner@demo.test");
  await page.goto("/dashboard/spaceworks/members");
  await expect(page.getByRole("heading", { name: "Members", level: 1 })).toBeVisible();
  const rows = page.getByRole("row");
  await expect(rows.nth(1)).toBeVisible();
});

test("a viewer is sent back from the accounts and never offered them", async ({ page }) => {
  await signIn(page, "viewer@demo.test");
  await page.goto("/dashboard/spaceworks/accounts");
  await expect(page).toHaveURL(/\/dashboard\/spaceworks$/);
  await expect(page.getByRole("link", { name: "Accounts" })).toHaveCount(0);
});

test("a member's portal lists their organisations", async ({ page }) => {
  await signIn(page, "applicant@demo.test");
  await page.goto("/account/organisations");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/Ideologists|Kunj/).first()).toBeVisible();
});

test("an owner reaches the email and chat notification settings", async ({ page }) => {
  await signIn(page, "owner@demo.test");
  await page.goto("/dashboard/spaceworks/settings/email");
  await expect(page.getByRole("heading", { name: "Your own email" })).toBeVisible();
  await page.goto("/dashboard/spaceworks/settings/notifications");
  await expect(page.getByRole("heading", { name: "Chat alerts" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add channel" })).toBeVisible();
});

test("an owner adds, styles, stacks and undoes a layer in the card designer, then approves it", async ({ page }) => {
  // Room for a sign-in that has to wait out the rate limit.
  test.setTimeout(240_000);
  await signIn(page, "owner@demo.test");
  await page.goto("/dashboard/spaceworks/settings/cards");
  const toolbar = page.getByRole("toolbar", { name: "Add to the card" });
  await toolbar.getByRole("button", { name: "Text", exact: true }).click();

  const preview = page.getByRole("region", { name: "Card preview" });
  const layer = preview.getByRole("button", { name: /^Your text\./ });
  await expect(layer).toBeVisible();
  await page.getByRole("textbox", { name: "Text", exact: true }).fill("Hello {name}");
  await expect(preview.getByText("Hello Shaan Shoukath")).toBeVisible();

  await page.getByRole("button", { name: /^Font:/ }).click();
  await page.getByRole("searchbox", { name: "Find a font" }).fill("Lobster");
  await page.getByRole("button", { name: "Lobster", exact: true }).click();
  await expect(page.getByRole("button", { name: "Font: Lobster" })).toBeVisible();

  const layers = page.getByRole("region", { name: "Layers" });
  await expect(layers.getByRole("listitem").first()).toContainText("Hello {name}");
  await page.getByRole("button", { name: "Send to back" }).click();
  await expect(layers.getByRole("listitem").last()).toContainText("Hello {name}");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });

  // Edits are a draft: members' cards wait for the owner's approval.
  await expect(page.getByText("Waiting for the owner's approval")).toBeVisible();

  // Undo walks back through the changes until the layer is gone.
  const undo = page.getByRole("button", { name: "Undo (Ctrl+Z)" });
  while (await undo.isEnabled()) await undo.click();
  await expect(preview.getByText("Hello Shaan Shoukath")).toHaveCount(0);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });

  // The owner approves, and the design is what members' cards use.
  await page.getByRole("button", { name: "Approve and publish" }).click();
  await expect(page.getByText("On members' cards")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Approve and publish" })).toHaveCount(0);
});
