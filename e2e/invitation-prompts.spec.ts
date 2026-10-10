import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { prisma } from "../src/lib/prisma";

// Invitation prompts (JITM-09 §2.9, D72): the desktop rail callout, the More row, and one compact Today prompt that
// appears below Today's due work once the owner has recorded an outcome, and that the owner can dismiss. There is no
// More badge and no tablet header gift.
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Disposable local database only");
test.use({ screenshot: "off", video: "off", trace: "off" });
test.setTimeout(120_000);
let midnight: Date;
const suffix = randomUUID(), recordedId = `${suffix}-recorded`;
const owners = { main: { token: randomUUID(), userId: "", workspaceId: "" }, other: { token: randomUUID(), userId: "", workspaceId: "" } };
const signIn = (context: BrowserContext, token: string) => context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
test.beforeAll(async () => {
  midnight = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  const now = new Date();
  for (const [index, [name, owner]] of Object.entries(owners).entries()) {
    owner.userId = (await prisma.user.create({ data: { email: `invitations-${name}-${suffix}@example.com`, name: "Invitation owner", passwordHash: "fixture-only", emailVerifiedAt: now } })).id;
    owner.workspaceId = (await prisma.workspace.create({ data: { ownerId: owner.userId, slug: `invitations-${name}-${suffix}`, name: "Invitation fixture", members: { create: { userId: owner.userId } }, profile: { create: { onboardingDone: true } } } })).id;
    await prisma.userPreference.create({ data: { userId: owner.userId, timezone: "UTC" } });
    await prisma.session.create({ data: { userId: owner.userId, tokenHash: createHash("sha256").update(owner.token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
    const workspaceId = owner.workspaceId;
    const text = await prisma.stepVersion.create({ data: { stepTemplate: { create: { workspaceId, name: "Check in", channel: "SMS" } }, version: 1, body: "Hi, checking in." } });
    const mix = await prisma.mix.create({ data: { workspaceId, name: "Estimate follow-up", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: [{ stepVersionId: text.id, dayOffset: 0, sortOrder: 1 }, { stepVersionId: text.id, dayOffset: 2, sortOrder: 2 }] } }, include: { steps: true } });
    const person = async (displayName: string, number: number) => (await prisma.contact.create({ data: { workspaceId, displayName, phones: { create: { phone: `+1555010${4400 + index * 10 + number}`, normalized: `+1555010${4400 + index * 10 + number}`, isPrimary: true } } } })).id;
    const followUp = async (id: string, contactId: string, status: "PENDING" | "DONE", completionMethod: string | null = null) => prisma.jump.create({ data: { id, workspaceId, contactId, mixId: mix.id, mixStepId: mix.steps[0].id, stepVersionId: text.id, scheduledAt: now, baseScheduledAt: now, status, completedAt: status === "DONE" ? now : null, completionMethod, reason: "Check in", uniquenessKey: id, templateSnapshot: { subject: null, body: "Hi, checking in.", script: null, channel: "SMS", originalLocalDate: now.toISOString().slice(0, 10), timezone: "UTC" }, renderedSnapshot: { subject: null, body: "Hi, checking in.", script: null } } });
    // One follow-up due today, so Today has a due section, and one the owner may have recorded. The other owner
    // has recorded theirs.
    await followUp(`${suffix}-${name}-due`, await person("Ivy Invite", 0), "PENDING");
    await followUp(name === "main" ? recordedId : `${suffix}-${name}-recorded`, await person("Rex Recorded", 1), "DONE", name === "main" ? null : "outcome:completed");
  }
});
test.beforeEach(async ({ context }) => {
  // The due follow-up is due on the UTC day the fixture was made.
  test.skip(new Date().toISOString().slice(0, 10) !== midnight.toISOString().slice(0, 10) || Date.now() > midnight.getTime() + 86_400_000 - 10 * 60_000, "Too close to midnight UTC.");
  await prisma.user.updateMany({ where: { id: { in: [owners.main.userId, owners.other.userId] } }, data: { referralInvitesIssued: 0 } });
  await signIn(context, owners.main.token);
});
test.afterAll(async () => {
  for (const owner of Object.values(owners)) {
    if (owner.workspaceId) await prisma.workspace.deleteMany({ where: { id: owner.workspaceId } });
    if (owner.userId) await prisma.user.deleteMany({ where: { id: owner.userId } });
  }
});
/** Whether the owner has recorded an outcome: Today's prompt waits for the first one. */
const recorded = (yes: boolean) => prisma.jump.update({ where: { id: recordedId }, data: { completionMethod: yes ? "outcome:completed" : null } });
async function ready(page: Page) { await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "", { timeout: 60_000 }); }
const prompt = (page: Page) => page.getByRole("region", { name: "Personal invitations" });
const dismissButton = (page: Page) => prompt(page).getByRole("button", { name: "Dismiss the invitation prompt", exact: true });
/** Whether Today, as the server sends it before any script runs, holds the prompt: a script-free page with the same cookies. */
async function promptInServerPage(browser: Browser, context: BrowserContext) {
  const bare = await browser.newContext({ javaScriptEnabled: false });
  try {
    await bare.addCookies(await context.cookies());
    const page = await bare.newPage();
    await page.goto(new URL("/jumps", process.env.APP_URL!).href);
    await expect(page.locator(".today-page-header h1")).toHaveCount(1);
    return await page.locator('[aria-label="Personal invitations"]').count() > 0;
  } finally { await bare.close(); }
}
const axe = (page: Page, selector: string) => new AxeBuilder({ page }).include(selector).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();

test("before the owner's first recorded outcome, Today shows no prompt; the rail callout and the More row still offer invitations", async ({ page }, testInfo) => {
  await recorded(false);
  await page.goto("/jumps"); await ready(page);
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await expect(prompt(page)).toHaveCount(0);
  if (testInfo.project.name === "desktop-chromium") {
    const callout = page.getByRole("link", { name: "Invite people: 3 invitations left" }).filter({ visible: true });
    await expect(callout).toHaveCount(1);
    expect((await callout.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    for (const theme of ["light", "dark"]) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      expect((await axe(page, ".invite-callout")).violations.map(item => item.id), theme).toEqual([]);
    }
  }
  await page.goto("/more"); await ready(page);
  await expect(page.getByRole("link", { name: /Invite people · 3 invitations left/ })).toBeVisible();
});

test("after it, one compact prompt sits between Today's due work and what follows, and Dismiss moves focus on", async ({ page, context, browser }) => {
  await recorded(true);
  await page.goto("/jumps"); await ready(page);
  await expect(prompt(page)).toContainText("Invite people · 3 invitations left");
  // After the due section; before the No Mix line and Next 7 days (JITM-09 §2.24).
  expect(await page.evaluate(() => {
    const strip = document.querySelector('[aria-label="Personal invitations"]')!, position = (selector: string) => document.querySelector(selector)?.compareDocumentPosition(strip) ?? 0;
    const noMix = document.querySelector(".today-no-mix-line");
    return [Boolean(position('[data-today-section="today"]') & Node.DOCUMENT_POSITION_FOLLOWING), !noMix || Boolean(position(".today-no-mix-line") & Node.DOCUMENT_POSITION_PRECEDING), Boolean(position('[data-today-section="upcoming"]') & Node.DOCUMENT_POSITION_PRECEDING)];
  })).toEqual([true, true, true]);
  const link = (await prompt(page).getByRole("link").boundingBox())!, dismiss = (await dismissButton(page).boundingBox())!;
  expect([link.height >= 44, dismiss.width >= 44 && dismiss.height >= 44, dismiss.x - link.x - link.width >= 8]).toEqual([true, true, true]);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    expect((await axe(page, ".invite-strip")).violations.map(item => item.id), theme).toEqual([]);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await dismissButton(page).click();
  await expect(prompt(page)).toHaveCount(0);
  // Focus goes on to the next control below, on screen, not back up to the heading (JITM-10 §2.12).
  expect(await page.evaluate(() => {
    const focused = document.activeElement as HTMLElement, due = document.querySelector('[data-today-section="today"]')!, box = focused.getBoundingClientRect();
    return { heading: focused.tagName === "H1", afterDue: Boolean(due.compareDocumentPosition(focused) & Node.DOCUMENT_POSITION_FOLLOWING) && !due.contains(focused), onScreen: box.top >= 0 && box.bottom <= innerHeight };
  })).toEqual({ heading: false, afterDue: true, onScreen: true });
  // Dismissed, it isn't in the page the server sends, so it can't show before the page's scripts run.
  expect(await promptInServerPage(browser, context)).toBe(false);
  await page.reload(); await ready(page);
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await expect(prompt(page)).toHaveCount(0);
});

test("the prompt stays compact and inside Today's column from 320 to 1440px", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Widths are set directly.");
  await recorded(true);
  const problems: string[] = [];
  for (const width of [320, 390, 768, 834, 900, 901, 1200, 1280, 1440]) {
    // Load each width afresh: from 768px Today docks the first review, which fills a phone screen if the window shrinks.
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/jumps"); await ready(page); await expect(prompt(page)).toBeVisible();
    const reading = await page.evaluate(() => {
      const strip = document.querySelector<HTMLElement>('[aria-label="Personal invitations"]')!, box = strip.getBoundingClientRect();
      const link = strip.querySelector("a")!.getBoundingClientRect(), dismiss = strip.querySelector("button")!.getBoundingClientRect();
      return { height: box.height, inside: link.left >= box.left && dismiss.left >= box.left && dismiss.right <= box.right && link.right <= dismiss.left, gap: dismiss.left - link.right, link: link.height, dismiss: [dismiss.width, dismiss.height], overflow: strip.scrollWidth > strip.clientWidth || document.documentElement.scrollWidth > innerWidth + 1 };
    });
    if (reading.height > 60 || !reading.inside || reading.gap < 8 || reading.link < 44 || reading.dismiss[0] < 44 || reading.dismiss[1] < 44 || reading.overflow) problems.push(`${width}: ${JSON.stringify(reading)}`);
  }
  expect(problems).toEqual([]);
});

test("the prompt opens the invitation card", async ({ page }) => {
  await recorded(true);
  await page.goto("/jumps"); await ready(page);
  await prompt(page).getByRole("link", { name: "Invite people · 3 invitations left", exact: true }).click();
  await page.waitForURL(/\/mixes\/system/);
  await expect(page.getByRole("heading", { name: "3 of 3 invitations remaining" })).toBeVisible();
});

test("a dismissal belongs to the account that made it", async ({ page, context, browser }) => {
  await recorded(true);
  await page.goto("/jumps"); await ready(page);
  await dismissButton(page).click();
  await expect(prompt(page)).toHaveCount(0);
  // Another owner in the same browser still sees their prompt; the first owner's stays dismissed.
  await signIn(context, owners.other.token);
  await page.goto("/jumps"); await ready(page);
  await expect(prompt(page)).toBeVisible();
  expect(await promptInServerPage(browser, context)).toBe(true);
  await signIn(context, owners.main.token);
  expect(await promptInServerPage(browser, context)).toBe(false);
  await page.goto("/jumps"); await ready(page);
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await expect(prompt(page)).toHaveCount(0);
});

test("there is no More badge and no tablet header gift", async ({ page }, testInfo) => {
  await recorded(true);
  if (testInfo.project.name === "mobile-chromium") {
    await page.goto("/jumps"); await ready(page);
    await expect(page.locator(".mobile-nav").getByRole("link", { name: "More", exact: true })).toBeVisible();
    await expect(page.locator(".nav-badge, .invite-count:visible")).toHaveCount(0);
  } else {
    await page.setViewportSize({ width: 834, height: 1000 });
    await page.goto("/jumps"); await ready(page);
    await expect(page.locator(".mobile-app-header")).toBeVisible();
    await expect(page.locator(".mobile-app-header").getByRole("link", { name: /^Invite people/ })).toHaveCount(0);
  }
});

test("the prompts disappear once every invitation is used", async ({ page }) => {
  await recorded(true);
  await prisma.user.update({ where: { id: owners.main.userId }, data: { referralInvitesIssued: 3 } });
  await page.goto("/jumps"); await ready(page);
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await expect(prompt(page)).toHaveCount(0);
  await expect(page.locator(".invite-callout")).toHaveCount(0);
  await page.goto("/more"); await ready(page);
  await expect(page.locator(".invite-hub-card")).toHaveCount(0);
});
