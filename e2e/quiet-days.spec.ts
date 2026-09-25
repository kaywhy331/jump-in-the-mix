import { createHash, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { prisma } from "../src/lib/prisma";
const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
test.skip(!local, "Disposable local database only");
let workspaceId: string, userId: string, stageId: string, mariaId: string, devonId: string, raeId: string, jumpId: string;
const token = randomUUID();
test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `quiet-ui-${randomUUID()}@example.test`, name: "Quiet fixture", passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: randomUUID(), name: "Quiet fixture", profile: { create: { onboardingDone: true } }, members: { create: { userId } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.workspacePreference.create({ data: { workspaceId, quietDaysEnabled: true, quietDays: 60 } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  stageId = (await prisma.journeyStage.create({ data: { workspaceId, name: "Client", position: 0 } })).id;
  const add = async (name: string) => (await prisma.contact.create({ data: { workspaceId, displayName: name, firstName: name.split(" ")[0], createdAt: new Date(Date.now() - 90 * 86_400_000), phones: { create: { phone: "+15550100100", normalized: "+15550100100", isPrimary: true } }, journey: { create: { workspaceId, stageId } } } })).id;
  mariaId = await add("Maria Lane"); devonId = await add("Devon Stone"); raeId = await add("Rae Taylor");
  const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Catch up", channel: "PHONE_CALL", versions: { create: { version: 1, script: "Ask how things are going." } } }, include: { versions: true } });
  const mix = await prisma.mix.create({ data: { workspaceId, name: "One-time follow-ups", status: "ARCHIVED", source: "ONE_TIME", triggerMode: "MANUAL_START", steps: { create: { stepVersionId: template.versions[0].id, dayOffset: 0, sortOrder: 1 } } }, include: { steps: true } });
  jumpId = (await prisma.jump.create({ data: { workspaceId, contactId: devonId, mixId: mix.id, mixStepId: mix.steps[0].id, stepVersionId: template.versions[0].id, manualOnly: true, scheduledAt: new Date(), reason: "Catch up", templateSnapshot: { channel: "PHONE_CALL", script: "Ask how things are going." }, renderedSnapshot: { script: "Ask how things are going." }, uniquenessKey: randomUUID() } })).id;
});
test.beforeEach(async ({ context }) => {
  await prisma.workspacePreference.update({ where: { workspaceId }, data: { quietDaysEnabled: true, quietDays: 60 } });
  await prisma.contactActivity.deleteMany({ where: { workspaceId } });
  await prisma.jump.update({ where: { id: jumpId }, data: { status: "PENDING", completedAt: null } });
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
});
test.afterAll(async () => {
  if (workspaceId) { await prisma.contactActivity.deleteMany({ where: { workspaceId } }); await prisma.workspacePreference.deleteMany({ where: { workspaceId } }); await prisma.workspace.deleteMany({ where: { id: workspaceId } }); }
  if (userId) { await prisma.userPreference.deleteMany({ where: { userId } }); await prisma.user.deleteMany({ where: { id: userId } }); }
});
for (const theme of ["light", "dark"]) for (const width of [320, 390, 834, 1440]) test(`quiet-day Journey ${theme} at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : width === 834 ? 1194 : 1000 });
  await page.addInitScript(theme => localStorage.setItem("jitm-appearance", theme), theme);
  await page.goto("/journey?touchpoint=quiet-days");
  const panel = page.getByRole("region", { name: "Quiet-day check-ins", exact: true });
  await expect(panel.getByText("Check in with Maria Lane", { exact: true })).toBeVisible();
  // The quiet-day touchpoint opens beside the Mix and Beat map and counts the people due.
  const touchpoint = page.locator("summary").filter({ hasText: "Just saying hello" });
  const due = panel.locator(".section-label > span");
  await expect(touchpoint).toHaveText("Just saying hello · 3 people due");
  await expect(due).toHaveText("3");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include(".quiet-day-suggestions").withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `.artifacts/quiet-days-20260920/journey-${theme}-${width}.png`, fullPage: true });
  const row = panel.getByRole("listitem").filter({ hasText: "Check in with Maria Lane" });
  const skip = row.getByRole("button", { name: "Skip", exact: true });
  await skip.focus(); await page.keyboard.press("Enter");
  await expect(panel.getByRole("status")).toContainText("Skipped check-in for Maria Lane");
  await expect(panel.getByRole("status")).toBeFocused();
  await expect(row).toHaveCount(0);
  await expect(due).toHaveText("2");
  await expect(touchpoint).toHaveText("Just saying hello · 2 people due");
  expect((await prisma.contactJourney.findUniqueOrThrow({ where: { contactId: mariaId } })).stageId).toBe(stageId);
});
test("Today resolves completed suggestions and real follow-ups", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/jumps");
  const suggestions = page.getByRole("region", { name: "Quiet-day check-ins", exact: true });
  const maria = suggestions.getByRole("listitem").filter({ hasText: "Maria Lane" });
  await maria.getByRole("button", { name: "Completed", exact: true }).click();
  await expect(maria).toHaveCount(0);
  await page.screenshot({ path: ".artifacts/quiet-days-20260920/today-completed-phone.png", fullPage: true });
  await suggestions.getByRole("link", { name: "Review follow-up", exact: true }).click();
  // Today opens the follow-up for review; marking it done lives in the card's More options.
  const closeReview = page.getByRole("button", { name: "Close Follow up with Devon Stone", exact: true });
  await expect(closeReview).toBeVisible();
  await closeReview.click();
  const card = page.locator(`#jump-${jumpId}`);
  await card.getByRole("button", { name: "More options for Devon Stone", exact: true }).click();
  await card.getByRole("button", { name: "Mark done for Devon Stone", exact: true }).click();
  await expect(suggestions.getByRole("listitem").filter({ hasText: "Devon Stone" })).toHaveCount(0);
  expect((await prisma.jump.findUniqueOrThrow({ where: { id: jumpId } })).status).toBe("DONE");
});
test("notes are distinct from logged conversations and conversation links preselect the right choice", async ({ page }) => {
  await page.goto(`/contacts/${raeId}#add-note`);
  const form = page.locator("#add-note");
  await expect(form.getByLabel("This records a conversation")).not.toBeChecked();
  await form.getByRole("textbox").fill("Remember this detail, without a conversation.");
  await form.getByRole("button", { name: "Add update", exact: true }).click();
  await expect(page.getByText("Remember this detail, without a conversation.", { exact: true })).toBeVisible();
  const suggestions = await page.request.get("/api/quiet-days");
  expect(suggestions.status()).toBe(200);
  expect((await suggestions.json()).items.some((item: { contactId: string }) => item.contactId === raeId)).toBe(true);
  await page.goto("/journey?touchpoint=quiet-days");
  await page.getByRole("listitem").filter({ hasText: "Check in with Rae Taylor" }).getByRole("link", { name: "Log conversation" }).click();
  await expect(form.getByLabel("This records a conversation")).toBeChecked();
  await form.getByRole("textbox").fill("We spoke about the next project.");
  const saved = page.waitForResponse(response => response.url().endsWith(`/contacts/${raeId}/activity`) && response.request().method() === "POST");
  await form.getByRole("button", { name: "Add update", exact: true }).click();
  expect((await (await saved).json()).item.conversation).toBe(true);
  expect((await prisma.contactActivity.findFirstOrThrow({ where: { workspaceId, contactId: raeId, summary: "We spoke about the next project." } })).metadata).toMatchObject({ conversation: true });
  await expect(page.getByText("We spoke about the next project.", { exact: true })).toBeVisible();
  const communications = await (await page.request.get(`/api/contacts/${raeId}/activity?filter=COMMUNICATIONS`)).json();
  expect(communications.items).toEqual(expect.arrayContaining([expect.objectContaining({ conversation: true, summary: "We spoke about the next project." })]));
  await page.goto("/journey?touchpoint=quiet-days");
  await expect(page.getByText("Check in with Rae Taylor", { exact: true })).toHaveCount(0);
});
test("preferences can disable suggestions or change the interval", async ({ page }) => {
  await page.goto("/account/preferences#quiet-days");
  await page.getByLabel("Suggest check-ins after quiet days").uncheck();
  await page.getByRole("button", { name: "Save check-in preferences", exact: true }).click();
  await expect(page.getByText("Quiet-day check-in preferences saved.", { exact: true })).toBeVisible();
  await page.goto("/jumps"); await expect(page.getByRole("region", { name: "Quiet-day check-ins", exact: true })).toHaveCount(0);
  await page.goto("/account/preferences#quiet-days");
  await page.getByLabel("Suggest check-ins after quiet days").check();
  await page.getByLabel("Quiet days before a suggestion").fill("120");
  await page.getByRole("button", { name: "Save check-in preferences", exact: true }).click();
  await expect(page.getByText("Quiet-day check-in preferences saved.", { exact: true })).toBeVisible();
  await page.goto("/journey?touchpoint=quiet-days");
  await expect(page.getByText("After 120 quiet days. A suggestion to reconnect; nobody changes stage.", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Quiet-day check-ins", exact: true }).getByRole("listitem")).toHaveCount(0);
});
test("check-in endpoints require authentication", async ({ request }) => {
  expect((await request.get("/api/quiet-days")).status()).toBe(401);
  expect((await request.post("/api/quiet-days", { headers: { origin: process.env.APP_URL! }, data: { contactId: mariaId, cycle: "a".repeat(64), resolution: "COMPLETED" } })).status()).toBe(401);
});
test("search and pagination stay consistent when the last result on a page is resolved", async ({ page }) => {
  const ids: string[] = [];
  try {
    for (let i = 0; i < 21; i++) ids.push((await prisma.contact.create({ data: { workspaceId, displayName: `Pagination ${String(i).padStart(2, "0")}`, createdAt: new Date(Date.now() - 90 * 86_400_000) } })).id);
    await page.goto("/journey?touchpoint=quiet-days&q=Pagination");
    const panel = page.getByRole("region", { name: "Quiet-day check-ins", exact: true });
    await expect(panel.getByRole("listitem")).toHaveCount(20);
    await panel.getByRole("button", { name: "Next", exact: true }).click();
    await expect(panel.getByRole("listitem")).toHaveCount(1);
    await panel.getByRole("button", { name: "Skip", exact: true }).click();
    await expect(panel.getByRole("listitem")).toHaveCount(20);
    await expect(panel.getByRole("navigation", { name: "Quiet-day check-in pages" })).toHaveCount(0);
    await panel.getByRole("searchbox", { name: "Search quiet-day check-ins" }).fill("Pagination 05");
    await expect(panel.getByRole("listitem")).toHaveCount(1);
    await expect(panel.getByText("Check in with Pagination 05", { exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Completed", exact: true }).click();
    await expect(panel.getByText("No check-ins match this search.", { exact: true })).toBeVisible();
    await expect(panel.getByRole("searchbox", { name: "Search quiet-day check-ins" })).toHaveValue("Pagination 05");
    // On a phone the panel's own search field is the way in: a search handed over in the URL lands in it, and typing narrows the list.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/journey?touchpoint=quiet-days&q=Maria");
    const phoneSearch = panel.getByRole("searchbox", { name: "Search quiet-day check-ins" });
    await expect(phoneSearch).toBeVisible();
    await expect(phoneSearch).toHaveValue("Maria");
    await expect(panel.getByText("Check in with Maria Lane", { exact: true })).toBeVisible();
    await phoneSearch.fill("Rae");
    await expect(panel.getByText("Check in with Rae Taylor", { exact: true })).toBeVisible();
    await expect(panel.getByText("Check in with Maria Lane", { exact: true })).toHaveCount(0);
  } finally { await prisma.contactActivity.deleteMany({ where: { workspaceId, contactId: { in: ids } } }); await prisma.contact.deleteMany({ where: { workspaceId, id: { in: ids } } }); }
});
