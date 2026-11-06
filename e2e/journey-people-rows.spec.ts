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
let workspaceId: string, userId: string, contactId: string;
const token = randomUUID(), at = "2026-11-01T09:30:00Z";
const roster = (page: Page) => page.getByRole("region", { name: "Journey people", exact: true });
test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `people-${randomUUID()}@example.test`, name: "Roster owner", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Roster fixture", slug: randomUUID(), members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "America/Los_Angeles", locale: "en-US" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000) } });
  const stage = await prisma.journeyStage.create({ data: { workspaceId, name: "Estimate requested", position: 0 } });
  contactId = (await prisma.contact.create({ data: { workspaceId, displayName: "Alex Fixture", journey: { create: { workspaceId, stageId: stage.id } } } })).id;
  const mix = await prisma.mix.create({ data: { workspaceId, name: "Estimate follow-through", status: "ACTIVE", triggerMode: "MANUAL_START" } });
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
test("Stage, Current Mix, Status and all Next actions are visible without hover; touch and keyboard open actions", async ({ page, isMobile }) => {
  await people(page);
  const row = roster(page).locator("article");
  await expect(row).toHaveCount(1);
  for (const text of ["Stage", "Estimate requested", "Status", "Next action", "Kitchen estimate", "Nov 3, 9:00 AM"]) await expect(row.getByText(text, { exact: true })).toBeVisible();
  await expect(row).toContainText(/Current Mix: A\d+ · Estimate follow-through/);
  await expect(row.getByText("Roof estimate", { exact: true })).toBeVisible();
  await expect(row.getByRole("link", { name: "Record outcome", exact: true })).toHaveCount(1);
  await expect(row.getByRole("link", { name: "Review work", exact: true })).toHaveCount(1);
  await expect(row.locator("button a, span[data-status]")).toHaveCount(0);
  const action = row.getByRole("link", { name: "Record outcome", exact: true }).first();
  if (isMobile) await action.tap();
  else {
    await row.getByRole("button", { name: "View Alex Fixture's journey", exact: true }).focus();
    await page.keyboard.press("Tab"); await expect(row.getByRole("link", { name: "Open Alex Fixture's contact" })).toBeFocused();
    await page.keyboard.press("Tab"); await expect(action).toBeFocused();
    await page.keyboard.press("Enter");
  }
  await expect(page).toHaveURL(new RegExp(`/journey\\?contactId=${contactId}&work=`));
});
test("both themes and the width/text matrix retain readable text, contrast, focus and 44px targets", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const measurements: unknown[] = [];
  for (const theme of ["light", "dark"] as const) for (const width of [320, 390, 768, 1200, 1440]) for (const large of [false, true]) {
    await applyRenderedTheme(page, theme, { width, height: 1000 }); await people(page);
    const textSize = await page.addStyleTag({ content: `html { font-size: ${large ? 200 : 100}% !important; }` });
    const row = roster(page).locator("article");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const bounds = (await row.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
    for (const control of await row.locator("button, a").all()) {
      const box = (await control.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    }
    const action = row.getByRole("link", { name: "Record outcome", exact: true }).first();
    await page.keyboard.press("Tab"); await action.focus(); await expect(action).toBeFocused();
    expect(await action.evaluate(el => parseFloat(getComputedStyle(el).outlineWidth))).toBeGreaterThanOrEqual(3);
    const audit = await axeInPage(page).include('[aria-label="Journey people"]').withRules(["color-contrast"]).analyze();
    expect(audit.violations).toEqual([]);
    measurements.push({ theme, width, textPercent: large ? 200 : 100, contrast: audit.passes.flatMap(rule => rule.nodes.flatMap(node => node.any.map(check => check.data))) });
    const clipping = await row.locator("dt:not(.sr-only), dd, li > span").evaluateAll(elements => elements.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent));
    expect(clipping).toEqual([]);
    if (process.env.M4S1_SCREENSHOTS) {
      mkdirSync(process.env.M4S1_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: `${process.env.M4S1_SCREENSHOTS}/${testInfo.project.name}-${theme}-${width}-${large ? 200 : 100}.png`, fullPage: true });
    }
    await textSize.evaluate(el => el.parentNode?.removeChild(el));
  }
  if (process.env.M4S1_SCREENSHOTS) writeFileSync(`${process.env.M4S1_SCREENSHOTS}/${testInfo.project.name}-measurements.json`, JSON.stringify(measurements, null, 2));
});
