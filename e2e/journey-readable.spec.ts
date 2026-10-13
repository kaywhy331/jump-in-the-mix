import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { processWorkflowInstance, saveWorkflowConfiguration, startWorkflowInstance } from "../src/lib/mix-workflow";
import { emptyWorkflow, type WorkflowRule } from "../src/lib/mix-workflow-types";

// Journey opens readable (JITM-07 §2.20, D75): from 768px the map opens at 100%, scrolled to the first numbered Mix,
// and Fit map is the overview; on phones Journey opens in its list view, with the map one tap away.
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block" });
test.setTimeout(120_000);
let workspaceId: string, userId: string, firstMixId: string, mixIds: Record<string, string>;
const token = randomUUID();
test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `journey-readable-${randomUUID()}@example.invalid`, name: "Journey owner", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Journey fixture", slug: randomUUID(), members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  // Mixes load in name order and are numbered in the order they were made, so "Mike", made first, is A1 and sits in the
  // middle of the map's first column, below the fold. Oscar → Papa → Quebec adds two more columns, so the map is wider
  // than the frame and 100% differs from a fit.
  const base = Date.now() - 3_600_000, ids: Record<string, string> = {};
  for (const [index, name] of ["Mike", "Alpha", "Bravo", "Charlie", "Oscar", "Papa", "Quebec"].entries()) {
    const mix = await prisma.mix.create({ data: { workspaceId, name: `${name} follow-up`, status: "ACTIVE", triggerMode: "MANUAL_START", createdAt: new Date(base + index * 60_000) } });
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name: `${name} follow-up call`, channel: "PHONE_CALL", versions: { create: { version: 1, body: "A private fixture with no recipient or delivery." } } }, include: { versions: true } });
    await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: template.versions[0].id, dayOffset: 0, sortOrder: 0 } });
    ids[name] = mix.id;
  }
  firstMixId = ids.Mike; mixIds = ids;
  const next = (from: string, to: string): WorkflowRule => ({ id: randomUUID(), name: `Continue to ${to}`, source: { mixId: ids[from], stepId: null }, mode: "PARALLEL", enabled: true, join: null, routes: [{ id: randomUUID(), label: "After completion", when: "FINISHED", outcome: "", delayMinutes: 0, target: { mixId: ids[to], stepId: null }, maxVisits: null, replace: false }] });
  await prisma.$transaction(db => saveWorkflowConfiguration(db, workspaceId, { ...emptyWorkflow(), rules: [next("Oscar", "Papa"), next("Papa", "Quebec")] }, 0, userId));
});
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, sameSite: "Strict" }]);
});
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});
const canvas = (page: Page) => page.getByRole("region", { name: /^Scrollable journey diagram/ });
const showAs = (page: Page, name: "Map" | "List") => page.getByRole("group", { name: "Show the journey as" }).getByRole("button", { name, exact: true });
const firstRow = (page: Page) => page.getByRole("button", { name: /^Mix A1\s*Mike follow-up/ });
/** The first numbered Mix's card starts inside the map's scrolled view and on screen, above a phone's tab bar. */
async function firstMixInView(page: Page) { return mixInView(page, firstMixId); }
/** A Mix's card starts inside the map's scrolled view and on screen, above a phone's tab bar. */
async function mixInView(page: Page, mixId: string) {
  return canvas(page).evaluate((element, id) => {
    const node = element.querySelector(`[data-workflow-node="${id}"]`);
    if (!node) return "missing";
    const view = element.getBoundingClientRect(), box = node.getBoundingClientRect();
    const tabBar = document.querySelector(".mobile-nav")?.getBoundingClientRect(), bottom = Math.min(view.bottom, innerHeight, tabBar && tabBar.height ? tabBar.top : innerHeight);
    return box.top >= Math.max(view.top, 0) && box.left >= view.left && box.top + 40 <= bottom && box.left < view.right ? "in view" : `out of view ${JSON.stringify([view.top, bottom, box.top])}`;
  }, mixId);
}

test("from 768px the map opens at 100%, scrolled to the first numbered Mix, and Fit map is the overview", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/journey", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Reset zoom to 100%", exact: true })).toHaveText("100%");
  await expect(canvas(page).locator(`[data-workflow-node="${firstMixId}"]`)).toContainText("A1");
  // Scrolled to A1, in the middle of its column, not to the end of the map.
  await expect.poll(() => canvas(page).evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect(await canvas(page).evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeGreaterThan(40);
  expect(await firstMixInView(page)).toBe("in view");
  await expect(showAs(page, "Map")).toHaveAttribute("aria-pressed", "true");
  // At 100% the line labels show, so the legend asks for a closer zoom only in the overview.
  const legend = page.getByLabel("Connection colors");
  await expect(legend).not.toContainText("Zoom in for line labels");
  await page.getByRole("button", { name: "Fit map", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reset zoom to 100%", exact: true })).not.toHaveText("100%");
  await expect(legend).toContainText("Zoom in for line labels.");
  // The list is one tap away, in journey order.
  await showAs(page, "List").click();
  await expect(canvas(page)).toHaveCount(0);
  await expect(firstRow(page)).toBeVisible();
});

test("on a phone Journey opens in its list view, with people counts, and the map one tap away at 100%", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/journey", { waitUntil: "networkidle" });
  await expect(firstRow(page)).toBeVisible();
  await expect(canvas(page)).toHaveCount(0);
  await expect(showAs(page, "List")).toHaveAttribute("aria-pressed", "true");
  const people = page.getByRole("button", { name: "Mike follow-up: 0 people here, 0 total", exact: true });
  await expect(people).toBeVisible();
  // The count is its own 44px target, 8px below the Mix's heading (JITM-10 §2.1).
  const [row, count] = [(await firstRow(page).boundingBox())!, (await people.boundingBox())!];
  expect(count.height).toBeGreaterThanOrEqual(44); expect(count.y - row.y - row.height).toBeGreaterThanOrEqual(8);
  await showAs(page, "Map").click();
  await expect(canvas(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset zoom to 100%", exact: true })).toHaveText("100%");
  await expect.poll(() => firstMixInView(page)).toBe("in view");
});

test("choosing a Mix in the list shows its details, by touch and by keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/journey", { waitUntil: "networkidle" });
  // The view switches by keyboard as well.
  await showAs(page, "Map").focus(); await page.keyboard.press("Enter");
  await expect(canvas(page)).toBeVisible();
  await showAs(page, "List").focus(); await page.keyboard.press("Space");
  await expect(canvas(page)).toHaveCount(0);
  await firstRow(page).focus(); await page.keyboard.press("Enter");
  const details = page.getByRole("complementary", { name: "Journey details" });
  await expect(details.getByRole("heading", { name: "Details", exact: true })).toBeFocused();
  await expect(details.getByRole("heading", { name: /Mike follow-up/ })).toBeVisible();
  await page.getByRole("navigation", { name: "Journey workspace panels" }).getByRole("button", { name: "Mixes", exact: true }).click();
  await expect(firstRow(page)).toHaveAttribute("aria-pressed", "true");
});

test("a tablet that opens on Details shows the map at 100% on the first numbered Mix", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1000 });
  await page.goto("/journey?touchpoint=quiet-days", { waitUntil: "networkidle" });
  const panels = page.getByRole("navigation", { name: "Journey workspace panels" });
  await expect(panels.getByRole("button", { name: "Details", exact: true })).toHaveAttribute("aria-pressed", "true");
  await panels.getByRole("button", { name: "Mixes", exact: true }).click();
  await expect(canvas(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset zoom to 100%", exact: true })).toHaveText("100%");
  await expect.poll(() => firstMixInView(page)).toBe("in view");
});

test("\"Needs attention\" is shown in the danger colour only above 0", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/journey", { waitUntil: "networkidle" });
  const strip = page.getByLabel("People by workflow status");
  const colour = (status: string) => strip.locator(status ? `button[data-status="${status}"] strong` : "button:not([data-status]) strong").evaluate(element => getComputedStyle(element).color);
  await expect(strip.locator('button[data-status="attention"] strong')).toHaveText("0");
  expect(await colour("attention")).toBe(await colour(""));
  // Above 0, from the page's own refresh: the count turns to the danger colour.
  await page.route("**/api/mix-workflow?*", async route => { const response = await route.fetch(); const json = await response.json(); await route.fulfill({ response, json: { ...json, analytics: { ...json.analytics, summary: { ...json.analytics.summary, attention: 2 } } } }); });
  await page.reload({ waitUntil: "networkidle" });
  await expect(strip.locator('button[data-status="attention"] strong')).toHaveText("2");
  expect(await colour("attention")).not.toBe(await colour(""));
});

test("with a person chosen, the map opens on their first active Mix from 768px, and the phone list marks their Mixes (D96)", async ({ page }) => {
  // Pia's Journey work runs in Papa, which follows Oscar in its journey (E2), right of the map's first column and below
  // the fold.
  const pia = await prisma.contact.create({ data: { workspaceId, displayName: "Pia Papa", firstName: "Pia" } });
  const instance = await startWorkflowInstance({ workspaceId, contactId: pia.id, mixId: mixIds.Papa, requestId: randomUUID() });
  await processWorkflowInstance(workspaceId, instance, new Date());
  await prisma.job.updateMany({ where: { workspaceId, completedAt: null }, data: { completedAt: new Date() } });
  await page.setViewportSize({ width: 1440, height: 900 });
  // Chosen after the map has opened on the first Mix: once their work has loaded, the map goes to it.
  await page.goto("/journey", { waitUntil: "networkidle" });
  await expect.poll(() => firstMixInView(page)).toBe("in view");
  expect(await mixInView(page, mixIds.Papa)).not.toBe("in view");
  await page.getByRole("button", { name: "View Pia Papa's journey", exact: true }).click();
  await expect.poll(() => mixInView(page, mixIds.Papa)).toBe("in view");
  // A link that names them opens there.
  await page.goto(`/journey?contactId=${pia.id}`, { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Reset zoom to 100%", exact: true })).toHaveText("100%");
  await expect.poll(() => mixInView(page, mixIds.Papa)).toBe("in view");
  // On a phone the list marks Pia's Mix, and only hers, and brings it into view.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/journey?contactId=${pia.id}`, { waitUntil: "networkidle" });
  const papa = page.getByRole("button", { name: /^Mix [A-Z]\d+\s*Papa follow-up/ });
  await expect(papa).toContainText("Pia Papa is here");
  await expect(papa).toBeInViewport();
  await expect(page.getByText("Pia Papa is here", { exact: true })).toHaveCount(1);
});
