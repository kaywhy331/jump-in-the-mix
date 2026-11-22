// Captures the public pages' product shots (JITM-03 §2.19) from the fictional demo workspace.
//
// 1. Seed a disposable loopback database: DEMO_MODE=true RESET_DEMO_DATA=true npm run db:seed
//    with DATABASE_URL naming a jitm_design_* database (prisma/seed.ts: Northline Home Services,
//    Sarah Chen, Marcus Reed and Elena Torres, example.com addresses and 555 numbers).
// 2. Build and start the app against that database: npm run build && npm run start
// 3. node scripts/capture-product-shots.mjs
//
// Writes public/product-shots/{today-desktop,today-phone,review-phone}-{light,dark}.webp.
// The desktop Today capture includes the review docked beside the list (JITM-07 §2: from 768px).
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "public/product-shots");
const base = new URL(process.env.PLAYWRIGHT_BASE_URL ?? process.env.APP_URL ?? "http://127.0.0.1:3000");
const database = new URL(process.env.DATABASE_URL ?? "postgresql://localhost/unknown");
const loopback = host => ["localhost", "127.0.0.1"].includes(host);
// Captures may only come from fixture data: a loopback app on a disposable jitm_design_* database.
if (!loopback(base.hostname) || !loopback(database.hostname) || !database.pathname.startsWith("/jitm_design_")) {
  throw new Error("Run against a loopback app whose DATABASE_URL names a disposable jitm_design_* database.");
}
const email = process.env.DEMO_USER_EMAIL ?? "demo@jumpinthemix.local";
const password = process.env.DEMO_USER_PASSWORD ?? "JumpInTheMix123!";

// Each capture is encoded at about twice its largest display width on the public pages.
const shots = [
  { name: "today-desktop", viewport: { width: 1280, height: 900 }, scale: 1.5, width: 1920, review: false },
  { name: "today-phone", viewport: { width: 390, height: 844 }, scale: 2, width: 600, review: false, mobile: true },
  { name: "review-phone", viewport: { width: 390, height: 844 }, scale: 2, width: 600, review: true, mobile: true }
];

const browser = await chromium.launch();
await fs.mkdir(output, { recursive: true });
try {
  for (const scheme of ["light", "dark"]) {
    for (const shot of shots) {
      const context = await browser.newContext({
        baseURL: base.origin, viewport: shot.viewport, deviceScaleFactor: shot.scale, colorScheme: scheme,
        reducedMotion: "reduce", isMobile: Boolean(shot.mobile), hasTouch: Boolean(shot.mobile)
      });
      const page = await context.newPage();
      await page.goto("/login");
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.waitForURL(/\/jumps/);
      await page.locator("[data-browser-scope]:not([inert])").waitFor({ timeout: 60_000 });
      await page.locator("article.jump-card").first().waitFor();
      if (shot.review) {
        await page.locator("article.jump-card .sheet-trigger > [data-review-trigger]").first().click();
        await page.locator("dialog.follow-up-review-sheet[open]").waitFor();
      }
      await page.evaluate(async () => { await document.fonts.ready; });
      await page.waitForTimeout(500);
      // Nothing but the review may sit over the page, and no field may hold focus (no caret or ring).
      const overlays = await page.evaluate(() => [...document.querySelectorAll("dialog[open], [role=dialog], [role=alertdialog]")]
        .filter(element => element.getBoundingClientRect().width > 0 && !element.classList.contains("follow-up-review-sheet"))
        .map(element => element.className.toString()));
      if (overlays.length) throw new Error(`${shot.name} ${scheme}: unexpected overlay ${overlays.join(", ")}`);
      await page.evaluate(() => { if (document.activeElement instanceof HTMLElement && document.activeElement.matches("input, textarea, [contenteditable]")) document.activeElement.blur(); });
      const capture = await page.screenshot({ fullPage: !shot.mobile, animations: "disabled", caret: "hide" });
      const file = path.join(output, `${shot.name}-${scheme}.webp`);
      await sharp(capture).resize({ width: shot.width }).webp({ quality: 80, effort: 6 }).toFile(file);
      const { width, height, size } = await sharp(file).metadata().then(async meta => ({ ...meta, size: (await fs.stat(file)).size }));
      console.log(`${path.relative(root, file)} ${width}x${height} ${Math.round(size / 1024)} KB`);
      await context.close();
    }
  }
} finally {
  await browser.close();
}
