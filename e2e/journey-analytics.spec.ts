import { createHash, randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { readWorkflowDefinition, saveWorkflowConfiguration, workflowJson } from "../src/lib/mix-workflow";
import { emptyWorkflow, emptyWorkflowState } from "../src/lib/mix-workflow-types";
import { axeInPage } from "./axe-in-page";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block" });
test.setTimeout(120000);
let workspaceId: string, userId: string, alexId: string, alexWork: string;
const token = randomUUID(), mixes: string[] = [], beats: string[] = [], versions: string[] = [];
test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `analytics-${randomUUID()}@example.invalid`, name: "Analytics fixture", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Analytics fixture", slug: randomUUID(), members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000) } });
  for (const name of ["Welcome", "Keep in touch"]) {
    mixes.push((await prisma.mix.create({ data: { workspaceId, name, status: "ACTIVE", triggerMode: "MANUAL_START" } })).id);
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name: `${name} call`, channel: "PHONE_CALL", versions: { create: { version: 1, script: "Fixture only" } } }, include: { versions: true } }); versions.push(template.versions[0].id);
    beats.push((await prisma.mixStep.create({ data: { mixId: mixes.at(-1)!, stepVersionId: versions.at(-1)!, dayOffset: 0, sortOrder: 0 } })).id);
  }
  const ruleId = randomUUID(), routeId = randomUUID();
  await prisma.$transaction(tx => saveWorkflowConfiguration(tx, workspaceId, { ...emptyWorkflow(), intentionalEnds: [`mix:${mixes[1]}`], rules: [{ id: ruleId, name: "Keep the relationship going", source: { mixId: mixes[0], stepId: null }, mode: "PARALLEL", enabled: true, join: null, routes: [{ id: routeId, label: "After completion", when: "FINISHED", outcome: "", delayMinutes: 0, target: { mixId: mixes[1], stepId: null }, maxVisits: null, replace: false }] }] }, 0, userId));
  const definition = await readWorkflowDefinition(prisma, workspaceId), at = new Date(Date.now() - 60000).toISOString();
  const stage = await prisma.journeyStage.create({ data: { workspaceId, name: "Ongoing relationship", position: 0 } });
  for (const name of ["Alex", "Bailey", "Casey", "Drew", "Erin"]) {
    const contact = await prisma.contact.create({ data: { workspaceId, displayName: name } });
    if (name === "Alex" || name === "Casey") await prisma.contactJourney.create({ data: { workspaceId, contactId: contact.id, stageId: stage.id } });
    if (name === "Erin") continue;
    const state = emptyWorkflowState();
    for (const n of name === "Alex" ? [0, 1] : [0]) {
      state.runs.push({ id: `run-${n}`, mixId: mixes[n], startedAt: at, completedAt: name === "Casey" ? at : null, status: name === "Casey" ? "FINISHED" : "ACTIVE", parentTransitionId: null, legacy: false });
      state.visits.push({ id: `visit-${n}`, runId: `run-${n}`, stepId: beats[n], readyAt: at, status: name === "Bailey" ? "HELD" : name === "Casey" ? "DONE" : "PENDING", completedAt: name === "Casey" ? at : null, outcome: null, reason: name === "Bailey" ? "Appointment needed" : null, parentTransitionId: null });
    }
    if (name === "Alex") { state.evaluations.push({ id: "evaluation", ruleId, runId: "run-0", visitId: null, occurredAt: at, outcome: null, decidedAt: at, generation: 1, status: "ROUTED", joined: false }); state.transitions.push({ id: "transition", evaluationId: "evaluation", generation: 1, routeId, dueAt: at, startedAt: at, status: "STARTED", reason: null, target: { mixId: mixes[1], stepId: null }, targetRunId: "run-1", targetVisitId: null }); }
    const instance = await prisma.mixWorkflowInstance.create({ data: { workspaceId, contactId: contact.id, admissionKey: randomUUID(), label: `${name}'s follow-through`, status: name === "Drew" ? "PAUSED" : name === "Casey" ? "FINISHED" : "ACTIVE", definition: workflowJson(definition), state: workflowJson(state) } });
    if (name === "Alex") { alexId = contact.id; alexWork = instance.id; }
    if (name !== "Bailey") for (const n of name === "Alex" ? [0, 1] : [0]) await prisma.jump.create({ data: { workspaceId, contactId: contact.id, mixId: mixes[n], mixStepId: beats[n], stepVersionId: versions[n], uniquenessKey: randomUUID(), reason: "Fixture", status: name === "Casey" ? "DONE" : "PENDING", scheduledAt: new Date(Date.now() + (n ? 86400000 : -60000)), templateSnapshot: {}, renderedSnapshot: {}, workflowInstanceId: instance.id, workflowVisitId: `visit-${n}`, workflowManaged: true } });
  }
  await prisma.contact.createMany({ data: Array.from({ length: 26 }, (_, n) => ({ workspaceId, displayName: `Person ${String(n).padStart(2, "0")}` })) });
});
test.beforeEach(async ({ page, context }) => {
  await context.addCookies([{ name: "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, sameSite: "Strict" }]);
  await page.setViewportSize({ width: 1440, height: 1050 }); await page.goto("/journey", { waitUntil: "networkidle" });
});
test.afterAll(async () => { if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } }); if (userId) await prisma.user.delete({ where: { id: userId } }); });
const roster = (page: import("@playwright/test").Page) => page.getByRole("region", { name: "Journey people", exact: true });

test("real people counts, concurrent positions, status/stage filters, search and pagination", async ({ page }) => {
  const counts = page.getByLabel("People by workflow status", { exact: true });
  await expect(counts.getByRole("button", { name: "31 People", exact: true })).toBeVisible();
  await counts.getByRole("button", { name: "1 Active", exact: true }).click();
  await expect(roster(page).getByRole("button", { name: "View Alex's journey", exact: true })).toBeVisible();
  await expect(roster(page).getByRole("button", { name: "View Bailey's journey", exact: true })).toHaveCount(0);
  await expect(roster(page).locator("span[data-status=waiting]")).toBeVisible();
  await counts.getByRole("button", { name: "1 Needs attention", exact: true }).click();
  await expect(roster(page).getByRole("button", { name: "View Bailey's journey", exact: true })).toBeVisible();
  await counts.getByRole("button", { name: "31 People", exact: true }).click();
  await roster(page).getByLabel("Contact stage", { exact: true }).selectOption({ label: "Ongoing relationship · 2" });
  await expect(roster(page).locator("article")).toHaveCount(2);
  await roster(page).getByRole("button", { name: "Clear filters", exact: true }).click();
  await roster(page).getByRole("button", { name: "Next people", exact: true }).click();
  await expect(roster(page).getByText("11–20 of 31", { exact: true })).toBeVisible();
  await roster(page).getByRole("searchbox", { name: "Find a person" }).fill("Person 25"); await roster(page).getByRole("button", { name: "Search", exact: true }).click();
  await expect(roster(page).locator("article")).toHaveCount(1); await expect(roster(page).getByRole("button", { name: "View Person 25's journey", exact: true })).toBeVisible();
});

test("node and Beat counts open their own people, and Results retain route analytics", async ({ page }) => {
  await page.getByRole("button", { name: "Reset zoom to 100%", exact: true }).click();
  const node = page.locator(`[data-workflow-node="${mixes[1]}"]`);
  await node.getByRole("button", { name: /^Keep in touch: 1 people here/ }).click();
  await expect(roster(page).getByRole("heading", { name: "Keep in touch 1", exact: true })).toBeVisible();
  await expect(roster(page).getByRole("button", { name: "View Alex's journey", exact: true })).toBeVisible();
  await node.getByRole("button", { name: "Show Beats", exact: true }).click(); await node.getByRole("button", { name: /^Keep in touch call/ }).click();
  await expect(roster(page).getByRole("heading", { name: "Keep in touch call 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Results", exact: true }).click();
  const results = page.getByRole("region", { name: "Connection results", exact: true });
  await expect(results.getByText("1/1 eligible connections started · 0 held", { exact: true })).toBeVisible();
  await page.getByText("Targets and counting rules", { exact: true }).click(); await page.getByLabel("Target (%)", { exact: true }).fill("80"); await page.getByLabel("Minimum observations", { exact: true }).fill("1");
  await expect(results.getByText("At or above target", { exact: true })).toBeVisible();
  await page.getByLabel("Period", { exact: true }).selectOption("7"); await expect(results.getByText("1/1 eligible connections started · 0 held", { exact: true })).toBeVisible();
});

test("compact layouts retain keyboard access, status counts and both themes", async ({ page }) => {
  const failures: string[] = []; page.on("pageerror", error => failures.push(error.message));
  for (const width of [320, 390, 834, 1440]) for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width, height: 1000 }); await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (process.env.CONNECTION_ARTIFACTS) await page.screenshot({ path: `${process.env.CONNECTION_ARTIFACTS}/analytics-${width}-${theme}.png`, fullPage: true });
    const canvas = await page.getByRole("region", { name: /^Scrollable journey diagram/ }).boundingBox(); expect(canvas!.width).toBeGreaterThan(280);
    const results = await axeInPage(page).include('[aria-label="Mix and Beat journey"]').include('[aria-label="Journey details"]').withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze(); expect(results.violations).toEqual([]);
    if (process.env.CONNECTION_ARTIFACTS) await page.screenshot({ path: `${process.env.CONNECTION_ARTIFACTS}/analytics-${width}-${theme}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "1 Needs attention", exact: true }).focus(); await page.keyboard.press("Enter");
  await expect(roster(page).getByRole("button", { name: "View Bailey's journey", exact: true })).toBeVisible(); expect(failures).toEqual([]);
});

test("person drill-down retains real progress controls and updates counts after pausing", async ({ page }) => {
  await page.getByRole("button", { name: "1 Active", exact: true }).click(); await expect(roster(page).locator("article")).toHaveCount(1); await roster(page).getByRole("button", { name: "View Alex's journey", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Highlight work", exact: true })).toHaveValue(alexWork);
  await expect(page.getByRole("link", { name: "Open contact", exact: true })).toHaveAttribute("href", `/contacts/${alexId}`);
  await page.getByRole("button", { name: "Pause this work", exact: true }).click();
  await expect(page.locator('[aria-label="Journey details"] .status-pill')).toHaveText("paused");
  await page.getByRole("region", { name: "Mix and Beat journey", exact: true }).getByRole("button", { name: "All people", exact: true }).click();
  await expect(page.getByRole("button", { name: "2 Paused", exact: true })).toBeVisible();
});

test("start work finds a contact directly in Setup without leaving the map", async ({ page }) => {
  await page.getByRole("button", { name: "Setup", exact: true }).click();
  await page.locator(`[data-workflow-node="${mixes[0]}"]`).getByRole("button", { name: /^Welcome(?: active| Beats|$)/ }).click();
  await page.getByRole("button", { name: "Start for someone", exact: true }).click();
  await page.getByRole("searchbox", { name: "Find someone to start", exact: true }).fill("Person 25");
  await page.getByRole("button", { name: "Find", exact: true }).click();
  const person = page.getByRole("combobox", { name: "Person", exact: true });
  await expect(person.getByRole("option", { name: "Person 25", exact: true })).toHaveCount(1);
  await person.selectOption({ label: "Person 25" });
  await page.getByRole("button", { name: "Start this Mix", exact: true }).click();
  await expect(page.getByRole("button", { name: "Progress", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("selecting people keeps the directory available and updates map and context independently", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const people = roster(page), details = page.getByRole("complementary", { name: "Journey details", exact: true });
  const alex = people.getByRole("button", { name: "View Alex's journey", exact: true });
  await alex.focus(); await page.keyboard.press("Enter");
  await expect(alex).toHaveAttribute("aria-pressed", "true");
  await expect(people.getByRole("button", { name: "View Bailey's journey", exact: true })).toBeVisible();
  await expect(people.locator("article")).toHaveCount(10);
  await expect(page.getByRole("button", { name: "31 People", exact: true })).toBeVisible();
  await expect(details.getByRole("heading", { name: "Alex", exact: true })).toBeVisible();
  await people.getByRole("button", { name: "View Erin's journey", exact: true }).click();
  await expect(details.getByRole("heading", { name: "Erin", exact: true })).toBeVisible();
  await expect(details.getByText("No Mix work to show.", { exact: false })).toBeVisible();
  await expect(page.locator('[data-workflow-node][data-active=true]')).toHaveCount(0);
  await expect(people.locator("article")).toHaveCount(10);
  await page.getByRole("region", { name: "Mix and Beat journey", exact: true }).getByRole("button", { name: "All people", exact: true }).click();
  await page.locator(`[data-workflow-node="${mixes[0]}"]`).getByRole("button", { name: /^Welcome(?: active| Beats|$)/ }).click();
  await expect(details.getByRole("heading", { name: "Welcome", exact: true })).toBeVisible();
  await details.getByText("Beats in this Mix", { exact: true }).click();
  await expect(details.getByText("Welcome call", { exact: true })).toBeVisible();
  await expect(details.getByText("Manual or connected start", { exact: false })).toBeVisible();
});

test("Journey pane boundaries match Contacts and Mixes, and narrow panes keep selection", async ({ page }) => {
  test.setTimeout(240000);
  for (const width of [1200, 1440, 1700, 1920, 3840]) {
    await page.setViewportSize({ width, height: 1080 });
    await page.goto("/contacts", { waitUntil: "networkidle" });
    const contacts = await page.locator(".contacts-directory").boundingBox();
    await page.goto("/mixes", { waitUntil: "networkidle" });
    const mixesPane = await page.getByRole("complementary", { name: "Mix library", exact: true }).boundingBox();
    await page.goto("/journey", { waitUntil: "networkidle" });
    const directory = await page.getByRole("complementary", { name: "Journey directory", exact: true }).boundingBox();
    const map = await page.getByRole("region", { name: "Mix and Beat journey", exact: true }).boundingBox();
    const details = await page.getByRole("complementary", { name: "Journey details", exact: true }).boundingBox();
    expect(directory!.x).toBeCloseTo(contacts!.x, 0); expect(directory!.y).toBeCloseTo(contacts!.y, 0);
    expect(directory!.width).toBeCloseTo(contacts!.width, 0); expect(directory!.width).toBeCloseTo(mixesPane!.width, 0);
    expect(map!.x).toBeCloseTo(directory!.x + directory!.width, 0); expect(map!.width).toBeGreaterThan(400);
    if (width >= 1700) { expect(details!.x).toBeCloseTo(map!.x + map!.width, 0); expect(details!.y).toBeCloseTo(map!.y, 0); }
    else expect(details!.y).toBeGreaterThanOrEqual(map!.y + map!.height - 1);
  }
  for (const width of [320, 390, 767, 768, 834, 900, 901, 1099, 1100, 1194, 1199, 1200, 1279, 1280, 1440, 1699, 1700, 1920, 2560, 3440, 3840]) for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width, height: 1080 }); await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    const panels = page.getByRole("navigation", { name: "Journey workspace panels", exact: true });
    for (const pane of width < 1200 ? ["People", "Map", "Details"] : ["Map"]) {
      if (width < 1200) await panels.getByRole("button", { name: pane, exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if ([320, 834, 1440, 1920, 3840].includes(width)) {
        const scan = await axeInPage(page).include('#journey-people-pane').include('#journey-map-pane').include('#journey-details-pane').withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
        expect(scan.violations, `${width}px ${theme} ${pane}`).toEqual([]);
      }
      if (process.env.CONNECTION_ARTIFACTS && [390, 834, 1440, 1920, 3840].includes(width)) await page.screenshot({ path: `${process.env.CONNECTION_ARTIFACTS}/panes-${pane}-${width}-${theme}.png`, fullPage: true });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const panels = page.getByRole("navigation", { name: "Journey workspace panels", exact: true });
  await panels.getByRole("button", { name: "People", exact: true }).click();
  await roster(page).getByRole("button", { name: "View Alex's journey", exact: true }).click();
  await expect(panels.getByRole("button", { name: "Map", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("combobox", { name: "Highlight work", exact: true })).toHaveValue(alexWork);
  await panels.getByRole("button", { name: "Details", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Alex", exact: true })).toBeVisible();
  await panels.getByRole("button", { name: "People", exact: true }).click();
  await expect(roster(page).getByRole("button", { name: "View Alex's journey", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("connection drafts survive pane changes and narrow deep links reveal check-ins", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const panels = page.getByRole("navigation", { name: "Journey workspace panels", exact: true });
  await page.getByRole("button", { name: "Setup", exact: true }).click();
  await page.locator(`[data-workflow-node="${mixes[0]}"]`).getByRole("button", { name: /^Welcome(?: active| Beats|$)/ }).click();
  // Selecting keeps the map in view (040fc25); the Mix's details open on request.
  await expect(panels.getByRole("button", { name: "Map", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "View Mix details", exact: true }).click();
  await expect(panels.getByRole("button", { name: "Details", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Connect next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Connect what happens next", exact: true })).toBeFocused();
  const draft = page.getByRole("textbox", { name: "Connection name", exact: true }); await draft.fill("Keep this unsaved connection");
  await panels.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.getByRole("region", { name: "Mix and Beat journey", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Progress", exact: true })).toBeDisabled();
  await panels.getByRole("button", { name: "Details", exact: true }).click();
  await expect(draft).toHaveValue("Keep this unsaved connection");
  for (const width of [320, 834, 1920, 390]) { await page.setViewportSize({ width, height: 844 }); await expect(draft).toHaveValue("Keep this unsaved connection"); }
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.goto("/journey?touchpoint=quiet-days", { waitUntil: "networkidle" });
  await expect(panels.getByRole("button", { name: "Details", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('#journey-details-pane details[open]').filter({ hasText: "Just saying hello" })).toBeVisible();
  await page.evaluate(() => document.documentElement.style.fontSize = "200%");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
