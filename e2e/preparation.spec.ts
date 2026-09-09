import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { axeInPage } from "./axe-in-page";
import { test, expect, type BrowserContext } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { generateJumps } from "../src/lib/jump-engine";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
// These flows intercept status requests to simulate network trouble and time.
// WebKit service workers can bypass Playwright's route interception.
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block" });
test.setTimeout(180_000);
let workspaceId: string, userId: string, contactId: string, versionId: string, planId: string;
let cookies: Awaited<ReturnType<BrowserContext["cookies"]>>;
const endpoint = "**/api/follow-ups/preparation*";
const queued = (extra = {}) => prisma.job.create({ data: { workspaceId, task: "generate-jumps", payload: { contactId }, ...extra } });
async function complete() {
  await generateJumps({ workspaceId });
  await prisma.job.updateMany({ where: { workspaceId, failedAt: null, completedAt: null }, data: { completedAt: new Date() } });
}

test.beforeAll(async ({ browser }) => {
  const suffix = randomUUID(), password = "PrepareFixture123!";
  const user = await prisma.user.create({ data: { email: `prepare-browser-${suffix}@example.com`, name: "Preparation owner", passwordHash: await bcrypt.hash(password, 4), emailVerifiedAt: new Date() } }); userId = user.id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: `prepare-browser-${suffix}`, name: "Preparation business", members: { create: { userId } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  contactId = (await prisma.contact.create({ data: { workspaceId, displayName: "Preparation sample", phones: { create: { phone: "+15550101111", normalized: "+15550101111", isPrimary: true } } } })).id;
  const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Sample follow-up", channel: "SMS" } });
  const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Hello, following up on our conversation." } });
  versionId = version.id;
  const plan = await prisma.mix.create({ data: { workspaceId, name: "Prepared sample plan", triggerMode: "MANUAL_START", status: "ACTIVE", steps: { create: { stepVersionId: version.id, dayOffset: 0, sortOrder: 1 } } } });
  planId = plan.id;
  await prisma.mixAssignment.create({ data: { workspaceId, mixId: plan.id, contactId, assignmentKey: randomUUID(), startDate: new Date() } });
  const page = await browser.newPage(); page.setDefaultTimeout(90_000);
  await page.goto("/login"); await page.getByLabel("Email", { exact: true }).fill(user.email); await page.getByLabel("Password", { exact: true }).fill(password);
  await Promise.all([page.waitForURL(/\/jumps/), page.getByRole("button", { name: "Sign in", exact: true }).click()]);
  cookies = await page.context().cookies(); await page.close();
});
test.beforeEach(async ({ context, page }) => {
  await context.addCookies(cookies); page.setDefaultTimeout(30_000);
  await prisma.job.deleteMany({ where: { workspaceId } });
  await prisma.jump.deleteMany({ where: { workspaceId } });
});
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});

test("preparation refresh keeps an unsaved note, keyboard focus and reading position", async ({ page }) => {
  await page.goto(`/contacts/${contactId}`);
  await expect(page.getByRole("complementary", { name: "Follow-up preparation" })).toHaveCount(0);
  await queued(); await page.reload();
  const notice = page.getByRole("complementary", { name: "Follow-up preparation" });
  await expect(notice).toContainText("Preparing your follow-ups");
  await expect(page.getByRole("region", { name: "Next follow-up" })).not.toContainText("Nothing scheduled");
  const note = page.getByRole("textbox", { name: "Add a note", exact: true });
  await note.fill("Keep this unsaved note while follow-ups prepare."); await expect(note).toBeFocused();
  // Focusing a field may start the app's smooth scroll. Measure only after
  // that user-initiated movement settles, before completing preparation.
  await page.evaluate(() => new Promise<void>(resolve => {
    let last = scrollY, stable = 0;
    const frame = () => { stable = Math.abs(scrollY - last) < 1 ? stable + 1 : 0; last = scrollY; if (stable >= 5) resolve(); else requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  }));
  const scroll = await page.evaluate(() => scrollY);
  const noteTop = await note.evaluate(element => element.getBoundingClientRect().top);
  await complete();
  await expect(notice).toContainText("Follow-up list updated", { timeout: 30_000 });
  await expect(page.getByRole("region", { name: "Next follow-up" })).toContainText("Prepared sample plan");
  await expect(note).toHaveValue("Keep this unsaved note while follow-ups prepare."); await expect(note).toBeFocused();
  const after = { scroll: await page.evaluate(() => scrollY), noteTop: await note.evaluate(element => element.getBoundingClientRect().top) };
  // Native scroll anchoring may change scrollY as content above the note grows.
  // The owner's field must stay in the same place on screen while they type.
  expect(Math.abs(after.noteTop - noteTop), JSON.stringify({ before: { scroll, noteTop }, after })).toBeLessThanOrEqual(12);
  await notice.getByRole("button", { name: "Dismiss" }).click(); await expect(notice).toHaveCount(0);
});

test("Today distinguishes delayed preparation, network trouble and filtered emptiness", async ({ page }) => {
  await queued({ createdAt: new Date(Date.now() - 70_000), attempts: 1, runAt: new Date(Date.now()+300_000) });
  await page.goto("/jumps");
  const notice = page.getByRole("complementary", { name: "Follow-up preparation" });
  await expect(notice).toContainText("taking longer");
  await expect(page.getByText("You’re caught up.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Nothing due right now" })).toHaveCount(0);
  await page.route(endpoint, route => route.fulfill({ status: 200, contentType: "text/html", body: "<html>Login</html>" }));
  await notice.getByRole("button", { name: "Check again" }).click();
  await expect(notice).toContainText("couldn’t check");
  await expect(notice.getByRole("button", { name: "Retry preparation" })).toHaveCount(0);
  await page.unroute(endpoint); await complete();
  await notice.getByRole("button", { name: "Check again" }).click();
  await expect(notice).toContainText("Follow-up list updated");
  await expect(page.locator(".jump-task-card")).toHaveCount(1);
  await page.goto("/jumps?status=done");
  await expect(page.getByRole("heading", { name: "No follow-ups match these filters" })).toBeVisible();
  await expect(page.getByText("You’re caught up.", { exact: true })).toHaveCount(0);
});

test("a failed preparation can be retried once without discarding its receipt", async ({ page }) => {
  const failed = await queued({ failedAt: new Date(), attempts: 8, lastError: "Private failure detail" });
  await page.goto(`/contacts/${contactId}`);
  const notice = page.getByRole("complementary", { name: "Follow-up preparation" });
  await expect(notice).toContainText("need another try"); await expect(page.locator("body")).not.toContainText("Private failure detail");
  await notice.getByRole("button", { name: "Retry preparation" }).click();
  await expect(notice).toContainText("Preparing your follow-ups");
  expect(await prisma.job.count({ where: { workspaceId, failedAt: null, completedAt: null } })).toBe(1);
  expect((await prisma.job.findUniqueOrThrow({ where: { id: failed.id } })).attempts).toBe(8);
  await complete(); await expect(notice).toContainText("Follow-up list updated");
});

test("polling pauses when hidden, stops after a minute and can resume manually", async ({ page }) => {
  await queued();
  let checks = 0;
  await page.clock.install();
  await page.route(endpoint, route => { checks++; return route.fulfill({ json: { state: "preparing", observedAt: new Date().toISOString() } }); });
  await page.goto(`/contacts/${contactId}`);
  await expect.poll(() => checks).toBeGreaterThan(0);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
  const hiddenChecks = checks; await page.clock.runFor(8_000); expect(checks).toBe(hiddenChecks);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect.poll(() => checks).toBeGreaterThan(hiddenChecks);
  await page.clock.fastForward(65_000);
  const notice = page.getByRole("complementary", { name: "Follow-up preparation" });
  await expect(notice).toContainText("taking longer");
  const stoppedChecks = checks; await page.clock.runFor(10_000); expect(checks).toBe(stoppedChecks);
  await notice.getByRole("button", { name: "Check again" }).click();
  await expect.poll(() => checks).toBeGreaterThan(stoppedChecks);
  await page.goto("/contacts"); const afterUnmount = checks; await page.clock.runFor(10_000); expect(checks).toBe(afterUnmount);
});

test("preparation controls are accessible across themes, narrow widths and expired sessions", async ({ page }) => {
  await queued({ failedAt: new Date(), attempts: 8 });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/contacts/${contactId}`);
  for (const theme of ["light", "dark"] as const) for (const width of [320, 1440]) {
    await page.emulateMedia({ colorScheme: theme }); await page.setViewportSize({ width, height: 900 });
    const notice = page.getByRole("complementary", { name: "Follow-up preparation" });
    await expect(notice).toContainText("need another try");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    // Firefox reports fractional geometry just below the specified CSS pixel.
    for (const button of await notice.getByRole("button").all()) expect(Math.round((await button.boundingBox())!.height * 100) / 100).toBeGreaterThanOrEqual(44);
    const result = await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(result.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }))).toEqual([]);
  }
  await page.route(endpoint, route => route.fulfill({ status: 401, json: { error: "Sign in" } }));
  const note = page.getByRole("textbox", { name: "Add a note", exact: true }); await note.fill("Unsaved after sign-out");
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByRole("link", { name: "Sign in in a new tab" })).toHaveAttribute("target", "_blank");
  await expect(note).toHaveValue("Unsaved after sign-out");
  expect(errors).toEqual([]);
});

test("Today refreshes untouched messages and waits for drafts before reordering", async ({ page }) => {
  for (const edited of [false, true]) {
    await prisma.stepVersion.update({ where: { id: versionId }, data: { body: "Original prepared text" } });
    await complete(); await queued();
    await page.goto("/jumps");
    const message = page.getByRole("textbox", { name: "Fine-tune before sending", exact: true });
    await expect(message).toHaveValue("Original prepared text");
    if (edited) {
      await message.fill("My personal unsent draft");
      const earlier = await prisma.contact.create({ data: { workspaceId, displayName: "Earlier sample", phones: { create: { phone: "+15550101112", normalized: "+15550101112" } } } });
      await prisma.mixAssignment.create({ data: { workspaceId, mixId: planId, contactId: earlier.id, assignmentKey: randomUUID(), startDate: new Date(Date.now() - 86_400_000) } });
    }
    await prisma.stepVersion.update({ where: { id: versionId }, data: { body: "Updated prepared text" } });
    await complete();
    const notice = page.getByRole("complementary", { name: "Follow-up preparation" });
    await expect(notice).toContainText(edited ? "Follow-ups are prepared" : "Follow-up list updated");
    const expected = edited ? "My personal unsent draft" : "Updated prepared text";
    await expect(message).toHaveValue(expected);
    await expect(page.getByRole("link", { name: "Open text for Preparation sample", exact: true })).toHaveAttribute("href", `sms:+15550101111?body=${encodeURIComponent(expected)}`);
    if (edited) {
      await expect(message).toBeFocused();
      await expect(page.locator(".next-follow-up")).toContainText("Preparation sample");
      await notice.getByRole("button", { name: "Return to draft" }).click(); await expect(message).toBeFocused();
      const result = await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(result.violations.map(item => item.id)).toEqual([]);
      await page.getByRole("button", { name: "Discard edits" }).click();
      await expect(notice).toContainText("Follow-up list updated");
      await expect(page.locator(".next-follow-up")).toContainText("Earlier sample");
      await expect(page.getByRole("textbox", { name: "Fine-tune before sending", exact: true })).toHaveValue("Updated prepared text");
    }
  }
});
