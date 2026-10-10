import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { prisma } from "../src/lib/prisma";

// Invitation prompts (JITM-09 §2.9, D72): the desktop rail callout, the More row, and one compact Today prompt that
// appears below Today's due sections once the owner has recorded an outcome, and that the owner can dismiss.
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Disposable local database only");
test.use({ screenshot: "off", video: "off", trace: "off" });
test.setTimeout(120_000);
let workspaceId: string, userId: string;
const token = randomUUID(), suffix = randomUUID();
const recordedId = `${suffix}-recorded`;
test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `invitations-${suffix}@example.com`, name: "Invitation owner", passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: `invitations-${suffix}`, name: "Invitation fixture", members: { create: { userId } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  const text = await prisma.stepVersion.create({ data: { stepTemplate: { create: { workspaceId, name: "Check in", channel: "SMS" } }, version: 1, body: "Hi, checking in." } });
  const mix = await prisma.mix.create({ data: { workspaceId, name: "Estimate follow-up", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: [{ stepVersionId: text.id, dayOffset: 0, sortOrder: 1 }, { stepVersionId: text.id, dayOffset: 2, sortOrder: 2 }] } }, include: { steps: true } });
  const person = async (displayName: string, index: number) => (await prisma.contact.create({ data: { workspaceId, displayName, phones: { create: { phone: `+1555010${4400 + index}`, normalized: `+1555010${4400 + index}`, isPrimary: true } } } })).id;
  const now = new Date();
  const followUp = async (id: string, contactId: string, status: "PENDING" | "DONE") => prisma.jump.create({ data: { id, workspaceId, contactId, mixId: mix.id, mixStepId: mix.steps[0].id, stepVersionId: text.id, scheduledAt: now, baseScheduledAt: now, status, completedAt: status === "DONE" ? now : null, reason: "Check in", uniquenessKey: id, templateSnapshot: { subject: null, body: "Hi, checking in.", script: null, channel: "SMS", originalLocalDate: now.toISOString().slice(0, 10), timezone: "UTC" }, renderedSnapshot: { subject: null, body: "Hi, checking in.", script: null } } });
  // One follow-up due today, so Today has a due section, and one the owner may have recorded.
  await followUp(`${suffix}-due`, await person("Ivy Invite", 0), "PENDING");
  await followUp(recordedId, await person("Rex Recorded", 1), "DONE");
});
test.beforeEach(async ({ context }) => {
  await prisma.user.update({ where: { id: userId }, data: { referralInvitesIssued: 0 } });
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
});
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});
/** Whether the owner has recorded an outcome: Today's prompt waits for the first one. */
const recorded = (yes: boolean) => prisma.jump.update({ where: { id: recordedId }, data: { completionMethod: yes ? "outcome:completed" : null } });
async function ready(page: Page) { await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "", { timeout: 60_000 }); }
const prompt = (page: Page) => page.getByRole("region", { name: "Personal invitations" });

test("before the owner's first recorded outcome, Today shows no prompt; the rail callout and the More row still offer invitations", async ({ page }, testInfo) => {
  await recorded(false);
  await page.goto("/jumps"); await ready(page);
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await expect(prompt(page)).toHaveCount(0);
  if (testInfo.project.name === "desktop-chromium") await expect(page.getByRole("link", { name: "Invite people: 3 invitations left" }).filter({ visible: true })).toHaveCount(1);
  await page.goto("/more"); await ready(page);
  await expect(page.getByRole("link", { name: /Invite people · 3 invitations left/ })).toBeVisible();
});

test("after it, one compact prompt sits below Today's due sections, and the owner can dismiss it", async ({ page }) => {
  await recorded(true);
  await page.goto("/jumps"); await ready(page);
  await expect(prompt(page)).toContainText("You have 3 invitations to share.");
  expect(await page.evaluate(() => {
    const due = document.querySelector('[data-today-section="today"]'), strip = document.querySelector('[aria-label="Personal invitations"]');
    return Boolean(due && strip && due.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  const dismiss = prompt(page).getByRole("button", { name: "Dismiss the invitation prompt", exact: true });
  const box = (await dismiss.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    const audit = await new AxeBuilder({ page }).include(".invite-strip").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(audit.violations.map(item => item.id), theme).toEqual([]);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await dismiss.click();
  await expect(prompt(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeFocused();
  await page.reload(); await ready(page);
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await expect(prompt(page)).toHaveCount(0);
});

test("the prompt opens the invitation card", async ({ page }) => {
  await recorded(true);
  await page.goto("/jumps"); await ready(page);
  await prompt(page).getByRole("link", { name: "Invite people", exact: true }).click();
  await page.waitForURL(/\/mixes\/system/);
  await expect(page.getByRole("heading", { name: "3 of 3 invitations remaining" })).toBeVisible();
});

test("the prompts disappear once every invitation is used", async ({ page }) => {
  await recorded(true);
  await prisma.user.update({ where: { id: userId }, data: { referralInvitesIssued: 3 } });
  await page.goto("/jumps"); await ready(page);
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await expect(prompt(page)).toHaveCount(0);
  await expect(page.locator(".invite-callout")).toHaveCount(0);
  await page.goto("/more"); await ready(page);
  await expect(page.locator(".invite-hub-card")).toHaveCount(0);
});
