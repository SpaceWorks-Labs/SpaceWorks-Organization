import { expect, test, type Page } from "@playwright/test";

// Proves, in a real browser, that nothing reaches an outside analytics vendor before the visitor chooses.
//
// It needs a server with one provider switched on and the privacy panel mounted in the root layout. The
// least setup is Mixpanel, which is environment-only (no database row). Start the app with
//   WEB_TELEMETRY_MIXPANEL_TOKEN=e2e_fake_token
// and run this file with E2E_TELEMETRY=1. Every vendor request is intercepted with page.route, so no network is used.
test.skip(process.env.E2E_TELEMETRY !== "1", "Needs a server started with WEB_TELEMETRY_MIXPANEL_TOKEN set; run with E2E_TELEMETRY=1 (see the header of this file).");

const VENDOR = /^https:\/\/(cdn\.mxpnl\.com|api(-eu)?\.mixpanel\.com)\//;
const SDK_STUB = `window.mixpanel = { init: function (token, cfg) { return {
  track: function (name) { cfg.hooks.before_send_events({ event: name }); },
  stop_batch_senders: function () {}, opt_out_tracking: function () {}, clear_opt_in_out_tracking: function () {} }; } };`;

async function watch(page: Page) {
  const vendorRequests: { url: string; body: string | null }[] = [];
  await page.route(VENDOR, async (route) => {
    const request = route.request();
    vendorRequests.push({ url: request.url(), body: request.postData() });
    if (request.url().endsWith("mixpanel-2-latest.min.js")) await route.fulfill({ status: 200, contentType: "text/javascript", body: SDK_STUB, headers: { "access-control-allow-origin": "*" } });
    else await route.fulfill({ status: 200, contentType: "application/json", body: "1", headers: { "access-control-allow-origin": "*" } });
  });
  return vendorRequests;
}
const storage = (page: Page) => page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage), cookie: document.cookie }));

test("a first visit to a public page sends nothing to a vendor and stores nothing", async ({ page, context }) => {
  const vendorRequests = await watch(page);
  await page.goto("/about", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Privacy preferences" })).toBeVisible();
  await page.waitForTimeout(1000);
  expect(vendorRequests).toEqual([]);
  expect(await storage(page)).toEqual({ local: [], session: [], cookie: "" });
  expect((await context.cookies()).filter((cookie) => /mp_|mixpanel|ph_|_ga|_cl|clarity/i.test(cookie.name))).toEqual([]);
});

test("rejecting all keeps vendors silent and stores only the consent record", async ({ page }) => {
  const vendorRequests = await watch(page);
  await page.goto("/about", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Reject all" }).click();
  await page.waitForTimeout(1000);
  expect(vendorRequests).toEqual([]);
  const { local, session, cookie } = await storage(page);
  expect(local).toHaveLength(1);
  expect(local[0]).toMatch(/^spaceworks\.telemetry\.consent\.v1:platform:/);
  expect([session, cookie]).toEqual([[], ""]);
});

test("accepting loads the vendor and reports a route template, never a raw URL", async ({ page }) => {
  const vendorRequests = await watch(page);
  await page.goto("/about", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Accept all" }).click();
  await expect.poll(() => vendorRequests.some((item) => item.url.includes("/track/"))).toBe(true);
  const track = vendorRequests.find((item) => item.url.includes("/track/"))!;
  expect(track.url).toContain("ip=0");
  expect(JSON.parse(track.body ?? "[]")[0].properties).toMatchObject({ route: "/about", client: "web" });
  expect(track.body).not.toContain("?");
});

test("private pages never reach a vendor, and the privacy panel is not shown there", async ({ page }) => {
  const vendorRequests = await watch(page);
  for (const path of ["/login", "/start", "/verify/" + "x".repeat(43)]) {
    await page.goto(path, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Privacy preferences" })).toHaveCount(0);
  }
  expect(vendorRequests).toEqual([]);
});
