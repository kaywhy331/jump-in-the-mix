import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";
import { applyRenderedTheme } from "./theme-fixture";

// A Mix sets the Contact stage of the people who start it, and a Mega-Mix can add its stage labels (JITM-09 §2.79).
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block", actionTimeout: 15_000 });
test.setTimeout(180_000);
const SCREENS = process.env.MIX_STAGE_SCREENS ?? "test-results/mix-stages";
let userId: string, workspaceId: string;
const errors: string[] = [];

test.beforeEach(async ({ context, page }) => {
  errors.length = 0; page.on("pageerror", error => errors.push(error.message));
  userId = (await prisma.user.create({ data: { name: "Stage owner", email: `mix-stage-browser-${randomUUID()}@example.invalid`, emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Stage fixture", slug: randomUUID(), members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC", reviewMixActivation: false } });
  const token = randomUUID();
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  await context.addCookies([{ name: "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, sameSite: "Strict" }]);
  await mkdir(SCREENS, { recursive: true });
});
test.afterEach(async () => {
  await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  await prisma.userPreference.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  expect(errors).toEqual([]);
});

async function mixWithBeat(name: string) {
  const mix = await prisma.mix.create({ data: { workspaceId, name, status: "ACTIVE", triggerMode: "MANUAL_START" } });
  const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Check in", channel: "PHONE_CALL", isActive: false, versions: { create: { version: 1, script: "Ask how it went." } } }, include: { versions: true } });
  await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: template.versions[0].id, dayOffset: 0, sortOrder: 1 } });
  return mix;
}
async function audit(page: Page, selector: string) {
  expect((await axeInPage(page).include(selector).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
}
/** Screenshots in both themes, with axe on `selector` in each (EVD-01: dark was screenshotted, not audited). */
async function capture(page: Page, name: string, selector?: string) {
  for (const theme of ["light", "dark"] as const) {
    await applyRenderedTheme(page, theme);
    await page.screenshot({ path: `${SCREENS}/${name}-${theme}.png`, fullPage: true });
    if (selector) await audit(page, selector);
  }
  await applyRenderedTheme(page, "light");
}
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

for (const width of [390, 1280]) test(`a Mix's stage moves the person who starts it (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  await page.goto("/settings/journey");
  await page.getByRole("button", { name: "Use these starting stages", exact: true }).click();
  await expect(page.getByText("Contact stages saved.")).toBeVisible();
  const mix = await mixWithBeat("Qualify the lead");
  const person = await prisma.contact.create({ data: { workspaceId, displayName: "Robin Stage", firstName: "Robin" } });

  // The editor offers the business's stages; choosing one is saved with the Mix.
  await page.goto(`/mixes?mix=${mix.id}&view=edit`);
  await page.locator("summary").filter({ hasText: "Name and start" }).click();
  const stage = page.getByRole("combobox", { name: "Contact stage", exact: true });
  await expect(stage).toHaveValue("");
  await stage.selectOption({ label: "Prospect" });
  await stage.focus();
  await expect(page.getByText("People who start this Mix move to this stage.")).toBeVisible();
  await capture(page, `editor-stage-${width}`, ".mix-stage-choice");
  await page.getByRole("button", { name: "Save and activate", exact: true }).click();
  await expect(page.getByText("Mix saved.")).toBeVisible();
  expect((await prisma.mix.findUniqueOrThrow({ where: { id: mix.id }, include: { stage: true } })).stage?.name).toBe("Prospect");
  await page.goto(`/mixes?mix=${mix.id}`);
  // On a phone the Mix's details are their own pane.
  if (width < 600) await page.getByRole("button", { name: "Details", exact: true }).click();
  await expect(page.getByText("Moves people to the Prospect stage.")).toBeVisible();

  // Contact stages says which Mix sets the stage.
  await page.goto("/settings/journey");
  await page.locator("summary").filter({ hasText: "Prospect" }).click();
  await expect(page.getByText("Set when someone starts Qualify the lead.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Qualify the lead", exact: true })).toBeVisible();
  await capture(page, `contact-stages-${width}`, ".journey-stage-settings[open]");

  // Starting the Mix moves the person, and the history says why.
  await page.goto(`/contacts/${person.id}`);
  await page.getByRole("button", { name: "Start a follow-up", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("combobox", { name: "Choose a Mix", exact: true }).selectOption(mix.id);
  await page.getByRole("dialog").getByRole("button", { name: "Start Mix", exact: true }).click();
  await expect(page.getByRole("button", { name: "Change journey stage: Prospect", exact: true })).toBeVisible();
  // Robin was added without a stage event, so they join the first stage on the way, as the worker's pass would (STG-02).
  await expect(page.getByText("Lead → Prospect, set by the Mix “Qualify the lead”.").first()).toBeVisible();
  await capture(page, `profile-stage-${width}`);
  const activity = await prisma.contactActivity.findMany({ where: { workspaceId, contactId: person.id, kind: "SYSTEM" } });
  expect(activity.map(item => item.summary).sort()).toEqual(["Joined Lead. A contact or inquiry arrives · New contact.", "Lead → Prospect, set by the Mix “Qualify the lead”."]);
});

test("adding a Mega-Mix offers its stage labels and links its Mixes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/templates/journeys?journey=real-estate");
  await expect(page.getByText("Stage: New lead").first()).toBeVisible();
  await page.getByRole("button", { name: "Set up this journey", exact: true }).click();
  await page.getByRole("button", { name: "Review my setup", exact: true }).click();
  const labels = page.getByRole("checkbox", { name: /Add its stage labels/ });
  await expect(labels).toBeChecked();
  await expect(page.getByText("New lead, Consultation, Home search, Listed, Offer, Under contract, Closed, Past client.", { exact: false })).toBeVisible();
  await expect(page.getByText("This turns on Contact stages.", { exact: false })).toBeVisible();
  await labels.scrollIntoViewIfNeeded();
  await capture(page, "mega-mix-labels-390", "label:has(input[name=addStages])");
  await page.getByRole("checkbox", { name: "I’ve reviewed my journey and preferences." }).check();
  await page.getByRole("button", { name: "Add Real estate Mega-Mix", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your pipeline is ready" })).toBeVisible();
  const stages = await prisma.journeyStage.findMany({ where: { workspaceId }, orderBy: { position: "asc" } });
  expect(stages.map(item => item.name)).toEqual(["New lead", "Consultation", "Home search", "Listed", "Offer", "Under contract", "Closed", "Past client"]);
  expect(await prisma.mix.count({ where: { workspaceId, stageId: { not: null } } })).toBe(13);
  expect(await prisma.mixAssignment.count({ where: { workspaceId } })).toBe(0);
  await page.goto("/settings/journey");
  await expect(page.getByText("New lead → Consultation → Home search → Listed → Offer → Under contract → Closed → Past client")).toBeVisible();
});

test("turning on a draft that names a stage says who moves before it starts (UX-01)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings/journey");
  await page.getByRole("button", { name: "Use these starting stages", exact: true }).click();
  await expect(page.getByText("Contact stages saved.")).toBeVisible();
  const [lead, prospect] = await prisma.journeyStage.findMany({ where: { workspaceId }, orderBy: { position: "asc" } });
  const tag = await prisma.group.create({ data: { workspaceId, name: "Spring list" } });
  const people = await Promise.all(["Ada Moves", "Bo Moves"].map(displayName => prisma.contact.create({ data: { workspaceId, displayName } })));
  await prisma.contactGroupMembership.createMany({ data: people.map(person => ({ contactId: person.id, groupId: tag.id })) });
  await prisma.contactJourney.create({ data: { workspaceId, contactId: people[0].id, stageId: lead.id } });
  const mix = await mixWithBeat("Spring check-in");
  await prisma.mix.update({ where: { id: mix.id }, data: { status: "DRAFT", stageId: prospect.id } });
  await prisma.mixAssignment.create({ data: { workspaceId, mixId: mix.id, groupId: tag.id, mode: "DYNAMIC", assignmentKey: `${workspaceId}:${mix.id}:group:${tag.id}` } });

  // The review preference is off for this owner, and Start Mix still opens the review.
  await page.goto(`/mixes?mix=${mix.id}`);
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await page.locator("summary").filter({ hasText: "Manage Mix" }).click();
  await page.getByRole("button", { name: "Start Mix", exact: true }).click();
  await page.getByRole("button", { name: "Review and start", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Start this Mix?" });
  await expect(dialog.getByText("Starting moves 2 people to Prospect, including 1 now in another stage. Pausing, removing or stopping the Mix doesn’t move them back.")).toBeVisible();
  await capture(page, "stage-review-390", "dialog[open]");
  await dialog.getByRole("button", { name: "Start the Mix", exact: true }).click();
  await expect(page.getByText("Mix saved.")).toBeVisible();
  expect((await prisma.contactJourney.findMany({ where: { contactId: { in: people.map(person => person.id) } } })).map(record => record.stageId)).toEqual([prospect.id, prospect.id]);
});

test("the stage choices fit 320px with 200% text and work from the keyboard (EVD-01)", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => { const style = document.createElement("style"); style.textContent = "html { font-size: 200% !important; }"; document.head.append(style); }));
  await page.goto("/settings/journey");
  await page.getByRole("button", { name: "Use these starting stages", exact: true }).click();
  await expect(page.getByText("Contact stages saved.")).toBeVisible();
  const mix = await mixWithBeat("Qualify the lead");
  const prospect = await prisma.journeyStage.findFirstOrThrow({ where: { workspaceId, name: "Prospect" } });
  await prisma.mix.update({ where: { id: mix.id }, data: { stageId: prospect.id } });

  await page.goto(`/mixes?mix=${mix.id}&view=edit`);
  await page.locator("summary").filter({ hasText: "Name and start" }).click();
  const stage = page.getByRole("combobox", { name: "Contact stage", exact: true });
  await expect(stage).toHaveValue(prospect.id);
  await stage.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Manage Contact stages", exact: true })).toBeFocused();
  await stage.scrollIntoViewIfNeeded();
  expect(await noSidewaysScroll(page)).toBe(true);
  await capture(page, "editor-stage-320-200");

  await page.goto("/settings/journey");
  await page.locator("summary").filter({ hasText: "Prospect" }).click();
  const link = page.getByRole("link", { name: "Qualify the lead", exact: true });
  await link.focus();
  await expect(link).toBeFocused();
  expect(await noSidewaysScroll(page)).toBe(true);
  await capture(page, "contact-stages-320-200");

  await page.goto("/templates/journeys?journey=contractor");
  await page.getByRole("button", { name: "Set up this journey", exact: true }).click();
  await page.getByRole("button", { name: "Review my setup", exact: true }).click();
  const labels = page.getByRole("checkbox", { name: /Add its stage labels/ });
  await labels.focus();
  await page.keyboard.press("Space");
  await expect(labels).not.toBeChecked();
  await page.keyboard.press("Space");
  await expect(labels).toBeChecked();
  await labels.scrollIntoViewIfNeeded();
  expect(await noSidewaysScroll(page)).toBe(true);
  await capture(page, "mega-mix-labels-320-200");
});
