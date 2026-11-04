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
  await expect(form.locator(".journey-rule-preview")).toContainText("No automatic Mix starts on entry");
  await save(form);
  await expect(page.getByText("Contact stages saved.", { exact: true })).toBeVisible();
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
  await expect(page.getByText("Contact stages saved.", { exact: true })).toBeVisible();
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
  await expect(page.getByText("Contact stages saved.", { exact: true })).toBeVisible();
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
  await expect(page.getByText("Contact stages saved.", { exact: true })).toBeVisible();
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
  // The journey panel opens from the contact's stage chip (Contacts redesign, b4efcfc).
  const openPanel = async () => { await visit(page, `/contacts/${contactId}`); await page.getByRole("button", { name: /^Change stage:/ }).first().click(); };
  const panel = page.locator("dialog[open] .contact-journey-panel");
  await openPanel();
  await expect(panel.getByRole("list", { name: "Automatic transition rules" })).toContainText("A sale is confirmed → Customer");
  await expect(panel.getByRole("button", { name: "Record a sale", exact: true })).toHaveAccessibleDescription("Moves to Customer");
  await prisma.journeyPreference.update({ where: { workspaceId }, data: { enabled: false } }); await openPanel();
  await expect(panel).toContainText("paused for your business");
  await expect(panel.getByRole("link", { name: "Review Contact stages" })).toBeVisible();
  await prisma.journeyPreference.update({ where: { workspaceId }, data: { enabled: true } });
  await prisma.contactJourney.update({ where: { contactId }, data: { automatic: false } }); await openPanel();
  await expect(panel).toContainText("paused for this person");
  await open(panel.locator("details > summary").filter({ hasText: "Stage and automation" }));
  await expect(panel.locator("details")).toHaveAttribute("open", "");
  await expect(panel.getByRole("button", { name: "Resume transitions for this person", exact: true })).toBeVisible();
  await expect(panel).toContainText("keeps this person’s current Mixes running");
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

async function newContactSettings(page: Page) {
  await prisma.workspacePreference.upsert({ where: { workspaceId }, create: { workspaceId, newContactPlacement: "NONE" }, update: { newContactPlacement: "NONE", newContactMixId: null } });
  await visit(page, "/settings/new-contacts");
  return prisma.mix.findFirstOrThrow({ where: { workspaceId, name: "Discovery follow-up" } });
}

test("saved rules name the entry Mix and controls explain stage consequences", async ({ page }) => {
  const mix = await prisma.mix.findFirstOrThrow({ where: { workspaceId, name: "Discovery follow-up" } });
  const assignment = await prisma.mixAssignment.create({ data: { workspaceId, mixId: mix.id, contactId, assignmentKey: `stage-pause-${randomUUID()}`, startDate: new Date("2026-01-01T12:00:00Z") } });
  try {
    await visit(page);
    const pause = page.getByRole("button", { name: "Pause automatic transitions", exact: true });
    await expect(pause.locator("..")).toContainText("Existing follow-ups continue when you pause.");
    const stage = page.locator(`#stage-${stages[0].id}`);
    await open(stage.locator(":scope > summary"));
    await expect(stage.locator(".journey-rule-row > div > p").filter({ hasText: /^A conversation starts/ })).toHaveText("A conversation starts → Qualified → Entry Mix: Discovery follow-up");
    await expect(stage.locator(".journey-rule-row > div > p").filter({ hasText: /^A sale is confirmed/ })).toHaveText("A sale is confirmed → Customer → No automatic Mix on entry");
    await expect(stage.getByLabel("Follow-up Mix on entry")).toHaveAccessibleDescription("Applies when someone next enters this stage. People already here keep their current Mix.");
    await expect(stage.locator(".journey-stage-mixes")).toContainText("No Mix sets this stage.");
    await pause.click();
    await expect(page.getByRole("heading", { name: "Automatic transitions are paused", exact: true })).toBeVisible();
    expect((await prisma.mixAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).isActive).toBe(true);
    await prisma.mix.update({ where: { id: mix.id }, data: { status: "PAUSED" } });
    await visit(page);
    await open(stage.locator(":scope > summary"));
    await expect(stage.locator(".journey-rule-row > div > p").filter({ hasText: /^A conversation starts/ })).toHaveText("A conversation starts → Qualified → No automatic Mix on entry");
  } finally {
    await prisma.mix.update({ where: { id: mix.id }, data: { status: "ACTIVE" } });
    await prisma.mixAssignment.delete({ where: { id: assignment.id } });
  }
});

test("new-contact modes save with a required picker only for MIX and preserve toggled choices", async ({ page }) => {
  const mix = await newContactSettings(page);
  const picker = page.getByLabel("Mix for new contacts", { exact: true });
  const saveButton = page.getByRole("button", { name: "Save", exact: true });
  await expect(picker).toHaveCount(0);
  await page.getByRole("radio", { name: /^Add them to a Mix automatically/ }).check();
  await expect(picker).toHaveAttribute("required", "");
  await saveButton.click();
  await expect(picker).toBeFocused();
  expect(await picker.evaluate((element: HTMLSelectElement) => element.validity.valueMissing)).toBe(true);
  expect((await prisma.workspacePreference.findUniqueOrThrow({ where: { workspaceId } })).newContactPlacement).toBe("NONE");
  await picker.selectOption(mix.id);
  for (const label of [/^Choose when adding/, /^Save without a default Mix/]) {
    await page.getByRole("radio", { name: label }).check();
    await expect(picker).toHaveCount(0);
    await page.getByRole("radio", { name: /^Add them to a Mix automatically/ }).check();
    await expect(picker).toHaveValue(mix.id);
  }
  for (const mode of ["MIX", "ASK", "NONE"] as const) {
    await page.locator(`input[name="placement"][value="${mode}"]`).check();
    await saveButton.click();
    await expect(page.locator(".notice.success")).toHaveText("New contacts setting saved.");
    await expect.poll(async () => {
      const saved = await prisma.workspacePreference.findUniqueOrThrow({ where: { workspaceId } });
      return [saved.newContactPlacement, saved.newContactMixId];
    }).toEqual([mode, mode === "MIX" ? mix.id : null]);
    await page.reload();
    await expect(page.locator(`input[name="placement"][value="${mode}"]`)).toBeChecked();
    if (mode === "MIX") await expect(picker).toHaveValue(mix.id);
    else await expect(picker).toHaveCount(0);
  }
});

test("a refused new-contact Mix save keeps the chosen mode and unavailable Mix", async ({ page }) => {
  const mix = await newContactSettings(page);
  const replacement = await prisma.mix.create({ data: { workspaceId, name: "Replacement follow-up", status: "ACTIVE", triggerMode: "MANUAL_START" } });
  try {
    await page.getByRole("radio", { name: /^Add them to a Mix automatically/ }).check();
    const picker = page.getByLabel("Mix for new contacts", { exact: true });
    await picker.selectOption(mix.id);
    await prisma.mix.update({ where: { id: mix.id }, data: { status: "PAUSED" } });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const error = page.locator("form").getByRole("alert");
    await expect(error).toContainText("Choose a Mix that is on");
    await expect(error).toBeFocused();
    await expect(page.getByRole("radio", { name: /^Add them to a Mix automatically/ })).toBeChecked();
    await expect(picker).toHaveValue(mix.id);
    await expect(picker.locator("option:checked")).toHaveText("Discovery follow-up (not available)");
    await picker.selectOption(replacement.id);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator(".notice.success")).toHaveText("New contacts setting saved.");
    await expect(error).toHaveCount(0);
    expect((await prisma.workspacePreference.findUniqueOrThrow({ where: { workspaceId } })).newContactMixId).toBe(replacement.id);
  } finally {
    await prisma.mix.update({ where: { id: mix.id }, data: { status: "ACTIVE" } });
    await prisma.mix.delete({ where: { id: replacement.id } });
  }
});

test("an unconfirmed new-contact save keeps its draft for retry", async ({ page }) => {
  const mix = await newContactSettings(page);
  await page.getByRole("radio", { name: /^Add them to a Mix automatically/ }).check();
  const picker = page.getByLabel("Mix for new contacts", { exact: true });
  await picker.selectOption(mix.id);
  await page.route("**/settings/new-contacts*", route => route.request().method() === "POST" ? route.abort("failed") : route.continue());
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("couldn’t confirm this save");
  await expect(page.locator("form").getByRole("alert")).toBeFocused();
  await expect(picker).toHaveValue(mix.id);
  await expect(page.getByRole("radio", { name: /^Add them to a Mix automatically/ })).toBeChecked();
  await page.unroute("**/settings/new-contacts*");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".notice.success")).toHaveText("New contacts setting saved.");
  await expect(page.locator("form").getByRole("alert")).toHaveCount(0);
});

test("no eligible Mix keeps NONE and ASK saveable and explains source overrides", async ({ page }) => {
  await newContactSettings(page);
  const active = await prisma.mix.findMany({ where: { workspaceId, status: "ACTIVE" }, select: { id: true } });
  try {
    await prisma.mix.updateMany({ where: { id: { in: active.map(mix => mix.id) } }, data: { status: "PAUSED" } });
    await visit(page, "/settings/new-contacts");
    await page.getByRole("radio", { name: /^Add them to a Mix automatically/ }).check();
    await expect(page.getByRole("link", { name: "Create a Mix", exact: true })).toHaveAttribute("href", "/mixes/new?custom=1");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByLabel("Mix for new contacts", { exact: true })).toBeFocused();
    await page.getByRole("radio", { name: /^Choose when adding/ }).check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator(".notice.success")).toBeVisible();
    await expect(page.getByLabel("Mix for new contacts", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Contact stage and Everyone rules still apply.", { exact: false })).toBeVisible();
    const disclosure = page.locator("details").filter({ hasText: "Where this applies and what can override it" });
    await expect(disclosure).not.toHaveAttribute("open", "");
    await open(disclosure.locator(":scope > summary"));
    await expect(disclosure).toContainText("Each lead connection can follow this setting, choose its own Mix or start none.");
    await expect(disclosure).toContainText("Nothing starts from an import without your confirmation.");
    await expect(disclosure.getByRole("link", { name: "Today", exact: true })).toHaveAttribute("href", "/jumps");
    await expect(disclosure.getByRole("link", { name: "Contact stage", exact: true })).toHaveAttribute("href", "/settings/journey");
  } finally {
    await prisma.mix.updateMany({ where: { id: { in: active.map(mix => mix.id) } }, data: { status: "ACTIVE" } });
  }
});

test("placement choices and stage consequences fit both themes with keyboard and enlarged text", async ({ page }, testInfo) => {
  await newContactSettings(page);
  for (const path of ["/settings/new-contacts", "/settings/journey"]) {
    await visit(page, path);
    if (path.endsWith("new-contacts")) {
      const option = page.getByRole("radio", { name: /^Add them to a Mix automatically/ });
      await option.focus(); await option.press("Space");
      await open(page.getByText("Where this applies and what can override it", { exact: true }));
    } else await open(page.locator(`#stage-${stages[0].id} > summary`));
    for (const theme of ["light", "dark"]) for (const width of [320, 390, 834, 1194, 1920]) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await page.setViewportSize({ width, height: 900 });
      const zoom = width === 320 ? await page.addStyleTag({ content: "html { font-size: 200% !important; }" }) : null;
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${path} ${theme} ${width}`).toBe(true);
      const control = path.endsWith("new-contacts") ? page.getByLabel("Mix for new contacts", { exact: true }) : page.locator(`#stage-${stages[0].id}`).getByLabel("Follow-up Mix on entry");
      await control.focus();
      await expect(control).toBeFocused();
      expect(await control.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
      const box = (await control.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44); expect(box.width).toBeGreaterThanOrEqual(44);
      expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`${path.split("/").at(-1)}-${theme}-${width}.png`), fullPage: true });
      if (zoom) await zoom.evaluate(element => element.parentNode?.removeChild(element));
    }
  }
});
