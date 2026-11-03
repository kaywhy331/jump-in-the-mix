import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";

// With more than a page of due follow-ups, one person's follow-ups can land on different pages. Each page groups and
// places only what it holds, and the sections count from that same page, so an overdue follow-up whose person's
// due-today one is on the next page stays under Overdue, counted and shown there (D71, CNT-01). Each card still names
// the person's follow-up on the other page in "Also due", and the earlier one keeps its skip offer (D97).
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", actionTimeout: 15_000 });
test.setTimeout(120_000);
let workspaceId: string, userId: string, midnight: Date;
const token = randomUUID();
const suffix = randomUUID();
const body = "Hi, checking in about your estimate.";
test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `today-paging-${suffix}@example.com`, name: "Paging owner", passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: `today-paging-${suffix}`, name: "Paging fixture", members: { create: { userId } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  const text = await prisma.stepVersion.create({ data: { stepTemplate: { create: { workspaceId, name: "Check in", channel: "SMS" } }, version: 1, body } });
  const mix = await prisma.mix.create({ data: { workspaceId, name: "Estimate follow-up", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: [{ stepVersionId: text.id, dayOffset: 0, sortOrder: 1 }, { stepVersionId: text.id, dayOffset: 2, sortOrder: 2 }, { stepVersionId: text.id, dayOffset: 9, sortOrder: 3 }] } }, include: { steps: true } });
  midnight = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  const people: string[] = [];
  for (let index = 0; index < 30; index++) {
    const displayName = index === 0 ? "Avery Across" : `Paged person ${String(index).padStart(2, "0")}`;
    people.push((await prisma.contact.create({ data: { workspaceId, displayName, phones: { create: { phone: `+1555011${4000 + index}`, normalized: `+1555011${4000 + index}`, isPrimary: true } } } })).id);
  }
  const followUp = (contactId: string, minutes: number, order: number) => {
    const scheduledAt = new Date(midnight.getTime() + minutes * 60_000);
    const mixStep = mix.steps.find(step => step.sortOrder === order)!;
    const jumpId = `${suffix}-${contactId}-${order}`;
    return prisma.jump.create({ data: { id: jumpId, workspaceId, contactId, mixId: mix.id, mixStepId: mixStep.id, stepVersionId: text.id, scheduledAt, baseScheduledAt: scheduledAt, status: "PENDING", reason: "Check in", uniquenessKey: jumpId, templateSnapshot: { subject: null, body, script: null, channel: "SMS", originalLocalDate: scheduledAt.toISOString().slice(0, 10), timezone: "UTC" }, renderedSnapshot: { subject: null, body, script: null } } });
  };
  // In due order: Avery's text a day overdue, then 29 people due today, then Avery's second text, the 31st, on page 2.
  await followUp(people[0], -1440, 1);
  for (let index = 1; index < 30; index++) await followUp(people[index], index, 1);
  await followUp(people[0], 120, 2);
});
test.beforeEach(async ({ context }) => {
  // The fixture's "today" is the UTC day it was made on.
  test.skip(new Date().toISOString().slice(0, 10) !== midnight.toISOString().slice(0, 10) || Date.now() > midnight.getTime() + 86_400_000 - 10 * 60_000, "Too close to midnight UTC.");
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
});
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});
async function ready(page: Page) { await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "", { timeout: 60_000 }); }

test("an overdue follow-up stays under Overdue, counted there, when the person's due-today one is on the next page", async ({ page }) => {
  await page.goto("/jumps"); await ready(page);
  const overdue = page.locator('[data-today-section="overdue"]');
  await expect(overdue).toBeVisible();
  await expect(overdue.locator(".section-label span")).toHaveText("1");
  await expect(overdue.locator(".jump-card-heading h3")).toHaveText(["Avery Across"]);
  await expect(overdue.locator(".jump-also-due-row:visible")).toHaveText(["Also due: Text at 2:00 AM"]);
  await expect(overdue.getByRole("button", { name: "Skip this text for Avery Across", exact: true })).toBeVisible();
  const today = page.locator('[data-today-section="today"]');
  await expect(today.locator(".section-label span")).toHaveText("30");
  await expect(today.locator("article.jump-card")).toHaveCount(29);
  await expect(page.locator(".today-page-header p").first()).toHaveText("31 follow-ups need your attention · 1 overdue.");
  // Its review names the follow-up on the next page too (D97).
  await overdue.getByRole("button", { name: /^Review message for Avery Across/ }).click();
  await expect(page.locator(".follow-up-review-sheet[open] .review-also-due")).toHaveText("Also due: Text at 2:00 AM.");
  // A phone's review covers the list; a docked one sits beside it.
  await page.keyboard.press("Escape");
  // The next page holds Avery's other follow-up, on a card of its own.
  await page.getByRole("link", { name: "Next follow-ups", exact: true }).click();
  await expect(today.locator(".jump-card-heading h3")).toHaveText(["Avery Across"]);
  await expect(today.locator("article.jump-card")).toHaveCount(1);
  await expect(today.locator(".jump-also-due-row:visible")).toHaveText(["Also due: Text, 1 day overdue"]);
  // Only the earlier follow-up offers to skip itself.
  await expect(today.getByRole("button", { name: /^Skip this/ })).toHaveCount(0);
  await expect(overdue).toHaveCount(0);
});

test("a follow-up arriving from the next page keeps the person's open overdue review mounted (B-20)", async ({ page }) => {
  await page.goto("/jumps"); await ready(page);
  const overdue = page.locator('[data-today-section="overdue"]');
  await overdue.getByRole("button", { name: /^Review message for Avery Across/ }).click();
  const review = page.getByRole("dialog", { name: "Follow up with Avery Across", exact: true });
  await expect(review).toBeVisible();
  await review.evaluate(element => element.setAttribute("data-kept-review", ""));
  const other = await prisma.jump.findFirstOrThrow({ where: { workspaceId, status: "PENDING", contact: { displayName: { not: "Avery Across" } } }, orderBy: { scheduledAt: "asc" } });
  try {
    // Completing someone else makes room on page one for Avery's second follow-up.
    await prisma.jump.update({ where: { id: other.id }, data: { status: "DONE", completedAt: new Date(midnight.getTime() + 180 * 60_000), completionMethod: "outcome:connected" } });
    await page.evaluate(() => window.dispatchEvent(new Event("jitm:workflow-updated")));
    await expect(overdue.locator("[data-jump-workflow]")).toHaveCount(2);
    await expect(overdue.locator(".follow-up-review-sheet[open][data-kept-review]")).toBeVisible();
    await expect(overdue.locator(".section-label span")).toHaveText("2");
    await expect(page.locator('[data-today-section="today"] .section-label span')).toHaveText("28");
    await expect(page.locator(".today-page-header p").first()).toHaveText("30 follow-ups need your attention · 1 overdue.");
    await review.getByRole("button", { name: "Close Follow up with Avery Across", exact: true }).click();
    await expect(overdue).toHaveCount(0);
    await expect(page.locator(".follow-up-review-sheet[open]")).toHaveCount(0);
    await expect(page.locator('[data-today-section="today"] .section-label span')).toHaveText("30");
  } finally {
    await prisma.jump.update({ where: { id: other.id }, data: { status: "PENDING", completedAt: null, completionMethod: null } });
  }
});
