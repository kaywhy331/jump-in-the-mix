import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";

// One person's follow-ups due the same day share one card on Today, which names the other one ("also due") and offers
// to skip the earlier one; each keeps its own review, outcome and Undo (D71, JITM-09 §2.82). Rows say the reason, then
// the Mix (TDY-02), and the first card isn't clipped on a phone (ACC-06).
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", actionTimeout: 15_000 });
test.setTimeout(120_000);
let workspaceId: string, userId: string, midnight: Date;
const token = randomUUID();
const suffix = randomUUID();
const body = "Hi, checking in about your estimate.";
const id = { oscar: `${suffix}-oscar`, gwenText: `${suffix}-gwen-text`, pat: `${suffix}-pat`, gwenCall: `${suffix}-gwen-call`, una: `${suffix}-una` };
const all = Object.values(id);
const snapshot = (scheduledAt: Date, channel: "SMS" | "PHONE_CALL") => ({ subject: null, body: channel === "SMS" ? body : null, script: channel === "SMS" ? null : "Ask how the estimate looks.", channel, originalLocalDate: scheduledAt.toISOString().slice(0, 10), timezone: "UTC" });
test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `today-people-${suffix}@example.com`, name: "People owner", passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: `today-people-${suffix}`, name: "People fixture", members: { create: { userId } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  const text = await prisma.stepVersion.create({ data: { stepTemplate: { create: { workspaceId, name: "Check in", channel: "SMS" } }, version: 1, body } });
  const call = await prisma.stepVersion.create({ data: { stepTemplate: { create: { workspaceId, name: "Call", channel: "PHONE_CALL" } }, version: 1, script: "Ask how the estimate looks." } });
  // Three Beats, so recording the first two leaves the Mix running and Today doesn't ask what's next.
  const mix = await prisma.mix.create({ data: { workspaceId, name: "Estimate follow-up", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: [{ stepVersionId: text.id, dayOffset: 0, sortOrder: 1 }, { stepVersionId: call.id, dayOffset: 2, sortOrder: 2 }, { stepVersionId: text.id, dayOffset: 9, sortOrder: 3 }] } }, include: { steps: true } });
  const oneTime = await prisma.mix.create({ data: { workspaceId, name: "One-time follow-ups", status: "ARCHIVED", triggerMode: "MANUAL_START", source: "ONE_TIME", steps: { create: { stepVersionId: text.id, dayOffset: 0, sortOrder: 1, isActive: false } } }, include: { steps: true } });
  const step = (order: number) => mix.steps.find(item => item.sortOrder === order)!;
  midnight = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  const person = async (displayName: string, index: number) => (await prisma.contact.create({ data: { workspaceId, displayName, phones: { create: { phone: `+1555010${3200 + index}`, normalized: `+1555010${3200 + index}`, isPrimary: true } } } })).id;
  const [oscar, gwen, pat, una] = [await person("Oscar Overdue", 0), await person("Gwen Group", 1), await person("Pat Single", 2), await person("Una Once", 3)];
  const followUp = (jumpId: string, contactId: string, minutes: number, reason: string, mixStep: { id: string; stepVersionId: string }, mixId = mix.id) => {
    const scheduledAt = new Date(midnight.getTime() + minutes * 60_000);
    const channel = mixStep.stepVersionId === call.id ? "PHONE_CALL" : "SMS";
    return prisma.jump.create({ data: { id: jumpId, workspaceId, contactId, mixId, mixStepId: mixStep.id, stepVersionId: mixStep.stepVersionId, scheduledAt, baseScheduledAt: scheduledAt, status: "PENDING", reason, uniquenessKey: jumpId, templateSnapshot: snapshot(scheduledAt, channel), renderedSnapshot: { subject: null, body: channel === "SMS" ? body : null, script: channel === "SMS" ? null : "Ask how the estimate looks." } } });
  };
  // In due order: Oscar two days overdue, Gwen's text one day overdue, Pat, Gwen's call and Una later today.
  await followUp(id.oscar, oscar, -2 * 1440, "Check in", step(1));
  await followUp(id.gwenText, gwen, -1440, "Referral follow-up", step(1));
  await followUp(id.pat, pat, 1, "Check in", step(1));
  await followUp(id.gwenCall, gwen, 2, "Estimate follow-up", step(2));
  await followUp(id.una, una, 3, "Bring the paint samples", oneTime.steps[0], oneTime.id);
});
test.beforeEach(async ({ context }) => {
  // The fixture's "today" is the UTC day it was made on.
  test.skip(new Date().toISOString().slice(0, 10) !== midnight.toISOString().slice(0, 10) || Date.now() > midnight.getTime() + 86_400_000 - 10 * 60_000, "Too close to midnight UTC.");
  await prisma.jump.updateMany({ where: { id: { in: all } }, data: { status: "PENDING", completedAt: null, completionMethod: null } });
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
});
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});
async function ready(page: Page) { await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "", { timeout: 60_000 }); }
const headline = (page: Page) => page.locator(".today-page-header p").first();
const sectionCount = (page: Page, section: "overdue" | "today") => page.locator(`[data-today-section="${section}"] .section-label span`);
const gwen = (page: Page) => page.locator('[data-today-section="today"]').getByRole("group", { name: "Gwen Group", exact: true });
const card = (page: Page, jumpId: string) => page.locator(`[data-jump-workflow="${jumpId}"]:not([data-follow-up-undo])`);
const openReview = (page: Page) => page.locator(".follow-up-review-sheet[open]");
const status = async (jumpId: string) => (await prisma.jump.findUniqueOrThrow({ where: { id: jumpId } })).status;
const metaParts = (scope: Locator) => scope.locator(".jump-meta > span").allTextContents();
/** Records an outcome. A tap before the review has checked the Mix's next step asks to save once it has (existing). */
async function record(page: Page, button: Locator, jumpId: string) {
  await button.click();
  const decisions = page.getByRole("group", { name: "Record journey outcome" });
  const recorded = page.locator(`[data-follow-up-undo][data-jump-workflow="${jumpId}"], [data-mix-end]`);
  await expect(decisions.or(recorded).first()).toBeVisible();
  if (await decisions.isVisible()) await decisions.getByRole("button", { name: "Save outcome", exact: true }).click();
}

test("one person's follow-ups due today share one card under Today, led by the earlier one", async ({ page }) => {
  await page.goto("/jumps"); await ready(page);
  const group = gwen(page);
  await expect(group.locator("[data-jump-workflow]")).toHaveCount(2);
  const [lead, also] = [card(page, id.gwenText), card(page, id.gwenCall)];
  // The earlier text leads, with its own overdue label; the call follows as an "Also due" row with its own review.
  await expect(lead.getByRole("heading", { name: "Gwen Group" })).toBeVisible();
  await expect(lead.locator(".due-pill")).toHaveText("1 day overdue");
  await expect(also.locator(".jump-also-due-row")).toHaveText("Also due: Call at 12:02 AM");
  await expect(also.getByRole("heading", { name: "Gwen Group" })).toBeHidden();
  await expect(also.locator(".jump-person-avatar")).toBeHidden();
  await expect(lead.getByRole("button", { name: "Review message for Gwen Group: Text, 1 day overdue", exact: true })).toBeVisible();
  await expect(also.getByRole("button", { name: "Review call for Gwen Group: Call at 12:02 AM", exact: true })).toBeVisible();
  await expect(lead.getByRole("button", { name: "Skip this text for Gwen Group", exact: true })).toBeVisible();
  await expect(also.getByRole("button", { name: /^Skip this/ })).toBeHidden();
  // Each control names its own follow-up, so no two on the card share a name (JITM-10 §2.14).
  expect(await group.locator("button:visible").evaluateAll(buttons => buttons.map(button => button.getAttribute("aria-label")))).toEqual([
    "Skip this text for Gwen Group", "Review message for Gwen Group: Text, 1 day overdue", "More options for Gwen Group: Text, 1 day overdue",
    "Review call for Gwen Group: Call at 12:02 AM", "More options for Gwen Group: Call at 12:02 AM"
  ]);
  // Sections count what they show; the header counts every overdue follow-up, Gwen's text included.
  await expect(sectionCount(page, "overdue")).toHaveText("1");
  await expect(sectionCount(page, "today")).toHaveText("4");
  await expect(headline(page)).toHaveText("5 follow-ups need your attention · 2 overdue.");
  // People with one follow-up due keep their own cards, in due order.
  await expect(page.locator('[data-today-section="overdue"] [data-jump-workflow]')).toHaveCount(1);
  await expect(page.locator('[data-today-section="today"] .jump-person-group')).toHaveCount(3);
  await expect(page.locator('[data-today-section="today"] .jump-person-group').first()).toHaveAttribute("aria-label", "Gwen Group");
});

test("skipping the earlier one leaves the later one in place as the person's card, until Undo", async ({ page }) => {
  await page.goto("/jumps"); await ready(page);
  await record(page, card(page, id.gwenText).getByRole("button", { name: "Skip this text for Gwen Group", exact: true }), id.gwenText);
  await expect.poll(() => status(id.gwenText)).toBe("SKIPPED");
  const call = card(page, id.gwenCall);
  // A quick action from the list opens no review (D70); the call now leads Gwen's card, under Today, with its heading.
  await expect(gwen(page).locator("[data-jump-workflow]")).toHaveCount(1);
  await expect(gwen(page).locator(".follow-up-review-sheet[open]")).toHaveCount(0);
  await expect(call.getByRole("heading", { name: "Gwen Group" })).toBeVisible();
  await expect(call.locator(".jump-also-due-row")).toBeHidden();
  await expect(call.getByRole("button", { name: /^Skip this/ })).toHaveCount(0);
  await expect(sectionCount(page, "today")).toHaveText("3");
  await expect(headline(page)).toHaveText("4 follow-ups need your attention · 1 overdue.");
  expect(await status(id.gwenCall)).toBe("PENDING");
  // Undo puts the text back at the front of Gwen's card.
  await page.locator(`[data-follow-up-undo][data-jump-workflow="${id.gwenText}"]`).getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => status(id.gwenText)).toBe("PENDING");
  await expect(gwen(page).locator("[data-jump-workflow]")).toHaveCount(2);
  await expect(card(page, id.gwenCall).locator(".jump-also-due-row")).toBeVisible();
  await expect(headline(page)).toHaveText("5 follow-ups need your attention · 2 overdue.");
});

/** Presses Enter on an outcome control; one pressed before the review has checked the Mix's next step asks to save first. */
async function pressOutcome(page: Page, button: Locator, jumpId: string) {
  await button.focus();
  await page.keyboard.press("Enter");
  const decisions = page.getByRole("group", { name: "Record journey outcome" });
  const recorded = page.locator(`[data-follow-up-undo][data-jump-workflow="${jumpId}"]`);
  await expect(decisions.or(recorded).first()).toBeVisible();
  if (await decisions.isVisible()) { await decisions.getByRole("button", { name: "Save outcome", exact: true }).focus(); await page.keyboard.press("Enter"); }
  await expect.poll(() => status(jumpId)).not.toBe("PENDING");
}

test("a quick action from the list keeps focus: on the person's next row, or else on the Undo", async ({ page }) => {
  await page.goto("/jumps"); await ready(page);
  await pressOutcome(page, card(page, id.gwenText).getByRole("button", { name: "Skip this text for Gwen Group", exact: true }), id.gwenText);
  await expect(card(page, id.gwenCall).getByRole("button", { name: /^Review call for Gwen Group/ })).toBeFocused();
  // Pat has nothing else due, so Mark done under "•••" leaves focus on its Undo.
  await card(page, id.pat).getByRole("button", { name: "More options for Pat Single", exact: true }).focus();
  await page.keyboard.press("Enter");
  await pressOutcome(page, page.getByRole("button", { name: "Mark done for Pat Single", exact: true }), id.pat);
  await expect(page.locator(`[data-follow-up-undo][data-jump-workflow="${id.pat}"]`).getByRole("button", { name: "Undo", exact: true })).toBeFocused();
});

test.describe("on a phone", () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== "mobile-chromium", "The phone review is a modal sheet."); });

  test("each review names the other follow-up, and recording the earlier one opens the later one's review", async ({ page }) => {
    await page.goto("/jumps"); await ready(page);
    await card(page, id.gwenText).getByRole("button", { name: "Review message for Gwen Group: Text, 1 day overdue", exact: true }).click();
    await expect(openReview(page).locator(".review-also-due")).toHaveText("Also due: Call at 12:02 AM.");
    await record(page, openReview(page).getByRole("button", { name: "Mark sent for Gwen Group", exact: true }), id.gwenText);
    // The call's own review opens next (D70), and with the text recorded it names nothing else.
    const callReview = card(page, id.gwenCall).locator(".follow-up-review-sheet[open]");
    await expect(callReview).toBeVisible();
    await expect(callReview.locator(".review-also-due")).toHaveCount(0);
    await expect(callReview.locator(`[data-follow-up-undo][data-jump-workflow="${id.gwenText}"]`)).toBeVisible();
    expect(await status(id.gwenCall)).toBe("PENDING");
  });

  test("recording the later one first never opens the earlier one next", async ({ page }) => {
    await prisma.jump.updateMany({ where: { id: { in: [id.oscar, id.pat, id.una] } }, data: { status: "DONE", completedAt: new Date(), completionMethod: "manual" } });
    await page.goto("/jumps"); await ready(page);
    await card(page, id.gwenCall).getByRole("button", { name: "Review call for Gwen Group: Call at 12:02 AM", exact: true }).click();
    await expect(openReview(page).locator(".review-also-due")).toHaveText("Also due: Text, 1 day overdue.");
    await record(page, openReview(page).getByRole("button", { name: "Mark done for Gwen Group", exact: true }), id.gwenCall);
    // Gwen's text was passed over by recording the call; it leads her card again, with its review closed.
    await expect(page.locator(`[data-follow-up-undo][data-jump-workflow="${id.gwenCall}"]`)).toBeVisible();
    await expect(card(page, id.gwenText).getByRole("heading", { name: "Gwen Group" })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(openReview(page)).toHaveCount(0);
    expect(await status(id.gwenText)).toBe("PENDING");
  });

  for (const width of [320, 390]) {
    test(`at ${width}px the first card and its Review sit inside the screen`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/jumps"); await ready(page);
      await expect(page.getByRole("button", { name: "Review message for Oscar Overdue", exact: true })).toBeVisible();
      // Measured in one step once the list has settled: the card inside the screen, its Review inside the card and
      // reachable at its right edge.
      await expect.poll(() => page.evaluate(screen => {
        const card = document.querySelector(".jump-card.next-follow-up");
        const review = card?.querySelector("[data-review-trigger]");
        if (!card || !review) return "missing";
        const box = card.getBoundingClientRect(), button = review.getBoundingClientRect();
        if (!box.width) return "not shown";
        const hit = document.elementFromPoint(button.right - 2, button.top + button.height / 2);
        return box.left >= 0 && box.right <= screen && button.right <= box.right && Boolean(hit && review.contains(hit)) ? "inside" : `outside ${JSON.stringify([box.left, box.right, button.right])}`;
      }, width)).toBe("inside");
    });
  }
});

test("a row says the reason, then the Mix, on one line; a one-time follow-up never names its hidden Mix", async ({ page }) => {
  await page.goto("/jumps"); await ready(page);
  const lead = card(page, id.gwenText);
  expect(await metaParts(lead)).toEqual(["Referral follow-up", "Estimate follow-up"]);
  expect(await lead.locator(".jump-meta > span").nth(1).evaluate(element => getComputedStyle(element, "::before").content)).toBe('" · "');
  expect(await lead.locator(".jump-meta").evaluate(element => getComputedStyle(element).whiteSpace)).toBe("nowrap");
  expect(await metaParts(card(page, id.pat))).toEqual(["Check in", "Estimate follow-up"]);
  expect(await metaParts(card(page, id.una))).toEqual(["Bring the paint samples"]);
  await expect(page.getByText("One-time follow-ups")).toHaveCount(0);
  // The review gives the reason under the Mix name; a one-time follow-up's review leads with its reason.
  await lead.getByRole("button", { name: "Review message for Gwen Group: Text, 1 day overdue", exact: true }).click();
  await expect(openReview(page).locator(".review-mix-name")).toHaveText("Estimate follow-up");
  await expect(openReview(page).locator(".review-reason")).toHaveText("Referral follow-up");
  await page.keyboard.press("Escape");
  await expect(card(page, id.gwenText).locator(".follow-up-review-sheet[open]")).toHaveCount(0);
  await card(page, id.una).getByRole("button", { name: "Review message for Una Once", exact: true }).click();
  const unaReview = card(page, id.una).locator(".follow-up-review-sheet[open]");
  await expect(unaReview.locator(".review-mix-name")).toHaveText("Bring the paint samples");
  await expect(unaReview.locator(".review-reason")).toHaveCount(0);
});
