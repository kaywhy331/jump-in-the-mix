import { createHash, randomUUID } from "node:crypto";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { enableJourney, recordJourneyEvent } from "../src/lib/journey";
import { axeInPage } from "./axe-in-page";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block" });
test.setTimeout(180_000);
let workspaceId: string, userId: string, contactId: string;
let stages: Awaited<ReturnType<typeof prisma.journeyStage.findMany>>;
const token = randomUUID();
test.beforeAll(async () => {
  const suffix = randomUUID();
  userId = (await prisma.user.create({ data: { email: `journey-rules-${suffix}@example.com`, name: "Journey rules fixture", passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Journey rules fixture", slug: `journey-rules-${suffix}`, members: { create: { userId } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  await enableJourney(workspaceId);
  stages = await prisma.journeyStage.findMany({ where: { workspaceId }, orderBy: { position: "asc" } });
  const names = ["Inquiry", "Qualified", "Customer", "Repeat customer"];
  for (const [index, stage] of stages.entries()) await prisma.journeyStage.update({ where: { id: stage.id }, data: { name: names[index] } });
  const plan = await prisma.mix.create({ data: { workspaceId, name: "Discovery follow-up", status: "ACTIVE", triggerMode: "MANUAL_START" } });
  await prisma.journeyStage.update({ where: { id: stages[1].id }, data: { planId: plan.id } });
  contactId = (await prisma.contact.create({ data: { workspaceId, displayName: "Jordan Journey" } })).id;
  await recordJourneyEvent({ workspaceId, contactId, eventType: "MANUAL", eventKey: suffix, targetStageId: stages[0].id, source: "Local fixture" });
});
test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
  page.setDefaultTimeout(30_000);
  await prisma.journeyPreference.update({ where: { workspaceId }, data: { enabled: true } });
  await prisma.contactJourney.update({ where: { contactId }, data: { automatic: true } });
  await prisma.journeyRule.updateMany({ where: { fromStageId: stages[0].id, eventType: "CONVERSATION_STARTED" }, data: { toStageId: stages[1].id } });
  await prisma.journeyRule.deleteMany({ where: { workspaceId, eventType: "TIME_IN_STAGE" } });
});
test.afterAll(async () => { if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } }); if (userId) await prisma.user.deleteMany({ where: { id: userId } }); });
async function visit(page: Page, path = "/settings/journey") {
  await page.goto(path);
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "", { timeout: 60_000 });
}
async function open(summary: Locator) { if (!await summary.evaluate(element => element.parentElement?.hasAttribute("open"))) { await summary.focus(); await summary.press("Enter"); } }
async function editor(page: Page) {
  const stage = page.locator(`#stage-${stages[0].id}`);
  await open(stage.locator(":scope > summary"));
  await open(stage.getByText("Add or change a rule", { exact: true }));
  return stage.getByRole("form", { name: "Add or change a rule for Inquiry", exact: true });
}
async function save(form: Locator) { await form.getByRole("button", { name: /^Save rule/ }).click(); }

test("saved stages and existing rules explain their actual effect before editing", async ({ page }) => {
  await visit(page);
  await expect(page.locator(".journey-saved-stages")).toHaveText("Inquiry → Qualified → Customer → Repeat customer");
  await expect(page.getByText("They can skip stages or return to an earlier one", { exact: false })).toBeVisible();
  const form = await editor(page);
  await expect(form.getByRole("combobox", { name: "Move to", exact: true })).toHaveValue(stages[1].id);
  await expect(form.locator(".journey-rule-preview")).toContainText("Discovery follow-up");
  await form.getByRole("combobox", { name: "Move to", exact: true }).selectOption(stages[3].id);
  await expect(form.locator(".journey-rule-preview")).toContainText("No automatic mix starts on entry");
  await save(form);
  await expect(page.getByText("Journey settings saved.", { exact: true })).toBeVisible();
  await expect(page.locator(`#stage-${stages[0].id}`)).toHaveAttribute("open", "");
  const current = await prisma.contactJourney.findUniqueOrThrow({ where: { contactId } });
  expect(current.stageId).toBe(stages[0].id);
  const refreshed = await editor(page);
  await expect(refreshed.getByRole("combobox", { name: "Move to", exact: true })).toHaveValue(stages[3].id);
  await refreshed.getByRole("combobox", { name: "Move to", exact: true }).selectOption(stages[1].id);
  await save(refreshed);
  await expect(page.locator(".notice.error")).toHaveCount(0);
  await expect.poll(async () => (await prisma.journeyRule.findUniqueOrThrow({ where: { fromStageId_eventType: { fromStageId: stages[0].id, eventType: "CONVERSATION_STARTED" } } })).toStageId).toBe(stages[1].id);
});

test("a stale save keeps the draft and offers an explicit review of the newer rule", async ({ page }) => {
  await visit(page); const form = await editor(page);
  await form.getByRole("combobox", { name: "Move to", exact: true }).selectOption(stages[3].id);
  await prisma.journeyRule.updateMany({ where: { fromStageId: stages[0].id, eventType: "CONVERSATION_STARTED" }, data: { toStageId: stages[2].id } });
  await save(form);
  await expect(form.getByRole("alert")).toContainText("changed in another tab");
  await expect(form.getByRole("combobox", { name: "Move to", exact: true })).toHaveValue(stages[3].id);
  await expect(form.locator(".journey-rule-conflict")).toContainText("Customer");
  await expect(form.getByRole("button", { name: /^Save rule/ })).toBeDisabled();
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await form.getByRole("button", { name: "Load latest rule", exact: true }).click();
  await expect(form.getByRole("combobox", { name: "Move to", exact: true })).toHaveValue(stages[2].id);
  await expect(form.getByRole("alert")).toHaveCount(0);
  await form.getByRole("combobox", { name: "Move to", exact: true }).selectOption(stages[3].id);
  await save(form);
  await expect(page.getByText("Journey settings saved.", { exact: true })).toBeVisible();
  expect((await prisma.journeyRule.findUniqueOrThrow({ where: { fromStageId_eventType: { fromStageId: stages[0].id, eventType: "CONVERSATION_STARTED" } } })).toStageId).toBe(stages[3].id);
});

test("Edit rule opens the selected saved rule with its current destination", async ({ page }) => {
  await visit(page);
  const stage = page.locator(`#stage-${stages[0].id}`);
  await open(stage.locator(":scope > summary"));
  await open(stage.getByLabel("Edit rule: A conversation starts to Qualified", { exact: true }));
  const form = stage.getByRole("form", { name: "Edit A conversation starts rule", exact: true });
  await expect(form.getByRole("combobox", { name: "Move to", exact: true })).toHaveValue(stages[1].id);
  await form.getByRole("combobox", { name: "Move to", exact: true }).selectOption(stages[3].id);
  await save(form);
  await expect(page.getByText("Journey settings saved.", { exact: true })).toBeVisible();
  expect((await prisma.journeyRule.findUniqueOrThrow({ where: { fromStageId_eventType: { fromStageId: stages[0].id, eventType: "CONVERSATION_STARTED" } } })).toStageId).toBe(stages[3].id);
});

test("timing errors preserve entries and changing triggers preserves each draft", async ({ page }) => {
  await visit(page); const form = await editor(page);
  await form.getByRole("combobox", { name: "When", exact: true }).selectOption("TIME_IN_STAGE");
  await form.getByLabel("Days in this stage").fill("12");
  await form.getByRole("combobox", { name: "Move to", exact: true }).selectOption(stages[3].id);
  await expect(form.locator(".journey-rule-preview")).toContainText("After 12 days in this stage → Repeat customer");
  await form.getByRole("combobox", { name: "When", exact: true }).selectOption("SALE_CONFIRMED");
  await expect(form.getByRole("combobox", { name: "Move to", exact: true })).toHaveValue(stages[2].id);
  await form.getByRole("combobox", { name: "When", exact: true }).selectOption("TIME_IN_STAGE");
  await expect(form.getByLabel("Days in this stage")).toHaveValue("12");
  await expect(form.getByRole("combobox", { name: "Move to", exact: true })).toHaveValue(stages[3].id);
  // Bypass native validation to exercise the server's input-preserving error.
  await form.evaluate(element => element.setAttribute("novalidate", ""));
  await form.getByLabel("Days in this stage").fill("0"); await save(form);
  await expect(form.getByRole("alert")).toContainText("3,650 days");
  await expect(form.getByLabel("Days in this stage")).toHaveValue("0");
  await expect(form.getByRole("combobox", { name: "Move to", exact: true })).toHaveValue(stages[3].id);
  await form.getByLabel("Days in this stage").fill("12"); await save(form);
  await expect(page.getByText("Journey settings saved.", { exact: true })).toBeVisible();
  await expect(page.locator(`#stage-${stages[0].id}`)).toContainText("After 12 days in this stage → Repeat customer");
});

test("a lost save response preserves the draft and checks the committed rule before a retry", async ({ page }) => {
  await visit(page); const form = await editor(page);
  await form.getByRole("combobox", { name: "Move to", exact: true }).selectOption(stages[3].id);
  let lost = false;
  await page.route("**/settings/journey*", async route => {
    if (route.request().method() !== "POST" || lost) return route.continue();
    lost = true;
    await route.fetch(); // The server commits; only its response is lost.
    await route.abort("failed");
  });
  await save(form);
  await expect(form.getByRole("alert")).toContainText("couldn’t confirm this save");
  await expect(form.getByRole("combobox", { name: "Move to", exact: true })).toHaveValue(stages[3].id);
  expect((await prisma.journeyRule.findUniqueOrThrow({ where: { fromStageId_eventType: { fromStageId: stages[0].id, eventType: "CONVERSATION_STARTED" } } })).toStageId).toBe(stages[3].id);
  await page.unroute("**/settings/journey*");
  await save(form);
  await expect(form.getByRole("alert")).toContainText("changed in another tab");
  await form.getByRole("button", { name: "Load latest rule", exact: true }).click();
  await expect(form.getByRole("combobox", { name: "Move to", exact: true })).toHaveValue(stages[3].id);
});

test("contact rules distinguish business pauses, individual pauses and milestone destinations", async ({ page }) => {
  await visit(page, `/contacts/${contactId}`);
  const panel = page.locator(".contact-journey-panel");
  await expect(panel.getByRole("list", { name: "Automatic transition rules" })).toContainText("A sale is confirmed → Customer");
  await expect(panel.getByRole("button", { name: "Record a sale", exact: true })).toHaveAccessibleDescription("Moves to Customer");
  await prisma.journeyPreference.update({ where: { workspaceId }, data: { enabled: false } }); await visit(page, `/contacts/${contactId}`);
  await expect(panel).toContainText("paused for your business");
  await expect(panel.getByRole("link", { name: "Review journey settings" })).toBeVisible();
  await prisma.journeyPreference.update({ where: { workspaceId }, data: { enabled: true } });
  await prisma.contactJourney.update({ where: { contactId }, data: { automatic: false } }); await visit(page, `/contacts/${contactId}`);
  await expect(panel).toContainText("paused for this person");
  await open(panel.getByText("Stage and automation", { exact: true }));
  await expect(panel.getByRole("button", { name: "Resume transitions for this person", exact: true })).toBeVisible();
  await expect(panel).toContainText("keeps this person’s current mixes running");
});

test("expanded rule editing remains accessible across widths, themes and keyboard input", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await visit(page); const form = await editor(page);
  await form.getByRole("combobox", { name: "When", exact: true }).selectOption("TIME_IN_STAGE");
  await form.getByRole("combobox", { name: "Move to", exact: true }).selectOption(stages[3].id);
  for (const colorScheme of ["light", "dark"] as const) for (const width of [320, 390, 768, 1440]) {
    await test.step(`${colorScheme} at ${width}px`, async () => {
    await page.emulateMedia({ colorScheme }); await page.setViewportSize({ width, height: 900 });
    await page.evaluate(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); const transitions = document.getAnimations().filter(animation => "transitionProperty" in animation && animation.playState === "running");
      await Promise.all(transitions.map(animation => Promise.race([animation.finished.catch(() => undefined), new Promise<void>(resolve => setTimeout(resolve, 500))]))); });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const violations = (await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations;
    expect(violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })), `${colorScheme} ${width}`).toEqual([]);
    for (const control of await form.locator("select, input:not([type=hidden]), button").all()) {
      const box = await control.boundingBox(); if (box) { expect(box.height).toBeGreaterThanOrEqual(44); expect(box.width).toBeGreaterThanOrEqual(44); }
    }
    });
  }
  expect(errors).toEqual([]);
});
