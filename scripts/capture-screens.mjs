// Capture the landing page and docs screenshots in both themes from the seeded demo:
//   public/screens/<name>-light.webp and public/screens/<name>-dark.webp (1440 × 900, webp).
//
// Needs a running production server (BASE_URL, default http://127.0.0.1:3000; `npm run build` then
// `node .next/standalone/server.js` after scripts/prepare-standalone.mjs), not `next dev`, whose hot reload replaces
// pages mid-capture whenever a file changes. Seed the demo data first:
//   DEMO_PASSWORD=... DEMO_MFA_SECRET=... npm run db:seed-demo && npm run db:seed-reports
//   DEMO_PASSWORD=... DEMO_MFA_SECRET=... node scripts/capture-screens.mjs [name ...]
// With names, only those shots are captured. Motion is reduced so nothing is caught mid-animation, and the
// theme is fixed through the swo.theme cookie (lib/colorMode.ts), exactly as a visitor's choice would be.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import * as OTPAuth from "otpauth";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "public/screens");
const base = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const password = process.env.DEMO_PASSWORD ?? "";
const mfaSecret = process.env.DEMO_MFA_SECRET ?? "";
const org = process.env.DEMO_ORG ?? "spaceworks";
const VIEWPORT = { width: 1440, height: 900 };

/** Each shot: the file name (an area slug where it belongs to one), the page, and who must be signed in. */
const SHOTS = [
  { name: "members", path: `/dashboard/${org}/members`, as: "owner@demo.test" },
  { name: "organisations", path: "/super-admin/orgs", as: "admin@demo.test" },
  { name: "units", path: `/dashboard/${org}/settings/structure`, as: "owner@demo.test" },
  { name: "staff-and-roles", path: `/dashboard/${org}/settings/roles`, as: "owner@demo.test" },
  { name: "plans-and-join-forms", path: `/dashboard/${org}/plans`, as: "owner@demo.test" },
  { name: "renewals", path: `/dashboard/${org}/reports/renewals`, as: "owner@demo.test" },
  { name: "payments", path: `/dashboard/${org}/payments`, as: "owner@demo.test" },
  { name: "receipts-and-refunds", path: `/dashboard/${org}/reports/tax`, as: "owner@demo.test" },
  { name: "member-cards", path: `/dashboard/${org}/settings/cards`, as: "owner@demo.test" },
  { name: "member-portal", path: "/account", as: "applicant@demo.test" },
  { name: "public-page", path: `/o/${org}`, as: null },
  { name: "reports-and-analytics", path: `/dashboard/${org}/reports`, as: "owner@demo.test" },
  { name: "notifications", path: `/dashboard/${org}/settings/notifications`, as: "owner@demo.test" },
  { name: "web-analytics", path: `/dashboard/${org}/settings/analytics`, as: "owner@demo.test" },
  { name: "sign-in", path: "/login", as: null },
  { name: "self-hosting", path: "/super-admin/operations", as: "admin@demo.test" },
];

let lastStep = 0;
/** The next unused authenticator step (the app accepts each 30-second code once). */
async function nextTotp() {
  const nowStep = Math.floor(Date.now() / 30_000);
  const step = Math.max(lastStep + 1, nowStep - 1);
  if (step > nowStep + 1) await new Promise((resolve) => setTimeout(resolve, (step - 1) * 30_000 - Date.now() + 1_000));
  lastStep = step;
  return new OTPAuth.TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(mfaSecret) }).generate({ timestamp: step * 30_000 + 1_000 });
}

async function signIn(page, email) {
  // Type only after hydration, or React resets the controlled fields.
  await page.goto(`${base}/login`, { waitUntil: "load" });
  await page.waitForTimeout(2_000);
  await page.fill('input[autocomplete="email"]', email);
  await page.fill('input[autocomplete="current-password"]', password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const code = page.getByLabel("Authenticator or recovery code");
  // Staff get an authenticator step; members go straight in. The losing wait must not reject unhandled.
  const settle = (promise) => promise.then(() => true, () => false);
  await Promise.race([settle(code.waitFor({ timeout: 30_000 })), settle(page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 }))]);
  if (await code.isVisible()) {
    await code.fill(await nextTotp());
    await page.getByRole("button", { name: "Verify and sign in" }).click();
  }
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
}

async function main() {
  const only = new Set(process.argv.slice(2));
  const shots = SHOTS.filter((shot) => !only.size || only.has(shot.name));
  if (shots.some((shot) => shot.as) && (!password || !mfaSecret)) throw new Error("Set DEMO_PASSWORD and DEMO_MFA_SECRET (the values the demo was seeded with).");
  mkdirSync(output, { recursive: true });
  // CHROMIUM_PATH: an already installed Chromium when the bundled one does not match this Playwright version.
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const contexts = new Map();
  try {
    for (const shot of shots) {
      const key = shot.as ?? "guest";
      if (!contexts.has(key)) {
        const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, reducedMotion: "reduce", locale: "en-GB" });
        if (shot.as) await signIn(await context.newPage(), shot.as);
        contexts.set(key, context);
      }
      const context = contexts.get(key);
      for (const theme of ["light", "dark"]) {
        await context.addCookies([{ name: "swo.theme", value: theme, url: base }]);
        const page = await context.newPage();
        await page.goto(`${base}${shot.path}`, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(1_500);
        const png = await page.screenshot({ type: "png" });
        await sharp(png).webp({ quality: 82 }).toFile(path.join(output, `${shot.name}-${theme}.webp`));
        await page.close();
        console.log(`captured ${shot.name}-${theme}.webp`);
      }
    }
  } finally {
    await browser.close();
  }
}

await main();
