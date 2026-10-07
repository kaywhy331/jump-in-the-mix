import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";
import { applyRenderedTheme } from "./theme-fixture";

// What happens next for a person (JITM-09 §2.77–§2.78, D33–D34): the end-of-Mix question on Today, the New contacts
// setting, and where it applies.
const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
test.skip(!local, "Disposable local database only");
test.setTimeout(120_000);

let workspaceId = "", userId = "", estimateMixId = "", nurtureMixId = "", versionId = "", stepId = "";
const token = randomUUID();
const suffix = randomUUID().slice(0, 8);

test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `next-step-${suffix}@example.test`, name: "Next step fixture", passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: `next-step-${suffix}`, name: "Next step fixture", members: { create: { userId } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Estimate check-in", channel: "SMS" } });
  versionId = (await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Hi {{First Name}}, any questions about the estimate?" } })).id;
  const estimate = await prisma.mix.create({ data: { workspaceId, name: "Estimate follow-up", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: { stepVersionId: versionId, dayOffset: 0, sortOrder: 1 } } }, include: { steps: true } });
  estimateMixId = estimate.id; stepId = estimate.steps[0].id;
  const nurtureTemplate = await prisma.stepTemplate.create({ data: { workspaceId, name: "Stay in touch", channel: "SMS", versions: { create: { version: 1, body: "Hi {{First Name}}, how are things?" } } }, include: { versions: true } });
  nurtureMixId = (await prisma.mix.create({ data: { workspaceId, name: "Stay in touch", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: { stepVersionId: nurtureTemplate.versions[0].id, dayOffset: 0, sortOrder: 1 } } } })).id;
});
test.beforeEach(async ({ context }) => { await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]); });
test.afterAll(async () => { if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } }); if (userId) await prisma.user.deleteMany({ where: { id: userId } }); });

/** A person on the last Beat of "Estimate follow-up", due yesterday, the only follow-up on Today. */
async function lastBeat(first: string) {
  await prisma.jump.updateMany({ where: { workspaceId, status: "PENDING" }, data: { status: "SKIPPED", completedAt: new Date() } });
  const displayName = `${first} Lane`;
  const contact = await prisma.contact.create({ data: { workspaceId, displayName, firstName: first, lastName: "Lane", phones: { create: { phone: "+15550100300", normalized: `+1555010${Math.floor(1000 + Math.random() * 8999)}`, isPrimary: true } } } });
  await prisma.mixAssignment.create({ data: { workspaceId, mixId: estimateMixId, contactId: contact.id, assignmentKey: `${workspaceId}:${estimateMixId}:${contact.id}`, startDate: new Date(Date.now() - 2 * 86_400_000) } });
  const jump = await prisma.jump.create({ data: { workspaceId, contactId: contact.id, mixId: estimateMixId, mixStepId: stepId, stepVersionId: versionId, scheduledAt: new Date(Date.now() - 86_400_000), uniquenessKey: randomUUID(), reason: "Estimate check-in", templateSnapshot: { channel: "SMS", body: "Hi {{First Name}}, any questions about the estimate?", occurrenceKey: `manual:${new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10)}` }, renderedSnapshot: { body: `Hi ${first}, any questions about the estimate?` } } });
  return { contactId: contact.id, displayName, jumpId: jump.id };
}

/** The account check has finished and the page answers clicks. */
async function ready(page: Page) { await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "", { timeout: 60_000 }); }

async function finish(page: Page, displayName: string) {
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.goto("/jumps");
  await ready(page);
  const review = page.locator(".follow-up-review-sheet[open]");
  await review.getByRole("button", { name: `Mark sent for ${displayName}`, exact: true }).click();
  const question = page.locator("#follow-up-confirmations [data-mix-end]");
  // A click before the Beat's Journey choices have loaded asks for them first; this Beat has none.
  const saveOutcome = review.getByRole("group", { name: "Record journey outcome" }).getByRole("button", { name: "Save outcome", exact: true });
  await expect(question.or(saveOutcome)).toBeVisible();
  if (await saveOutcome.isVisible()) await saveOutcome.click();
  await expect(question).toContainText(`Estimate follow-up is finished for ${displayName}.`);
  return question;
}

async function audit(page: Page) {
  // Fades and the sheet's slide finish first, so contrast is measured on the settled colors.
  await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== "running"));
  expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]); }

test("finishing the last Beat of a Mix with nothing after it asks what's next, and No Mix needed answers it", async ({ page }) => {
  const { contactId, displayName } = await lastBeat("Casey");
  const question = await finish(page, displayName);
  await expect(question).toContainText("No Mix will remind you about them.");
  await expect(question).not.toContainText("one-time follow-up");
  await question.getByRole("button", { name: "What’s next?", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: `What’s next for ${displayName}` });
  await expect(sheet.getByRole("link", { name: "Schedule a one-time follow-up", exact: true })).toHaveAttribute("href", new RegExp(`people=${contactId}`));
  await Promise.all([page.waitForURL(/noMixNeeded=1/), sheet.getByRole("button", { name: "Mark No Mix needed", exact: true }).click()]);
  await expect(page.locator(".notice.success").filter({ hasText: "Marked No Mix needed." })).toBeVisible();
  await expect(page.locator("[data-mix-end]")).toHaveCount(0);
  expect((await prisma.contactRelationshipState.findUnique({ where: { contactId }, select: { noMixNeededAt: true } }))?.noMixNeededAt).toBeInstanceOf(Date);
  // Undo in the notice takes it back.
  await Promise.all([page.waitForURL(/noMixCleared=1/), page.getByRole("button", { name: "Undo", exact: true }).click()]);
  expect((await prisma.contactRelationshipState.findUnique({ where: { contactId }, select: { noMixNeededAt: true } }))?.noMixNeededAt).toBeNull();
});

test("the question starts another Mix from a chosen day and comes back to Today", async ({ page }) => {
  const { contactId, displayName } = await lastBeat("Drew");
  const question = await finish(page, displayName);
  await question.getByRole("button", { name: "What’s next?", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: `What’s next for ${displayName}` });
  // The Mix that just finished isn't offered first.
  await expect(sheet.getByRole("combobox", { name: /^Choose a Mix/ })).toHaveValue(nurtureMixId);
  await Promise.all([page.waitForURL(/\/jumps\?mixAssigned=1/), sheet.getByRole("button", { name: "Start Mix", exact: true }).click()]);
  await expect(page.locator(".notice.success").filter({ hasText: "Start saved for" })).toContainText("Follow-ups are being prepared.");
  await expect(page.locator(".notice.success").getByRole("link", { name: "View person", exact: true })).toHaveAttribute("href", `/contacts/${contactId}`);
  expect(await prisma.mixAssignment.findUnique({ where: { assignmentKey: `${workspaceId}:${nurtureMixId}:${contactId}` }, select: { isActive: true } })).toEqual({ isActive: true });
});

test("Not now and Undo both leave the person as they were", async ({ page }) => {
  const first = await lastBeat("Emery");
  let question = await finish(page, first.displayName);
  await question.getByRole("button", { name: `Not now: leave ${first.displayName} as they are`, exact: true }).click();
  await expect(question).toHaveCount(0);
  expect(await prisma.contactRelationshipState.count({ where: { contactId: first.contactId, noMixNeededAt: { not: null } } })).toBe(0);

  const second = await lastBeat("Finley");
  question = await finish(page, second.displayName);
  await page.locator("#follow-up-confirmations [data-follow-up-undo]").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator("[data-mix-end]")).toHaveCount(0);
  expect(await prisma.jump.findUnique({ where: { id: second.jumpId }, select: { status: true } })).toEqual({ status: "PENDING" });
});

test("the question and the New contacts page pass the accessibility audit in both themes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Audited at desktop and phone widths in one project, as the sheet suites do.");
  test.setTimeout(240_000);
  const { displayName } = await lastBeat("Gray");
  const question = await finish(page, displayName);
  for (const colorScheme of ["light", "dark"] as const) { await applyRenderedTheme(page, colorScheme); await audit(page); }
  const close = question.getByRole("button", { name: `Not now: leave ${displayName} as they are`, exact: true });
  expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await question.getByRole("button", { name: "What’s next?", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: `What’s next for ${displayName}` });
  await expect(sheet).toBeVisible();
  for (const colorScheme of ["light", "dark"] as const) { await applyRenderedTheme(page, colorScheme); await audit(page); }
  // Keyboard: Escape closes the sheet back to its trigger, and Enter opens it again.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  const trigger = question.getByRole("button", { name: "What’s next?", exact: true });
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  // Enlarged text on phones: the question keeps a readable text column, its actions wrap below it, and the stack
  // scrolls inside the screen rather than growing past its top (LAY-01). No sideways scrolling either.
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const box = (await question.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect((await page.locator("#follow-up-confirmations").boundingBox())!.y).toBeGreaterThanOrEqual(0);
    expect((await question.locator(":scope > p").boundingBox())!.width).toBeGreaterThanOrEqual(viewport.width - 120);
    await trigger.scrollIntoViewIfNeeded();
    const action = (await trigger.boundingBox())!;
    expect(action.y).toBeGreaterThanOrEqual(0);
    expect(action.y + action.height).toBeLessThanOrEqual(viewport.height);
  }
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/settings/new-contacts");
    await expect(page.getByRole("heading", { name: "New contacts", exact: true, level: 1 })).toBeVisible();
    for (const colorScheme of ["light", "dark"] as const) { await applyRenderedTheme(page, colorScheme); await audit(page); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/settings/new-contacts"); await ready(page);
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

// The timed Undo for the same outcome comes before the question, on screen and in Tab order, and fits at 320px with
// 200% text (LAY-02, LAY-03, A11Y-02).
test("the 10-second Undo stays first and whole beside the question with enlarged text", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Checked once, at the narrowest phone width.");
  await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => { const style = document.createElement("style"); style.textContent = "html { font-size: 200% !important; }"; document.head.append(style); }));
  const { displayName } = await lastBeat("Jordan");
  await finish(page, displayName);
  await page.setViewportSize({ width: 320, height: 568 });
  const stack = page.locator("#follow-up-confirmations");
  expect(await stack.evaluate(element => [...element.querySelectorAll("[data-follow-up-undo], [data-mix-end]")].map(node => node.hasAttribute("data-mix-end") ? "question" : "undo"))).toEqual(["undo", "question"]);
  // The question keeps the raised card surface the other confirmations have, so nothing on Today shows through it (LAY-04).
  const surface = await stack.locator("[data-mix-end]").evaluate(card => { const style = getComputedStyle(card); return { background: style.backgroundColor, radius: style.borderTopLeftRadius, shadow: style.boxShadow }; });
  expect(surface.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(surface.radius).toBe("20px");
  expect(surface.shadow).not.toBe("none");
  const undo = stack.locator("[data-follow-up-undo]").getByRole("button", { name: "Undo", exact: true });
  const box = (await undo.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(568);
});

test("the New contacts setting preselects its Mix in Add a contact and Quick Add, and an import asks", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/settings");
  await ready(page);
  await Promise.all([page.waitForURL(/\/settings\/new-contacts$/), page.getByRole("link", { name: /^New contacts/ }).click()]);
  await page.getByRole("radio", { name: /Add them to a Mix/ }).check();
  await page.getByLabel("Mix for new contacts", { exact: true }).selectOption({ label: "Stay in touch" });
  await Promise.all([page.waitForURL(/saved=1/), page.getByRole("button", { name: "Save", exact: true }).click()]);
  await expect(page.locator(".notice.success").filter({ hasText: "New contacts setting saved." })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Add them to a Mix/ })).toBeChecked();

  // Add a contact: the follow-up starts ticked, with the setting's Mix chosen.
  await page.goto("/contacts/new");
  await ready(page);
  await expect(page.getByRole("checkbox", { name: /Schedule a follow-up now/ })).toBeChecked();
  await expect(page.locator("#followUpMixId")).toHaveValue(nurtureMixId);
  await expect(page.getByText("Chosen by your New contacts setting.")).toBeVisible();
  await page.getByLabel("First name", { exact: true }).fill(`Harper ${suffix}`);
  await page.getByLabel("Phone", { exact: true }).fill("(555) 010-0377");
  await Promise.all([page.waitForURL(/\/contacts\/[^/?]+\?created=1/), page.getByRole("button", { name: /^Save/ }).first().click()]);
  const harper = await prisma.contact.findFirstOrThrow({ where: { workspaceId, firstName: `Harper ${suffix}` }, select: { id: true } });
  expect(await prisma.mixAssignment.findUnique({ where: { assignmentKey: `${workspaceId}:${nurtureMixId}:${harper.id}` }, select: { isActive: true } })).toEqual({ isActive: true });

  // Quick Add offers the Mix for a new person, preselected, and names it in the receipt.
  await page.goto("/contacts");
  await ready(page);
  await page.getByRole("heading", { name: "Contacts", exact: true }).click(); await page.keyboard.press("n");
  await page.locator("#quick-add-capture").fill(`Met Indigo ${suffix} at the open house`);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const proposal = page.locator(".quick-add-proposal");
  await proposal.getByLabel("Name or search for someone", { exact: true }).fill(`Indigo ${suffix}`);
  await expect(proposal.getByRole("combobox", { name: /^Add to a Mix/ })).toHaveValue(nurtureMixId);
  await proposal.getByRole("button", { name: /^Save all/ }).click();
  await expect(page.getByText("Started Stay in touch.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Close Quick Add", exact: true }).click();

  // An import asks in its review, with the setting's Mix chosen, and the queued batch remembers the answer.
  await page.goto("/contacts/import");
  await ready(page);
  const choice = page.getByLabel("Add the 1 new person to a Mix", { exact: true });
  // The file is read once the page has hydrated; choose it again if the first choice came too early.
  await expect(async () => {
    await page.locator(".import-drop-zone input[type=file]").setInputFiles({ name: "people.csv", mimeType: "text/csv", buffer: Buffer.from(`First Name,Last Name,Email\nJules,${suffix},jules-${suffix}@example.test\n`) });
    await expect(choice).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  await expect(choice).toHaveValue(nurtureMixId);
  await choice.selectOption("");
  await expect(page.getByText("They’ll show as No Mix until you choose one.")).toBeVisible();
  await choice.selectOption(estimateMixId);
  await page.getByRole("button", { name: "Queue 1 valid row", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Import is running|Import results/ })).toBeVisible();
  const batch = await prisma.contactImportBatch.findFirstOrThrow({ where: { workspaceId }, orderBy: { createdAt: "desc" }, select: { payload: true } });
  expect((batch.payload as { mixId?: string }).mixId).toBe(estimateMixId);
  await prisma.workspacePreference.update({ where: { workspaceId }, data: { newContactPlacement: "NONE", newContactMixId: null } });
});

test("Add a contact and Quick Add open as each setting means, and a stage's Mix is never preselected over (UX-01, PLC-01)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const preference = (data: { newContactPlacement: "NONE" | "MIX" | "ASK"; newContactMixId?: string | null }) => prisma.workspacePreference.upsert({ where: { workspaceId }, create: { workspaceId, ...data }, update: data });
  const scheduled = page.getByRole("checkbox", { name: /Schedule a follow-up now/ });
  // Leave them out: as before the setting, the follow-up opens unticked.
  await preference({ newContactPlacement: "NONE", newContactMixId: null });
  await page.goto("/contacts/new"); await ready(page);
  await expect(scheduled).not.toBeChecked();
  // Ask each time: ticked for today, with no Mix chosen, as Quick Add and imports open.
  await preference({ newContactPlacement: "ASK", newContactMixId: null });
  await page.goto("/contacts/new"); await ready(page);
  await expect(scheduled).toBeChecked();
  await expect(page.locator("#followUpMixId")).toHaveValue("");
  await page.goto("/contacts"); await ready(page);
  await page.getByRole("heading", { name: "Contacts", exact: true }).click(); await page.keyboard.press("n");
  await page.locator("#quick-add-capture").fill(`Met Kit ${suffix} at the open house`);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const proposal = page.locator(".quick-add-proposal");
  await proposal.getByLabel("Name or search for someone", { exact: true }).fill(`Kit ${suffix}`);
  await expect(proposal.getByRole("combobox", { name: /^Add to a Mix/ })).toHaveValue("");
  await page.getByRole("button", { name: "Close Quick Add", exact: true }).click();
  await page.getByRole("dialog", { name: "Discard this Quick Add draft?" }).getByRole("button", { name: "Discard draft", exact: true }).click();

  // A Contact stage that starts its own Mix: the setting's Mix isn't preselected on top of it, and the form says so.
  await preference({ newContactPlacement: "MIX", newContactMixId: nurtureMixId });
  await prisma.journeyPreference.create({ data: { workspaceId } });
  const stage = await prisma.journeyStage.create({ data: { workspaceId, name: "Lead", position: 0, planId: estimateMixId } });
  try {
    await page.goto("/contacts/new"); await ready(page);
    await expect(scheduled).not.toBeChecked();
    await scheduled.check();
    await expect(page.locator("#followUpMixId")).toHaveValue("");
    await expect(page.getByText("Your Lead stage starts Estimate follow-up for new people.")).toBeVisible();
  } finally {
    await prisma.journeyStage.delete({ where: { id: stage.id } });
    await prisma.journeyPreference.delete({ where: { workspaceId } });
    await preference({ newContactPlacement: "NONE", newContactMixId: null });
  }
});

test("each lead connection can choose its own Mix for new people", async ({ page }) => {
  const connection = await prisma.intakeConnection.create({ data: { workspaceId, name: `Website ${suffix}`, kind: "HOSTED_FORM", tokenHash: randomUUID(), tokenEncrypted: "unused" } });
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/settings/connections?selected=${connection.id}`);
    await ready(page);
    const setup = page.locator("details.connection-setup[open]");
    const select = setup.getByLabel("New people from this connection", { exact: true });
    await expect(select).toHaveValue("");
    await expect(select.locator("option").first()).toHaveText("Follow your New contacts setting (No Mix)");
    await select.selectOption({ label: "Add them to Stay in touch" });
    await Promise.all([page.waitForURL(/saved=1/), setup.getByRole("button", { name: "Save for this connection", exact: true }).click()]);
    expect(await prisma.intakeConnection.findUnique({ where: { id: connection.id }, select: { newContactPlacement: true, newContactMixId: true } })).toEqual({ newContactPlacement: "MIX", newContactMixId: nurtureMixId });
  } finally {
    await prisma.intakeConnection.delete({ where: { id: connection.id } });
  }
});
