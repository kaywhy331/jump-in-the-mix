import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { installMegaMix } from "../src/lib/mega-mix-service";
import { initialJourneySetup } from "../src/lib/journey-preferences";
import { processWorkflowInstance, startWorkflowInstance, workflowState } from "../src/lib/mix-workflow";
import { axeInPage } from "./axe-in-page";

const out = ".artifacts/contractor-ux-implementation-20260922";
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Disposable local fixtures only.");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block", actionTimeout: 15000 });
test.setTimeout(240000);
let workspaceId: string, userId: string; const errors: string[] = [];
test.beforeEach(async ({ page, context }) => {
  errors.length = 0; page.on("pageerror", error => errors.push(error.message));
  userId = (await prisma.user.create({ data: { name: "Casey", email: `contractor-ui-${randomUUID()}@example.invalid`, emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Casey’s workshop", slug: randomUUID(), members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: false } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  const token = randomUUID(); await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000) } });
  await context.addCookies([{ name: "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, sameSite: "Strict" }]);
  await mkdir(out, { recursive: true });
});
test.afterEach(async () => { await prisma.workspace.deleteMany({ where: { id: workspaceId } }); await prisma.user.deleteMany({ where: { id: userId } }); expect(errors).toEqual([]); });
async function prepare() {
  await installMegaMix({ workspaceId, actorUserId: userId, blueprintId: "contractor", expectedVersion: 1, setup: initialJourneySetup(null, "UTC") });
  await prisma.workspaceProfile.update({ where: { workspaceId }, data: { onboardingDone: true } });
  const mix = await prisma.mix.findFirstOrThrow({ where: { workspaceId, name: "Estimate follow-up" } });
  const person = await prisma.contact.create({ data: { workspaceId, displayName: "Jordan Contractor", firstName: "Jordan", phones: { create: { phone: "+15555550123", normalized: "+15555550123", isPrimary: true } } } });
  return { mix, person };
}
async function settle(instanceId: string, now = new Date()) {
  await processWorkflowInstance(workspaceId, instanceId, now);
  await prisma.job.updateMany({ where: { workspaceId, task: { in: ["mix-workflow", "generate-jumps"] }, completedAt: null }, data: { completedAt: new Date() } });
}

test("setup alternatives and finish later retain answers without installing unrelated work", async ({ page }) => {
  await page.goto("/onboarding");
  await expect(page.getByRole("radio", { name: /^One person and one follow-up · Recommended/ })).toBeChecked();
  await page.getByRole("radio", { name: /A complete Mega-Mix/ }).check();
  await page.getByLabel("Preferred communication", { exact: true }).selectOption("EMAIL");
  await page.getByLabel("Space between follow-ups", { exact: true }).selectOption("RELAXED");
  await page.getByRole("button", { name: "Save answers and finish later", exact: true }).click();
  await expect(page).toHaveURL(/jumps\?setupLater=1/);
  await expect(page.getByText("Your setup answers are saved.", { exact: false })).toBeVisible();
  expect(await prisma.mix.count({ where: { workspaceId } })).toBe(0);
  expect(await prisma.contact.count({ where: { workspaceId } })).toBe(0);
  await page.getByRole("link", { name: "Return to setup", exact: true }).click();
  // Saved answers reopen the route they were saved from, not the recommended default.
  await expect(page.getByRole("radio", { name: /A complete Mega-Mix/ })).toBeChecked();
  await expect(page.getByLabel("Preferred communication", { exact: true })).toHaveValue("EMAIL");
  await expect(page.getByLabel("Space between follow-ups", { exact: true })).toHaveValue("RELAXED");
  await page.getByRole("radio", { name: /^One person and one follow-up/ }).check();
  await expect(page.getByRole("checkbox", { name: /Personal connections/ })).toBeVisible();
});

test("chosen work survives adding a person and exposes its actual first follow-up", async ({ page }) => {
  const { mix } = await prepare();
  await page.goto(`/journey?mix=${mix.id}&start=1`);
  await page.getByLabel("Work label (optional)", { exact: true }).fill("Kitchen estimate");
  await page.getByRole("link", { name: "Add a person", exact: true }).click();
  await expect(page).toHaveURL(/contacts\/new\?returnTo=/);
  await page.locator('input[name="firstName"]').fill("Morgan");
  await page.locator('input[name="lastName"]').fill("Newperson");
  await page.getByRole("button", { name: "Save contact", exact: true }).click();
  await expect(page).toHaveURL(/journey\?/);
  await expect(page.getByLabel("Work label (optional)", { exact: true })).toHaveValue("Kitchen estimate");
  await expect(page.getByRole("list", { name: "Schedule before starting" })).toBeVisible();
  expect(await prisma.mixWorkflowInstance.count({ where: { workspaceId } })).toBe(0);
  await page.getByRole("button", { name: "Start this Mix", exact: true }).click();
  await expect(page.getByRole("link", { name: "Set up reminders for me (optional)" }).first()).toBeVisible();
  const instance = await prisma.mixWorkflowInstance.findFirstOrThrow({ where: { workspaceId, label: "Kitchen estimate" } });
  await settle(instance.id); await page.reload();
  await expect(page).toHaveURL(new RegExp(`work=${instance.id}`));
  const first = await prisma.jump.findFirstOrThrow({ where: { workflowInstanceId: instance.id }, orderBy: { scheduledAt: "asc" } });
  const review = page.locator(`a[href*="jump=${first.id}"]`).first(); await expect(review).toBeVisible(); await review.click();
  await expect(page).toHaveURL(new RegExp(`jump=${first.id}`));
  await expect(page.locator(`[data-jump-workflow="${first.id}"]`).first()).toBeVisible();
});

test("an early accepted estimate ends old reminders and continues only that work", async ({ page }) => {
  const { mix, person } = await prepare(), start = new Date(Date.now() - 86400000);
  const id = await startWorkflowInstance({ workspaceId, contactId: person.id, mixId: mix.id, requestId: randomUUID(), now: start, label: "Kitchen estimate" });
  const independent = await startWorkflowInstance({ workspaceId, contactId: person.id, mixId: mix.id, requestId: randomUUID(), now: start, label: "Garage estimate" });
  await settle(id, start); await settle(independent, start);
  const first = await prisma.jump.findFirstOrThrow({ where: { workflowInstanceId: id }, orderBy: { scheduledAt: "asc" } });
  await prisma.jump.update({ where: { id: first.id }, data: { status: "DONE", completedAt: new Date(start.getTime() + 1000), completionMethod: "sent" } }); await settle(id);
  await page.goto(`/journey?contactId=${person.id}&work=${id}`);
  const card = page.locator("article").filter({ hasText: "Kitchen estimate" }).filter({ has: page.locator("summary", { hasText: "Record an update or choose a callback date" }) }).last();
  await card.getByText("Record an update or choose a callback date", { exact: true }).click();
  const choice = card.getByRole("combobox", { name: "What happened?", exact: true }); const accepted = await choice.locator("option").filter({ hasText: /^Estimate accepted/ }).getAttribute("value"); await choice.selectOption(accepted!);
  await card.getByRole("button", { name: "Review this update", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Save this update?" })).toContainText("3 pending follow-ups end");
  await page.screenshot({ path: `${out}/early-update-review-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "Save update", exact: true }).click();
  await expect.poll(async () => prisma.jump.count({ where: { workflowInstanceId: id, mixId: mix.id, status: "PENDING" } })).toBe(0);
  expect(await prisma.jump.count({ where: { workflowInstanceId: id, status: "DONE" } })).toBe(1);
  expect(await prisma.jump.count({ where: { workflowInstanceId: independent, status: "PENDING" } })).toBe(4);
  await settle(id, new Date(Date.now() + 11000));
  expect(await prisma.jump.count({ where: { workflowInstanceId: id, mixId: { not: mix.id }, status: "PENDING" } })).toBeGreaterThan(0);
});

test("a requested callback stays future, becomes one daily action, and can be corrected", async ({ page }) => {
  const { mix, person } = await prepare();
  const id = await startWorkflowInstance({ workspaceId, contactId: person.id, mixId: mix.id, requestId: randomUUID(), label: "Callback estimate" }); await settle(id);
  await page.goto(`/journey?contactId=${person.id}&work=${id}`);
  await page.getByText("Record an update or choose a callback date", { exact: true }).click();
  await page.getByRole("combobox", { name: "What happened?", exact: true }).selectOption("CUSTOMER");
  const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16); await page.getByLabel("Check-back date and time", { exact: true }).fill(future);
  await page.getByRole("button", { name: "Review this update", exact: true }).click();
  await page.getByRole("button", { name: "Save update", exact: true }).click();
  await expect.poll(async () => workflowState((await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id } })).state).commitments?.length).toBe(1);
  expect((await (await page.request.get(`/api/mix-workflow?contactId=${person.id}`)).json()).analytics.summary).toMatchObject({ waiting: 1, stopped: 0, current: 1 });
  await page.goto("/jumps"); await expect(page.getByText("Customer requested a callback", { exact: false })).toBeVisible();
  await expect(page.locator("#needs-your-input")).toBeHidden();
  const saved = await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id } }), state = workflowState(saved.state); state.commitments![0].dueAt = new Date(Date.now() - 60000).toISOString();
  await prisma.mixWorkflowInstance.update({ where: { id }, data: { state: JSON.parse(JSON.stringify(state)) } });
  expect((await (await page.request.get(`/api/mix-workflow?contactId=${person.id}`)).json()).analytics.summary).toMatchObject({ attention: 1, stopped: 0, current: 1 });
  await page.reload(); await expect(page.locator("#needs-your-input")).toContainText("callback time has arrived");
  await page.locator("#needs-your-input").getByRole("link", { name: "Record update", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`work=${id}`));
  await page.getByText("Record an update or choose a callback date", { exact: true }).click();
  await page.getByRole("combobox", { name: "What happened?", exact: true }).selectOption("OWNER");
  await page.getByLabel("Check-back date and time", { exact: true }).fill(future);
  await page.getByRole("button", { name: "Review this update", exact: true }).click(); await page.getByRole("button", { name: "Save update", exact: true }).click();
  await expect.poll(async () => workflowState((await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id } })).state).commitments?.filter(item => item.status === "OPEN").map(item => item.source)).toEqual(["OWNER"]);
});

test("future links ignore due filters and completed history is not an overdue obligation", async ({ page }) => {
  const { mix, person } = await prepare(); const id = await startWorkflowInstance({ workspaceId, contactId: person.id, mixId: mix.id, requestId: randomUUID() }); await settle(id);
  const jump = await prisma.jump.findFirstOrThrow({ where: { workflowInstanceId: id } });
  await prisma.jump.update({ where: { id: jump.id }, data: { scheduledAt: new Date(Date.now() + 90 * 86400000) } });
  await page.goto(`/jumps?jump=${jump.id}&range=due&status=done&q=does-not-match`);
  await expect(page.locator(`[data-jump-workflow="${jump.id}"]`).first()).toBeVisible();
  await prisma.jump.update({ where: { id: jump.id }, data: { scheduledAt: new Date(Date.now() - 90 * 86400000), completedAt: new Date(), status: "DONE" } });
  await page.reload(); await expect(page.locator("main")).toContainText("Originally due");
  await expect(page.locator(`[data-jump-workflow="${jump.id}"]`).first()).not.toContainText(/\d+ days overdue/);
});

test("changed screens retain themes, keyboard access and narrow-screen reflow", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop-chromium", "Viewport matrix runs once.");
  const { mix, person } = await prepare(); const id = await startWorkflowInstance({ workspaceId, contactId: person.id, mixId: mix.id, requestId: randomUUID() }); await settle(id);
  const current = await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id } });
  await processWorkflowInstance(workspaceId, id, new Date(), { requestId: randomUUID(), businessUpdate: { kind: "WAIT", runId: workflowState(current.state).runs[0].id, scope: "SOURCE_MIX_REMAINDER", source: "CUSTOMER", dueAt: new Date(Date.now() + 1000).toISOString(), timezone: "UTC" } });
  const report: unknown[] = [];
  async function waitForScreen(name: string) {
    const heading = page.getByRole("heading", { level: 1, name: name === "onboarding" ? "Jump in the mix." : name === "today" ? "Today" : name === "journey" ? "Journey" : "Help", exact: true, includeHidden: name === "journey" });
    if (name === "journey") await expect(heading).toBeAttached();
    else await expect(heading).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Checking your account…", exact: true })).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
  }
  for (const [name, url] of [["onboarding", "/onboarding"], ["today", "/jumps"], ["journey", `/journey?contactId=${person.id}&work=${id}`], ["help", "/help"]]) {
    await page.goto(url); await page.locator("h1").first().waitFor();
    for (const width of [390, 834, 1440]) for (const theme of ["light", "dark"] as const) {
      await page.goto(url); await waitForScreen(name); await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" }); await page.setViewportSize({ width, height: 1000 }); await page.evaluate(theme => { localStorage.setItem("jitm-appearance", theme); document.documentElement.dataset.theme = theme; }, theme); await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); expect(overflow, `${name}/${width}/${theme} overflow`).toBe(false);
      const { violations } = await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze(); expect(violations, `${name}/${width}/${theme} accessibility`).toEqual([]);
      await page.screenshot({ path: `${out}/${name}-${width}-${theme}.png`, fullPage: true }); report.push({ name, width, theme, overflow, violations });
      if (process.env.PLAYWRIGHT_BASELINE_URL) {
        await page.goto(process.env.PLAYWRIGHT_BASELINE_URL + url); await waitForScreen(name); await page.evaluate(theme => { localStorage.setItem("jitm-appearance", theme); document.documentElement.dataset.theme = theme; }, theme); await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: `${out}/before-${name}-${width}-${theme}.png`, fullPage: true });
      }
    }
  }
  await page.goto(`/journey?contactId=${person.id}&work=${id}`); await page.waitForLoadState("networkidle"); const toggle = page.locator("summary").filter({ hasText: "Record an update or choose a callback date" }); await toggle.focus(); await expect(toggle).toBeFocused(); await page.keyboard.press("Enter"); await expect(page.getByRole("combobox", { name: "What happened?", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "What happened?", exact: true }).selectOption("OWNER"); await page.getByLabel("Check-back date and time", { exact: true }).fill(new Date(Date.now() + 86400000).toISOString().slice(0,16)); await page.getByRole("button", { name: "Review this update", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Save this update?" }).getByRole("button", { name: "Keep editing", exact: true })).toBeFocused();
  for (const width of [390, 1440]) for (const theme of ["light", "dark"] as const) {
    await page.setViewportSize({ width, height: 1000 }); await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    const box = await page.getByRole("dialog", { name: "Save this update?" }).boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.width).toBeLessThanOrEqual(width);
    const { violations } = await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze(); expect(violations).toEqual([]);
    await page.screenshot({ path: `${out}/update-dialog-${width}-${theme}.png` }); report.push({ name: "update-dialog", width, theme, violations });
  }
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog", { name: "Save this update?" })).toBeHidden();
  await writeFile(`${out}/visual-results.json`, JSON.stringify(report, null, 2));
});


test("a failed decision lookup does not hide the unresolved outcome after a real completion", async ({ page }) => {
  const { mix, person } = await prepare(), start = new Date(Date.now() - 86400000);
  const id = await startWorkflowInstance({ workspaceId, contactId: person.id, mixId: mix.id, requestId: randomUUID(), now: start }); await settle(id, start);
  const jumps = await prisma.jump.findMany({ where: { workflowInstanceId: id }, orderBy: { scheduledAt: "asc" } });
  await prisma.jump.updateMany({ where: { id: { in: jumps.slice(1).map(jump => jump.id) } }, data: { status: "DONE", completedAt: new Date(start.getTime() + 1000) } });
  await settle(id); const jump = jumps[0];
  await page.route("**/api/mix-workflow?jumpId=*", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Test outage" }) }));
  await page.goto(`/jumps?jump=${jump.id}`);
  const workflow = page.locator(`[data-jump-workflow="${jump.id}"]`);
  await workflow.getByRole("button", { name: /Mark (done|sent) for/ }).click();
  await expect(workflow.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  await workflow.getByRole("button", { name: "Record follow-up only", exact: true }).click();
  await expect.poll(async () => (await prisma.jump.findUniqueOrThrow({ where: { id: jump.id } })).status).toBe("DONE");
  await settle(id, new Date(Date.now() + 11000));
  await page.goto("/jumps"); await expect(page.locator("#needs-your-input")).toContainText("Estimate follow-up: next step");
  await expect(page.getByText("You’re caught up.", { exact: true })).toHaveCount(0);
});

test("a missing appointment carries the person and work through Calendar and back", async ({ page }) => {
  const { mix, person } = await prepare();
  await prisma.mixStep.updateMany({ where: { mixId: mix.id }, data: { anchor: "APPOINTMENT_START", offsetMinutes: -60 } });
  const id = await startWorkflowInstance({ workspaceId, contactId: person.id, mixId: mix.id, requestId: randomUUID(), label: "Site visit preparation" }); await settle(id);
  await page.goto(`/journey?contactId=${person.id}&work=${id}`);
  await page.getByRole("link", { name: "Open Calendar", exact: true }).click();
  await expect(page).toHaveURL(/calendar\?.*returnTo=/);
  await expect(page.getByRole("combobox", { name: "Contact (optional)", exact: true })).toHaveValue(person.id);
  await page.locator(".calendar-entry-form").getByRole("group", { name: "Starts", exact: true }).getByRole("button", { name: /Starts, date:/ }).click();
  await page.getByRole("dialog", { name: "Starts", exact: true }).getByRole("button", { name: "Tomorrow", exact: true }).click();
  if (await page.getByRole("button", { name: "Close Starts", exact: true }).isVisible()) await page.getByRole("button", { name: "Close Starts", exact: true }).click();
  await page.getByRole("textbox", { name: "Title", exact: true }).fill("Jordan’s site visit");
  await page.getByRole("button", { name: "Save event", exact: true }).click(); await expect(page).toHaveURL(/saved=1/);
  const entry = await prisma.calendarEntry.findFirstOrThrow({ where: { workspaceId, contactId: person.id, title: "Jordan’s site visit" } });
  await page.getByRole("link", { name: "Return to this work and link the saved appointment", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`work=${id}`));
  await page.getByRole("combobox", { name: "Link an appointment for this work", exact: true }).selectOption(entry.id);
  await page.getByRole("button", { name: "Link appointment", exact: true }).click();
  await expect.poll(async () => workflowState((await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id } })).state).context?.calendarEntryId).toBe(entry.id);
  expect(await prisma.jump.count({ where: { workflowInstanceId: id, status: "PENDING", manualOnly: true } })).toBe(4);
});
