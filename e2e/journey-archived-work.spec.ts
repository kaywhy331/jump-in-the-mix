import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { journeyArchivedWorkFixture } from "../tests/helpers/journey-archived-work-fixture";
import { applyRenderedTheme } from "./theme-fixture";
import { axeInPage } from "./axe-in-page";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block" });
let f: Awaited<ReturnType<typeof journeyArchivedWorkFixture>>;
const token = randomUUID();
const people = (page: Page) => page.getByRole("region", { name: "Journey people", exact: true });
test.beforeAll(async () => {
  f = await journeyArchivedWorkFixture();
  await prisma.session.create({ data: { userId: f.userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000) } });
});
test.afterAll(async () => { await f?.cleanup(); });
test.beforeEach(async ({ page, context }) => {
  await context.addCookies([{ name: "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, sameSite: "Strict" }]);
  await page.goto("/journey", { waitUntil: "networkidle" });
});
async function showMixes(page: Page, view: "List" | "Map") {
  const panes = page.getByRole("navigation", { name: "Journey workspace panels", exact: true });
  if (await panes.isVisible()) await panes.getByRole("button", { name: "Mixes", exact: true }).click();
  await page.getByRole("button", { name: view, exact: true }).click();
}
function mixRow(page: Page, id: string, view: "List" | "Map") {
  return view === "List" ? page.locator("article").filter({ has: page.locator(`[data-list-mix="${id}"]`) }) : page.locator(`[data-workflow-node="${id}"]`);
}
for (const view of ["List", "Map"] as const) test(`${view}: archived mark, exact count and one keyboard/touch action open its people`, async ({ page, isMobile }) => {
  // The action must remain useful after a previous search excluded everybody.
  const panes = page.getByRole("navigation", { name: "Journey workspace panels", exact: true });
  if (await panes.isVisible()) await panes.getByRole("button", { name: "People", exact: true }).click();
  await people(page).getByRole("searchbox", { name: "Find a person" }).fill("Missing fixture");
  await people(page).getByRole("button", { name: "Search", exact: true }).click();
  await expect(people(page).locator("article")).toHaveCount(0);
  await showMixes(page, view);
  const row = mixRow(page, f.pending.id, view);
  await expect(row.locator('[data-mix-status="ARCHIVED"]')).toHaveText("Archived");
  await expect(row.getByText("3 pending follow-ups", { exact: true })).toBeVisible();
  const action = row.getByRole("button", { name: /3 pending follow-ups\. View people$/ });
  await expect(action).toHaveCount(1);
  await expect(mixRow(page, f.empty.id, view).locator('[data-mix-status="ARCHIVED"]')).toHaveText("Archived");
  await expect(mixRow(page, f.empty.id, view).getByRole("button", { name: /\. View people$/ })).toHaveCount(0);
  await expect(mixRow(page, f.active.id, view).getByRole("button", { name: /1 people here, 1 total/ })).toHaveCount(1);
  await expect(mixRow(page, f.foreignMix.id, view)).toHaveCount(0);
  if (isMobile) await action.tap();
  else {
    await row.locator(view === "List" ? "[data-list-mix]" : "button[aria-pressed]").focus();
    await page.keyboard.press("Tab"); await expect(action).toBeFocused();
    await expect(action).toHaveCSS("outline-width", "3px");
    await page.keyboard.press("Enter");
  }
  await expect(people(page)).toBeVisible();
  await expect(people(page).getByRole("heading", { name: /Archived estimates/ })).toBeFocused();
  await expect(people(page).locator("article")).toHaveCount(2);
  await expect(people(page).getByText("Alex Fixture", { exact: true })).toBeVisible();
  await expect(people(page).getByText("Blair Fixture", { exact: true })).toBeVisible();
  await expect(people(page).getByText("Next action", { exact: true })).toHaveCount(2);
  expect((await prisma.mix.findUniqueOrThrow({ where: { id: f.pending.id } })).status).toBe("ARCHIVED");
});

test("both views keep contrast, targets and text at all widths in both themes", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const measurements: unknown[] = [];
  for (const theme of ["light", "dark"] as const) for (const width of [320, 390, 768, 1200, 1440]) for (const large of [false, true]) {
    await applyRenderedTheme(page, theme, { width, height: 1000 });
    const textSize = await page.addStyleTag({ content: `html { font-size: ${large ? 200 : 100}% !important; }` });
    for (const view of ["List", "Map"] as const) {
      await showMixes(page, view);
      const row = mixRow(page, f.pending.id, view), action = row.getByRole("button", { name: /3 pending follow-ups\. View people$/ });
      await action.scrollIntoViewIfNeeded();
      await expect(row.getByText("3 pending follow-ups", { exact: true })).toBeVisible();
      const box = (await action.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect(await action.evaluate(el => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1)).toBe(true);
      await row.locator(view === "List" ? "[data-list-mix]" : "button[aria-pressed]").focus();
      await page.keyboard.press("Tab"); await expect(action).toBeFocused();
      await expect(action).toHaveCSS("outline-width", "3px");
      const selector = view === "Map" ? `[data-workflow-node="${f.pending.id}"]` : `article:has([data-list-mix="${f.pending.id}"])`;
      const audit = await axeInPage(page).include(selector).withRules(["color-contrast"]).analyze();
      expect(audit.violations).toEqual([]);
      measurements.push({ theme, width, textPercent: large ? 200 : 100, view, target: box, contrast: audit.passes.flatMap(rule => rule.nodes.flatMap(node => node.any.map(check => check.data))) });
      if (process.env.M4S5_SCREENSHOTS) {
        mkdirSync(process.env.M4S5_SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: `${process.env.M4S5_SCREENSHOTS}/${testInfo.project.name}-${theme}-${width}-${large ? 200 : 100}-${view}.png`, fullPage: true });
      }
    }
    await textSize.evaluate(el => el.parentNode?.removeChild(el));
  }
  if (process.env.M4S5_SCREENSHOTS) writeFileSync(`${process.env.M4S5_SCREENSHOTS}/${testInfo.project.name}-measurements.json`, JSON.stringify(measurements, null, 2));
});
