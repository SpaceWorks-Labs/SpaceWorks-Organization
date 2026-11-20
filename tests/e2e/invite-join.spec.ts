import { expect, test } from "@playwright/test";

// A made-up invite link is "unavailable"; the signed-in states and the real account options need a seeded
// invite, which this suite has no way to create without a signed-in owner session.

test("an unknown staff invite says it is unavailable and offers no sign-up", async ({ page }) => {
  await page.goto(`/join/org/${"x".repeat(43)}`);
  await expect(page.getByRole("heading", { name: "Invite unavailable" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("a signed-out visitor to a valid staff invite sees the account options", async ({ page, request }) => {
  const token = process.env.E2E_INVITE_TOKEN;
  test.skip(!token, "Needs a live, unused staff invite: set E2E_INVITE_TOKEN to its token (create one in the organisation's team settings).");
  const response = await request.get(`/join/org/${token}`);
  expect(response.status()).toBe(200);
  await page.goto(`/join/org/${token}`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByLabel("Name")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept invite" })).toHaveCount(0);
});
