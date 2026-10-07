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
async function capture(page: Page, name: string) {
  for (const theme of ["light", "dark"] as const) {
    await applyRenderedTheme(page, theme);
    await page.screenshot({ path: `${SCREENS}/${name}-${theme}.png`, fullPage: true });
  }
  await applyRenderedTheme(page, "light");
}

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
  await capture(page, `editor-stage-${width}`);
  await audit(page, ".mix-stage-choice");
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
  await capture(page, `contact-stages-${width}`);
  await audit(page, ".journey-stage-settings[open]");

  // Starting the Mix moves the person, and the history says why.
  await page.goto(`/contacts/${person.id}`);
  await page.getByRole("button", { name: "Start a follow-up", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("combobox", { name: "Choose a Mix", exact: true }).selectOption(mix.id);
  await page.getByRole("dialog").getByRole("button", { name: "Start Mix", exact: true }).click();
  await expect(page.getByRole("button", { name: "Change journey stage: Prospect", exact: true })).toBeVisible();
  await expect(page.getByText("Joined Prospect, set by the Qualify the lead Mix.").first()).toBeVisible();
  await capture(page, `profile-stage-${width}`);
  const activity = await prisma.contactActivity.findFirstOrThrow({ where: { workspaceId, contactId: person.id, kind: "SYSTEM" }, orderBy: { createdAt: "desc" } });
  expect(activity.summary).toBe("Joined Prospect, set by the Qualify the lead Mix.");
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
  await capture(page, "mega-mix-labels-390");
  await audit(page, "label:has(input[name=addStages])");
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
