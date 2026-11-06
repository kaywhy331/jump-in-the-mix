import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { workflowJson } from "../src/lib/mix-workflow";
import { journeyPersonFocusFixture } from "../tests/helpers/journey-person-focus-fixture";
import { applyRenderedTheme } from "./theme-fixture";
import { axeInPage } from "./axe-in-page";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block" });
let f: Awaited<ReturnType<typeof journeyPersonFocusFixture>>;
const token = randomUUID();
const panes = (page: Page) => page.getByRole("navigation", { name: "Journey workspace panels", exact: true });
const view = (page: Page, name: string) => page.getByRole("group", { name: "Show the journey as" }).getByRole("button", { name, exact: true });
const canvas = (page: Page) => page.getByRole("region", { name: /^Scrollable journey diagram/ });
const node = (page: Page, name: string) => page.locator(`[data-workflow-node="${f.mixes[name]}"]`);
const row = (page: Page, name: string) => page.locator(`[data-list-mix="${f.mixes[name]}"]`);
async function pane(page: Page, name: string) { if (await panes(page).isVisible()) await panes(page).getByRole("button", { name, exact: true }).click(); }
async function revealed(page: Page) {
  return canvas(page).evaluate((el, id) => {
    const box = el.querySelector(`[data-workflow-node="${id}"]`)!.getBoundingClientRect(), frame = el.getBoundingClientRect();
    return box.top >= frame.top && box.left >= frame.left && box.top < frame.bottom && box.left < frame.right;
  }, f.mixes["Current work"]);
}
test.beforeAll(async () => {
  f = await journeyPersonFocusFixture();
  await prisma.session.create({ data: { userId: f.userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000) } });
});
test.afterAll(async () => { await f?.cleanup(); });
test.beforeEach(async ({ context }) => { await context.addCookies([{ name: "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, sameSite: "Strict" }]); });

test("choosing a person marks starts and work, reveals real paths, and preserves panning on refresh", async ({ page, isMobile }) => {
  await page.goto("/journey", { waitUntil: "networkidle" }); await pane(page, "People");
  const choose = page.getByRole("button", { name: "View Pia Fixture's journey", exact: true });
  if (isMobile) await choose.tap(); else { await choose.focus(); await page.keyboard.press("Enter"); }
  await view(page, "Map").click();
  for (const name of ["Personal start", "Past work", "Current work", "Other work"]) await expect(node(page, name)).toHaveAttribute("data-person-here", "true");
  for (const name of ["Earlier unrelated", "Follow-up only", "Inactive start", "Foreign start"]) await expect(node(page, name)).toHaveAttribute("data-subdued", "true");
  await expect(page.locator('[data-workflow-path="taken-route"]')).toHaveAttribute("data-person-path", "true");
  await expect(page.locator('[data-workflow-path="membership-only-route"]')).toHaveAttribute("data-subdued", "true");
  await expect(page.locator('[data-workflow-edge-label="unrelated-route"]')).toHaveAttribute("data-subdued", "true");
  await expect.poll(() => revealed(page)).toBe(true);
  await canvas(page).evaluate(el => el.scrollTo(0, 0));
  await Promise.all([page.waitForResponse(response => response.url().includes("/api/mix-workflow?")), page.evaluate(() => window.dispatchEvent(new Event("jitm:workflow-updated")))]);
  expect(await canvas(page).evaluate(el => el.scrollTop)).toBe(0);
  await page.locator("#journey-map-pane").getByRole("button", { name: "All people", exact: true }).click();
  await expect(page.locator('[data-workflow-node][data-subdued="true"]')).toHaveCount(0);
  await expect(page.locator('[data-workflow-path][data-person-path="true"]')).toHaveCount(0);
});

test("a phone deep link reveals the person's row every time Mixes returns from Details (JRN-02)", async ({ page, isMobile }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/journey?contactId=${f.contactId}&work=${f.work.id}`, { waitUntil: "networkidle" });
  await expect(panes(page).getByRole("button", { name: "Details", exact: true })).toHaveAttribute("aria-pressed", "true");
  for (let visit = 0; visit < 2; visit++) {
    const mixes = panes(page).getByRole("button", { name: "Mixes", exact: true });
    if (isMobile) await mixes.tap(); else { await mixes.focus(); await page.keyboard.press("Space"); }
    await expect(row(page, "Current work")).toBeInViewport();
    await expect(row(page, "Personal start")).toContainText("Pia Fixture is here");
    await expect(row(page, "Follow-up only")).not.toContainText("Pia Fixture is here");
    await pane(page, "Details");
  }
});

test("a changed account route is subdued until its matching saved map is shown", async ({ page }) => {
  const rules = structuredClone(f.rules); rules[0].routes[0].target = { mixId: f.mixes["Retargeted work"], stepId: null };
  await prisma.mixWorkflow.update({ where: { workspaceId: f.workspaceId }, data: { revision: 2, configuration: workflowJson({ rules, gatedStepIds: f.saved.gatedStepIds, intentionalEnds: f.saved.intentionalEnds }) } });
  try {
    await page.goto(`/journey?contactId=${f.contactId}&work=${f.work.id}`, { waitUntil: "networkidle" }); await pane(page, "Mixes"); await view(page, "Map").click();
    await expect(page.locator('[data-workflow-path="taken-route"]')).toHaveAttribute("data-subdued", "true");
    await page.getByLabel("Show its saved map", { exact: true }).check();
    await expect(page.locator('[data-workflow-path="taken-route"]')).toHaveAttribute("data-person-path", "true");
  } finally { await prisma.mixWorkflow.update({ where: { workspaceId: f.workspaceId }, data: { revision: 1, configuration: workflowJson({ rules: f.rules, gatedStepIds: f.saved.gatedStepIds, intentionalEnds: f.saved.intentionalEnds }) } }); }
});

test("person focus stays readable in both themes and the width/text matrix", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  await page.goto(`/journey?contactId=${f.contactId}`, { waitUntil: "networkidle" });
  const measurements: unknown[] = [];
  for (const theme of ["light", "dark"] as const) for (const width of [320, 390, 768, 1200, 1440]) for (const large of [false, true]) {
    await applyRenderedTheme(page, theme, { width, height: 1000 }); await pane(page, "Mixes");
    const textSize = await page.addStyleTag({ content: `html { font-size: ${large ? 200 : 100}% !important; }` });
    for (const display of ["List", "Map"]) {
      await view(page, display).click();
      const selected = display === "List" ? row(page, "Personal start") : node(page, "Personal start").locator("button").first();
      const muted = display === "List" ? row(page, "Follow-up only") : node(page, "Follow-up only").locator("button").first();
      const targets = [];
      for (const control of [selected, muted]) {
        const box = (await control.boundingBox())!; targets.push({ width: box.width, height: box.height });
        expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
        await control.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab"); await expect(control).toBeFocused();
        expect(await control.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe("none");
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const audit = await axeInPage(page).include('[data-person-here], [data-subdued="true"]').withRules(["color-contrast"]).analyze();
      expect(audit.violations).toEqual([]);
      const lines = display === "Map" ? await canvas(page).evaluate(element => {
        const luminance = (color: string) => (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
        let surface: Element | null = element;
        while (surface?.parentElement && getComputedStyle(surface).backgroundColor === "rgba(0, 0, 0, 0)") surface = surface.parentElement;
        const background = luminance(getComputedStyle(surface!).backgroundColor);
        return [...element.querySelectorAll("[data-workflow-path] > path:not([class])")].map(path => {
          const ink = luminance(getComputedStyle(path).stroke);
          return { path: path.parentElement?.getAttribute("data-workflow-path"), ratio: (Math.max(ink, background) + .05) / (Math.min(ink, background) + .05) };
        });
      }) : [];
      for (const line of lines) expect(line.ratio, line.path ?? "Graph line").toBeGreaterThanOrEqual(3);
      measurements.push({ theme, width, textPercent: large ? 200 : 100, display, targets, lines, contrast: audit.passes.flatMap(rule => rule.nodes.flatMap(n => n.any.map(check => check.data))) });
      if (process.env.M4S3_SCREENSHOTS) {
        mkdirSync(process.env.M4S3_SCREENSHOTS, { recursive: true });
        await selected.scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${process.env.M4S3_SCREENSHOTS}/${testInfo.project.name}-${theme}-${width}-${large ? 200 : 100}-${display}.png`, fullPage: true });
      }
    }
    await textSize.evaluate(el => el.parentNode?.removeChild(el));
  }
  if (process.env.M4S3_SCREENSHOTS) writeFileSync(`${process.env.M4S3_SCREENSHOTS}/${testInfo.project.name}-measurements.json`, JSON.stringify(measurements, null, 2));
});
