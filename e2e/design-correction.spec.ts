import { createHash, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "../src/lib/prisma";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
test.skip(!local, "Disposable local database only");
test.setTimeout(90_000);
let workspaceId: string, userId: string, contactId: string, otherId: string, stageId: string, mixId: string, jumpId: string;
const token = randomUUID();
test.beforeAll(async () => {
  const suffix = randomUUID();
  userId = (await prisma.user.create({ data: { email: `design-correction-${suffix}@example.test`, name: "Design fixture", passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: `design-${suffix}`, name: "Design fixture", members: { create: { userId } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  stageId = (await prisma.journeyStage.create({ data: { workspaceId, name: "Lead", position: 0 } })).id;
  contactId = (await prisma.contact.create({ data: { workspaceId, displayName: "Ava Zoom", firstName: "Ava", lastName: "Zoom", publicNotes: "Discuss the renovation.", phones: { create: { phone: "+15550100200", normalized: "+15550100200", isPrimary: true } }, journey: { create: { workspaceId, stageId } } } })).id;
  otherId = (await prisma.contact.create({ data: { workspaceId, displayName: "Ben Able", firstName: "Ben", lastName: "Able", journey: { create: { workspaceId, stageId } } } })).id;
  const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "A quick hello", channel: "SMS" } });
  const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Hi {{First Name}}, shall we catch up?" } });
  const mix = await prisma.mix.create({ data: { workspaceId, name: "Stay in touch", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: { stepVersionId: version.id, dayOffset: 0, sortOrder: 1 } }, assignments: { create: { workspaceId, contactId, assignmentKey: suffix } } }, include: { steps: true } }); mixId = mix.id;
  jumpId = (await prisma.jump.create({ data: { workspaceId, contactId, mixId, mixStepId: mix.steps[0].id, stepVersionId: version.id, scheduledAt: new Date(Date.now() - 86_400_000), uniquenessKey: suffix, reason: "A quick hello", templateSnapshot: { channel: "SMS", body: version.body }, renderedSnapshot: { body: "Hi Ava, shall we catch up?" } } })).id;
});
test.beforeEach(async ({ context }) => { await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]); });
test.afterAll(async () => { if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } }); if (userId) await prisma.user.deleteMany({ where: { id: userId } }); });

test("desktop contact selection keeps the directory and opens the chosen profile", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.goto(`/contacts?person=${contactId}`);
  const selected = page.getByRole("region", { name: "Selected contact", exact: true });
  await expect(selected.getByRole("heading", { name: "Ava Zoom", exact: true })).toBeVisible();
  await page.locator(".contact-main").filter({ hasText: "Ben Able" }).click();
  await expect(page).toHaveURL(new RegExp(`person=${otherId}`));
  await expect(selected.getByRole("heading", { name: "Ben Able", exact: true })).toBeVisible();
  await expect(page.locator(".contacts-directory")).toBeVisible();
  await page.goBack(); await expect(selected.getByRole("heading", { name: "Ava Zoom", exact: true })).toBeVisible();
  await selected.getByRole("link", { name: "Review", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`jump=${jumpId}`));
});

test("phone directory sorts by last name and opens a full contact", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/contacts");
  await page.locator(".contact-list-summary").getByLabel("Sort contacts").selectOption("last-name");
  await expect(page.locator(".contact-main h3").first()).toHaveText("Ben Able");
  await expect(page.locator(".contact-select-row").first()).toBeVisible();
  expect((await page.locator(".contact-select-row").first().boundingBox())!.height).toBeLessThan(115);
  await page.locator(".contact-main").filter({ hasText: "Ava Zoom" }).click();
  await expect(page).toHaveURL(new RegExp(`/contacts/${contactId}$`));
  await expect(page.getByRole("heading", { name: "Details", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Note", exact: true }).click();
  await expect(page.locator("#add-note textarea")).toBeFocused();
  await page.locator("#add-note textarea").fill("Remember the preferred appointment time.");
  await page.locator("#add-note").getByRole("button", { name: "Add update" }).click();
  await expect(page.getByText("Remember the preferred appointment time.", { exact: true })).toBeVisible();
});

test("portrait tablet keeps the draft beside the queue and phone reflow retains edits", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 }); await page.goto("/jumps");
  const panel = page.locator(".follow-up-review-sheet[open]"); const field = panel.getByRole("textbox", { name: "Your message", exact: true });
  await expect(field).toBeEnabled(); await field.fill("Hi Ava, checking in about your plans.");
  await expect.poll(() => panel.evaluate(node => node.matches(":modal"))).toBe(false);
  const queue = await page.locator(".jump-task-card").first().boundingBox(); const review = await panel.boundingBox();
  expect(queue!.width).toBeGreaterThan(280); expect(review!.x).toBeGreaterThan(queue!.x + queue!.width);
  await expect(panel.getByRole("button", { name: "Email", exact: true })).toBeDisabled();
  const channelIcon = await panel.getByRole("button", { name: "Email", exact: true }).locator("svg").boundingBox();
  expect(channelIcon!.width).toBeLessThanOrEqual(24); expect(channelIcon!.height).toBeLessThanOrEqual(24);
  await page.setViewportSize({ width: 390, height: 844 }); await expect.poll(() => panel.evaluate(node => node.matches(":modal"))).toBe(true);
  await expect(field).toHaveValue("Hi Ava, checking in about your plans.");
  await page.setViewportSize({ width: 1920, height: 1080 }); await expect.poll(() => panel.evaluate(node => node.matches(":modal"))).toBe(false);
  await expect(field).toHaveValue("Hi Ava, checking in about your plans.");
  await expect(page.getByRole("heading", { name: "Overdue", exact: true })).toBeVisible();
});

test("Today shows horizontal Beats from the selected occurrence and one continuous draft surface", async ({ page }) => {
  const focus = await prisma.jump.findUniqueOrThrow({ where: { id: jumpId } });
  const base = focus.scheduledAt;
  const dateAt = (days: number) => new Date(base.getTime() + days * 86_400_000);
  const step = await prisma.mixStep.create({ data: { mixId, stepVersionId: focus.stepVersionId, dayOffset: 7, sortOrder: 2 } });
  const ids: string[] = [];
  try {
    await prisma.jump.update({ where: { id: jumpId }, data: { templateSnapshot: { channel: "SMS", body: "Hi {{First Name}}, shall we catch up?", originalLocalDate: base.toISOString().slice(0, 10) } } });
    for (const days of [7, 37]) {
      ids.push((await prisma.jump.create({ data: { workspaceId, contactId, mixId, mixStepId: step.id, stepVersionId: focus.stepVersionId,
        scheduledAt: dateAt(days), uniquenessKey: randomUUID(), reason: days === 7 ? "Same occurrence" : "Separate occurrence",
        templateSnapshot: { channel: "SMS", body: "Hello again", originalLocalDate: dateAt(days).toISOString().slice(0, 10) }, renderedSnapshot: { body: "Hello again" }
      } })).id);
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/jumps?jump=${jumpId}&range=all`);
    const panel = page.locator(".follow-up-review-sheet[open]");
    const beats = panel.getByRole("list", { name: "Follow-up dates in this Mix" }).getByRole("link");
    await expect(beats).toHaveCount(2);
    await expect(beats.nth(1)).toHaveAttribute("href", new RegExp(`jump=${ids[0]}`));
    for (const width of [1920, 834, 390]) {
      await page.setViewportSize({ width, height: 1080 });
      const first = await beats.nth(0).boundingBox(), second = await beats.nth(1).boundingBox();
      expect(Math.abs(first!.y - second!.y)).toBeLessThan(2);
      expect(second!.x).toBeGreaterThan(first!.x);
      expect(first!.height).toBeGreaterThanOrEqual(44);
      await expect(panel.getByRole("textbox", { name: "Your message", exact: true })).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    }
    await beats.nth(1).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`jump=${ids[0]}`));
  } finally {
    await prisma.jump.deleteMany({ where: { id: { in: ids } } });
    await prisma.mixStep.delete({ where: { id: step.id } });
    await prisma.jump.update({ where: { id: jumpId }, data: { templateSnapshot: focus.templateSnapshot! } });
  }
});

test("completion shows a floating confirmation and Undo restores the pending follow-up", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 }); await page.goto("/jumps");
  await page.locator(".follow-up-review-sheet[open]").getByRole("button", { name: "Mark sent for Ava Zoom", exact: true }).click();
  const confirmation = page.locator("#follow-up-confirmations [data-follow-up-undo]");
  await expect(confirmation).toBeVisible(); expect(await prisma.jump.findUnique({ where: { id: jumpId }, select: { status: true } })).toEqual({ status: "DONE" });
  await confirmation.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(confirmation).toHaveCount(0); expect(await prisma.jump.findUnique({ where: { id: jumpId }, select: { status: true } })).toEqual({ status: "PENDING" });
});

test("Mix library exposes editable Beats, real membership, and mobile library tabs", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.goto(`/mixes?mix=${mixId}`);
  // The Mix workspace previews each Beat's wording with readable merge fields; editing is under Edit.
  const selected = page.getByRole("region", { name: "Selected Mix", exact: true });
  await expect(selected.getByText(", shall we catch up?")).toBeVisible();
  await expect(selected.getByTitle("Filled in from the person or your business details when you send; blank when that detail is missing", { exact: true }).filter({ hasText: "First Name" }).first()).toBeVisible();
  await expect(selected.getByRole("link", { name: "Edit", exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "People and Journey connections", exact: true })).toContainText("Ava Zoom");
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/mixes");
  await expect(page.locator(".mix-library-tabs").getByRole("link", { name: "Marketplace", exact: true })).toBeVisible();
});

test("Quick Add shortcut avoids typing fields and saves corrected proposals together", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.goto("/jumps");
  await expect(page.locator(".follow-up-review-sheet[open]")).toBeVisible();
  await page.getByRole("heading", { name: "Today", exact: true, level: 1 }).click(); await page.keyboard.press("n");
  await expect(page.locator(".quick-add-dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close Quick Add", exact: true }).click();
  await page.setViewportSize({ width: 1194, height: 834 }); await page.goto("/contacts");
  await page.getByRole("searchbox", { name: "Search contacts" }).fill("n"); await expect(page.locator(".quick-add-dialog")).not.toBeVisible();
  await page.getByRole("heading", { name: "Contacts", exact: true }).click(); await page.keyboard.press("n"); await expect(page.locator(".quick-add-dialog")).toBeVisible();
  await page.locator("#quick-add-capture").fill("Text Morgan Friday about the estimate"); await page.getByRole("button", { name: "Continue", exact: true }).click();
  const proposal = page.locator(".quick-add-proposal"); await expect(proposal.locator("blockquote")).toContainText("Text Morgan Friday");
  await proposal.getByLabel("Name or search for someone", { exact: true }).fill("Morgan Reed"); await proposal.getByLabel("Reason", { exact: true }).fill("Review the revised estimate");
  await proposal.getByLabel("Follow-up time", { exact: true }).fill("10:00");
  await proposal.getByLabel("Draft message", { exact: true }).fill("Hi Morgan, shall we review the revised estimate?");
  await proposal.getByRole("button", { name: "Save all 3", exact: true }).click();
  await expect(page.getByText("Saved together", { exact: true })).toBeVisible();
  const saved = await prisma.contact.findFirstOrThrow({ where: { workspaceId, displayName: "Morgan Reed" } });
  expect(await prisma.jump.count({ where: { contactId: saved.id, reason: "Review the revised estimate", manualOnly: true } })).toBe(1);
});

test("More keeps compact destinations reachable and secondary navigation tracks the current page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/more");
  const destinations = page.locator(".more-destination .settings-hub-card");
  await expect(destinations).toHaveCount(8);
  await expect(destinations.first()).toBeVisible();
  for (const destination of await destinations.all()) {
    const bounds = await destination.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeLessThanOrEqual(60);
  }
  await expect(page.locator(".more-page").getByRole("switch", { name: "Dark mode", exact: true })).toBeInViewport();
  await expect(page.locator(".more-sign-out button")).toBeInViewport();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/settings/business");
  const navigation = page.getByRole("navigation", { name: "Account and help" });
  await expect(navigation.locator('[aria-current="page"]')).toHaveText("Settings");
  await navigation.getByRole("link", { name: "My account", exact: true }).click();
  await expect(navigation.locator('[aria-current="page"]')).toHaveText("My account");
  await navigation.getByRole("link", { name: "Help", exact: true }).click();
  await expect(navigation.locator('[aria-current="page"]')).toHaveText("Help");
  // Journey is the three-pane workflow map (6c8927d); phones and tablets switch panes instead of an options menu.
  for (const width of [390, 834]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1194 });
    await page.goto("/journey");
    const panes = page.getByRole("navigation", { name: "Journey workspace panels", exact: true });
    await expect(panes).toBeVisible();
    await panes.getByRole("button", { name: "People", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Journey", exact: true, level: 1 })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});

test("Calendar saves a selected person's event and opens it for editing from the phone agenda", async ({ page }) => {
  const date = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`/calendar?contact=${contactId}&date=${date}&new=1`);
  const editor = page.locator(".calendar-editor-panel");
  await editor.getByLabel("Title", { exact: true }).fill("Renovation planning visit");
  await editor.getByRole("button", { name: "Save event", exact: true }).click();
  await expect.poll(() => prisma.calendarEntry.count({ where: { workspaceId, title: "Renovation planning visit", contactId } })).toBe(1);
  await page.goto(`/calendar?date=${date}`);
  await expect(editor.getByLabel("Title", { exact: true })).toHaveValue("Renovation planning visit");
  await expect(page.locator(".calendar-contact-context")).toContainText("Ava Zoom");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(editor).not.toBeVisible();
  await page.locator(".calendar-event").getByRole("link", { name: "Renovation planning visit", exact: true }).click();
  await expect(editor).toBeVisible();
  await editor.getByLabel("Title", { exact: true }).fill("Revised planning visit");
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(() => prisma.calendarEntry.count({ where: { workspaceId, title: "Revised planning visit", contactId, version: 2 } })).toBe(1);
});

test("short laptop rails keep account controls reachable by keyboard", async ({ page }) => {
  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 600 });
    await page.goto("/contacts");
    const rail = page.locator(".sidebar");
    const quickAdd = rail.getByRole("button", { name: "Quick Add", exact: true });
    const profile = rail.getByRole("button", { name: "Profile", exact: true });
    await quickAdd.focus();
    // Follow the real tab order so the browser must reveal each focused control.
    for (let step = 0; step < 20; step++) {
      if (await profile.evaluate(node => node === document.activeElement)) break;
      await page.keyboard.press("Tab");
    }
    await expect(profile).toBeFocused();
    await expect(profile).toBeInViewport({ ratio: 1 });
    expect(await rail.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Profile and settings", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(profile).toBeFocused();
    await expect(profile).toBeInViewport({ ratio: 1 });
  }
});

test("phone review keeps send and outcome controls visible together in either theme", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto(`/jumps?jump=${jumpId}&range=all`);
    const review = page.locator(".follow-up-review-sheet[open]");
    await expect(review).toBeVisible();
    const send = review.getByRole("link", { name: "Open text for Ava Zoom" });
    const done = review.getByRole("button", { name: "Mark sent for Ava Zoom" });
    for (const control of [send, done, review.getByRole("button", { name: "Snooze", exact: true }), review.getByRole("button", { name: "Skip Beat", exact: true })]) {
      await expect(control).toBeInViewport({ ratio: 1 });
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    expect((await send.boundingBox())!.width).toBeGreaterThan(200);
    await review.getByRole("button", { name: "Snooze", exact: true }).click();
    const snooze = page.getByRole("dialog", { name: "Snooze follow-up", exact: true });
    await expect(snooze).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(snooze).not.toBeVisible();
    await expect(review.getByRole("button", { name: "Snooze", exact: true })).toBeFocused();
  }
});

test("inline Mix Beat names and hidden options survive saving", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`/mixes/${mixId}/edit`);
  const form = page.locator(".mix-editor-form");
  const beat = form.getByRole("group", { name: "Beat 1", exact: true });
  await expect(beat.getByLabel("Beat name", { exact: true })).toHaveValue("A quick hello");
  await beat.getByLabel("Beat name", { exact: true }).fill("Check the renovation plans");
  await beat.getByLabel("Options for Beat 1", { exact: true }).click();
  await beat.locator("[data-beat-alternatives] > summary").click();
  await beat.getByRole("textbox", { name: /^Call version · talking points for you/ }).fill("Ask about the next renovation milestone.");
  await beat.getByLabel("Options for Beat 1", { exact: true }).click();
  await form.locator(".mix-start-settings > summary").click();
  await form.getByRole("combobox", { name: "After saving", exact: true }).selectOption("PAUSED");
  await form.getByRole("button", { name: "Save Mix", exact: true }).click();
  await expect(page).toHaveURL(/updated=manual/);
  const saved = await prisma.mixStep.findFirstOrThrow({ where: { mixId, isActive: true }, include: { stepVersion: { include: { stepTemplate: true, variants: true } } }, orderBy: { sortOrder: "asc" } });
  expect(saved.stepVersion.stepTemplate.name).toBe("Check the renovation plans");
  expect(saved.stepVersion.variants.find(item => item.family === "CALL")?.script).toBe("Ask about the next renovation milestone.");
});

test("saving wording in a Mix that is on asks nothing when the save starts no one (TRU-02)", async ({ page }) => {
  await prisma.mix.update({ where: { id: mixId }, data: { status: "ACTIVE" } });
  await prisma.userPreference.update({ where: { userId }, data: { reviewMixActivation: true } });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/mixes/${mixId}/edit`);
  const form = page.locator(".mix-editor-form");
  await form.getByRole("group", { name: "Beat 1", exact: true }).getByRole("textbox", { name: "Message", exact: true }).fill("Hi {{First Name}}, how are the renovation plans going?");
  await expect(form.getByText("You’ll review who gets this Mix before activating.")).toHaveCount(0);
  await form.getByRole("button", { name: "Save Mix", exact: true }).click();
  await expect(page).toHaveURL(/updated=manual/);
  expect((await prisma.mix.findUniqueOrThrow({ where: { id: mixId } })).status).toBe("ACTIVE");
  const saved = await prisma.mixStep.findFirstOrThrow({ where: { mixId, isActive: true }, include: { stepVersion: true }, orderBy: { sortOrder: "asc" } });
  expect(saved.stepVersion.body).toBe("Hi {{First Name}}, how are the renovation plans going?");
});

test("with activate-on-save, adding a tag to a Mix that is on is a plain save that says it starts them (MIX-01)", async ({ page }) => {
  await prisma.mix.update({ where: { id: mixId }, data: { status: "ACTIVE" } });
  await prisma.userPreference.update({ where: { userId }, data: { reviewMixActivation: false } });
  const tag = await prisma.group.create({ data: { workspaceId, name: "Renovation clients" } });
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/mixes/${mixId}/edit`);
    await page.locator(".mix-start-settings > summary").click();
    await page.getByRole("checkbox", { name: /Renovation clients/ }).check();
    await expect(page.getByText("Saving starts this Mix for the people it adds, using your sending settings.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Review first", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Review and save", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Save Mix", exact: true }).click();
    await expect(page).toHaveURL(/updated=manual/);
    expect(await prisma.mixAssignment.count({ where: { mixId, groupId: tag.id, isActive: true } })).toBe(1);
  } finally {
    await prisma.mixAssignment.deleteMany({ where: { mixId, groupId: tag.id } });
    await prisma.group.delete({ where: { id: tag.id } });
    await prisma.userPreference.update({ where: { userId }, data: { reviewMixActivation: true } });
  }
});

test("turning a paused Mix back on reviews what resuming does and needs no audience (MIX-02)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const resume = async (id: string) => {
    await page.goto(`/mixes/${id}/edit`);
    await page.locator(".mix-start-settings > summary").click();
    await page.getByRole("combobox", { name: "After saving", exact: true }).selectOption("ACTIVE");
    await page.getByRole("button", { name: "Review and turn on", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Turn this Mix back on?", exact: true });
    await expect(dialog).toContainText("Turning it back on brings back the follow-ups it held for the people in it.");
    await expect(dialog).not.toContainText("No one is enrolled yet");
    await expect(dialog).not.toContainText("Choose who gets this Mix.");
    await dialog.getByRole("button", { name: "Turn it back on", exact: true }).click();
    await expect(page).toHaveURL(/updated=manual/);
    expect((await prisma.mix.findUniqueOrThrow({ where: { id } })).status).toBe("ACTIVE");
  };
  // A Mix started for one person at a time.
  await prisma.mix.update({ where: { id: mixId }, data: { status: "PAUSED" } });
  await resume(mixId);
  // A date-based Mix whose people were started one at a time, with no audience of its own.
  const dateType = await prisma.dateType.create({ data: { workspaceId, scopeKey: workspaceId, name: "Move-in", slug: `move-in-${randomUUID()}` } });
  const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Moving day", channel: "SMS" } });
  const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Happy moving day, {{First Name}}!" } });
  const dated = await prisma.mix.create({ data: { workspaceId, name: "Moving day", status: "PAUSED", triggerMode: "DATE_TRIGGERED", dateTypeId: dateType.id, steps: { create: { stepVersionId: version.id, dayOffset: 0, sortOrder: 1 } } } });
  await resume(dated.id);
});

test("a Mix whose date type was turned off says so and reviews the change of date (MIX-05)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await prisma.userPreference.update({ where: { userId }, data: { reviewMixActivation: true } });
  const off = await prisma.dateType.create({ data: { workspaceId, scopeKey: workspaceId, name: "Lease renewal", slug: `lease-${randomUUID()}`, isActive: false } });
  const tag = await prisma.group.create({ data: { workspaceId, name: `Tenants ${randomUUID()}` } });
  const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Renewal reminder", channel: "SMS" } });
  const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Your lease renews soon, {{First Name}}." } });
  const leases = await prisma.mix.create({ data: { workspaceId, name: "Lease reminders", status: "ACTIVE", triggerMode: "DATE_TRIGGERED", dateTypeId: off.id, steps: { create: { stepVersionId: version.id, dayOffset: 0, sortOrder: 1 } } } });
  await prisma.mixAssignment.create({ data: { workspaceId, mixId: leases.id, groupId: tag.id, mode: "DYNAMIC", assignmentKey: `${workspaceId}:${leases.id}:group:${tag.id}` } });
  await page.goto(`/mixes/${leases.id}/edit`);
  await page.locator(".mix-start-settings > summary").click();
  await expect(page.getByText("The date this Mix used is turned off. Choose another date, or turn it back on in Date types.", { exact: true })).toBeVisible();
  // The form will save another date, so the save is a reschedule and is reviewed, as the server requires.
  await page.getByRole("button", { name: "Review and save", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Save these changes?", exact: true })).toContainText("Changing when this Mix starts reschedules everyone it covers.");
});

test("short-phone activation dialog keeps both decisions inside its scroll boundary", async ({ page }) => {
  // Turning a Mix on opens the review; a save on one already on that starts no one doesn't (TRU-02).
  await prisma.mix.update({ where: { id: mixId }, data: { status: "DRAFT" } });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(`/mixes/${mixId}/edit`);
  await page.locator(".mix-start-settings > summary").click();
  await page.getByRole("combobox", { name: "After saving", exact: true }).selectOption("ACTIVE");
  await page.getByRole("button", { name: "Review and start", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Start this Mix?", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Keep editing", exact: true })).toBeInViewport({ ratio: 1 });
  await expect(dialog.getByRole("button", { name: "Start the Mix", exact: true })).toBeInViewport({ ratio: 1 });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Review and start", exact: true })).toBeFocused();
});

test("expanded Journey stage actions stay reachable on a narrow phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 }); await page.goto(`/settings/journey?stage=${stageId}`);
  const stage = page.locator(`#stage-${stageId}`);
  await expect(stage).toHaveAttribute("open", "");
  // Only visible actions count; "Retire stage" confirms in the app dialog, whose buttons stay hidden until asked.
  const actions = stage.locator(":scope > form > .form-actions button:visible");
  await expect(actions).toHaveCount(4);
  // A stage with people in it can't be retired, so Retire is disabled and says what to do first (TRU-12).
  const retire = stage.getByRole("button", { name: "Retire empty stage…", exact: true });
  await expect(retire).toBeDisabled();
  await expect(retire).toHaveAccessibleDescription("Move the 2 people in this stage to another stage first.");
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const action of await actions.all()) {
      await action.scrollIntoViewIfNeeded();
      const bounds = (await action.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(await action.evaluate(element => { const r = element.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return hit === element || element.contains(hit); })).toBe(true);
    }
  }
});
