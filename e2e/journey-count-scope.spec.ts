import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { workflowJson } from "../src/lib/mix-workflow";
import { emptyWorkflowState, type WorkflowDefinition } from "../src/lib/mix-workflow-types";
import { applyRenderedTheme } from "./theme-fixture";
import { axeInPage } from "./axe-in-page";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block" });
let workspaceId: string, userId: string, contactId: string, mixId: string, megaMixId: string;
const token = randomUUID(), at = "2026-11-01T09:30:00Z";
const roster = (page: Page) => page.getByRole("region", { name: "Journey people", exact: true });
test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `counts-${randomUUID()}@example.test`, name: "Roster owner", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Roster fixture", slug: randomUUID(), members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "America/Los_Angeles", locale: "en-US" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000) } });
  const stage = await prisma.journeyStage.create({ data: { workspaceId, name: "Estimate requested", position: 0 } });
  contactId = (await prisma.contact.create({ data: { workspaceId, displayName: "Alex Fixture", journey: { create: { workspaceId, stageId: stage.id } } } })).id;
  const mix = await prisma.mix.create({ data: { workspaceId, name: "Estimate follow-through", status: "ACTIVE", triggerMode: "MANUAL_START" } });
  mixId = mix.id;
  megaMixId = (await prisma.megaMixPipeline.create({ data: { workspaceId, name: "Estimates", members: { create: { mixId, position: 0 } } } })).id;
  const definition: WorkflowDefinition = { revision: 1, mixes: [], gatedStepIds: [], intentionalEnds: [], rules: [{ id: "decision", name: "Estimate reply", source: { mixId: mix.id, stepId: null }, enabled: true, mode: "CHOICE", join: null, routes: [{ id: "yes", label: "Yes", when: "OUTCOME", outcome: "yes", target: null, delayMinutes: 0, maxVisits: null, replace: false }] }] };
  for (const label of ["Kitchen estimate", "Roof estimate"]) {
    const state = emptyWorkflowState();
    state.runs = [{ id: "run", mixId: mix.id, status: "ACTIVE", startedAt: at, completedAt: null, parentTransitionId: null, legacy: false }];
    state.evaluations = [{ id: "answer", ruleId: "decision", runId: "run", visitId: null, occurredAt: at, outcome: null, decidedAt: null, generation: 0, status: "WAITING", joined: false }];
    if (label === "Roof estimate") state.commitments = [{ id: "callback", updateId: "update", runId: "run", dueAt: "2030-11-03T17:00:00Z", timezone: "America/Los_Angeles", source: "CUSTOMER", recordedAt: at, status: "OPEN" }];
    await prisma.mixWorkflowInstance.create({ data: { workspaceId, contactId, admissionKey: randomUUID(), label, definition: workflowJson(definition), state: workflowJson(state) } });
  }
});
test.afterAll(async () => { if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } }); if (userId) await prisma.user.delete({ where: { id: userId } }); });
test.beforeEach(async ({ page, context }) => {
  await context.addCookies([{ name: "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, sameSite: "Strict" }]);
  await page.goto("/journey", { waitUntil: "networkidle" });
});
async function people(page: Page) {
  const panes = page.getByRole("navigation", { name: "Journey workspace panels", exact: true });
  if (await panes.isVisible()) await panes.getByRole("button", { name: "People", exact: true }).click();
  await expect(roster(page)).toBeVisible();
}
async function map(page: Page) {
  const panes = page.getByRole("navigation", { name: "Journey workspace panels", exact: true });
  if (await panes.isVisible()) await panes.getByRole("button", { name: "Mixes", exact: true }).click();
}
const strip = (page: Page) => page.getByLabel("People by workflow status", { exact: true });

test("separate work and people totals stay truthful through map and roster filters", async ({ page }) => {
  await expect(strip(page).getByRole("button", { name: "1 People", exact: true })).toBeVisible();
  await expect(strip(page).getByText("Work items", { exact: true }).locator("..")).toHaveText("2Work items");
  await page.getByLabel("Show Mega-Mix", { exact: true }).selectOption(megaMixId);
  await expect(page.locator("#journey-map-pane")).toContainText("Map view: Estimates");
  await page.getByRole("button", { name: "Map options", exact: true }).click();
  await page.getByLabel("Include archived", { exact: true }).check();
  await expect(page.locator("#journey-map-pane")).toContainText("archived Mixes included");
  await page.getByLabel("Show Mega-Mix", { exact: true }).selectOption("none");
  await expect(strip(page).getByRole("button", { name: "1 People", exact: true })).toBeVisible();
  await people(page);
  await expect(roster(page).locator("article")).toHaveCount(1);
  await expect(roster(page)).toContainText("Map view: Not in a Mega-Mix");
  await expect(roster(page)).toContainText("Map options do not filter the counts or People.");
  await roster(page).getByLabel("Workflow status", { exact: true }).selectOption("waiting");
  await roster(page).getByLabel("Contact stage", { exact: true }).selectOption({ label: "Estimate requested · 1" });
  await roster(page).getByRole("searchbox", { name: "Find a person" }).fill("Alex");
  await roster(page).getByRole("button", { name: "Search", exact: true }).click();
  await expect(roster(page)).toContainText("People list: All Mixes · Waiting · Estimate requested · Name contains “Alex”");
  await expect(roster(page).locator("article")).toHaveCount(1);
  await page.goto(`/journey?mix=${mixId}`, { waitUntil: "networkidle" });
  await people(page);
  await expect(roster(page)).toContainText("People list: Estimate follow-through · All statuses");
  await map(page);
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await page.getByLabel("Period", { exact: true }).selectOption("7");
  await people(page);
  await roster(page).getByText("About these counts", { exact: true }).click();
  await expect(roster(page)).toContainText("My Mixes excludes archived Mixes and one-time follow-ups.");
  await expect(roster(page)).toContainText(/Results: work started in the last 7 days using setup version \d+ for all contacts, including archived contacts/);
});

test("count and scope text reflows in both themes with measured contrast and keyboard targets", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const measurements: unknown[] = [];
  for (const theme of ["light", "dark"] as const) for (const width of [320, 390, 768, 1200, 1440]) for (const large of [false, true]) {
    await applyRenderedTheme(page, theme, { width, height: 1000 }); await map(page);
    const size = await page.addStyleTag({ content: `html { font-size: ${large ? 200 : 100}% !important; }` });
    const total = strip(page).getByRole("button", { name: "1 People", exact: true });
    await total.focus(); await page.keyboard.press("Tab");
    await expect(strip(page).getByRole("button", { name: "0 Active", exact: true })).toBeFocused();
    const targets = [];
    for (const control of await strip(page).getByRole("button").all()) {
      const box = (await control.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
      targets.push({ width: box.width, height: box.height });
    }
    const audit = await axeInPage(page).include('[aria-label="People by workflow status"]').include('#journey-map-pane > p').withRules(["color-contrast"]).analyze();
    expect(audit.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const workLabel = strip(page).getByText("Work items", { exact: true });
    expect(await workLabel.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(13);
    expect(await page.locator('#journey-map-pane > p').evaluateAll(elements => elements.every(el => el.scrollWidth <= el.clientWidth + 1))).toBe(true);
    if (process.env.M4S2_SCREENSHOTS) {
      mkdirSync(process.env.M4S2_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: `${process.env.M4S2_SCREENSHOTS}/${testInfo.project.name}-${theme}-${width}-${large ? 200 : 100}-counts.png`, fullPage: true });
    }
    await people(page);
    const help = roster(page).getByText("About these counts", { exact: true });
    await help.focus(); await page.keyboard.press("Enter");
    await expect(roster(page).getByText(/Each separately started piece/)).toBeVisible();
    const peopleAudit = await axeInPage(page).include('[aria-label="Journey people"]').withRules(["color-contrast"]).analyze();
    expect(peopleAudit.violations).toEqual([]);
    expect(await roster(page).locator('p').evaluateAll(elements => elements.every(el => el.scrollWidth <= el.clientWidth + 1))).toBe(true);
    measurements.push({ theme, width, textPercent: large ? 200 : 100, targets, contrast: [...audit.passes, ...peopleAudit.passes].flatMap(rule => rule.nodes.flatMap(node => node.any.map(check => check.data))) });
    if (process.env.M4S2_SCREENSHOTS) await page.screenshot({ path: `${process.env.M4S2_SCREENSHOTS}/${testInfo.project.name}-${theme}-${width}-${large ? 200 : 100}-people.png`, fullPage: true });
    await help.focus(); await page.keyboard.press("Enter");
    await size.evaluate(el => el.parentNode?.removeChild(el));
  }
  if (process.env.M4S2_SCREENSHOTS) writeFileSync(`${process.env.M4S2_SCREENSHOTS}/${testInfo.project.name}-measurements.json`, JSON.stringify(measurements, null, 2));
});
