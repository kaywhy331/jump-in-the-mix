import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";

// Today keeps momentum (D70, JITM-08 §2.36): after an outcome the next due follow-up's review opens by itself, the
// counts change at once, and the Undo stays on screen, inside the next review on a phone.
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", actionTimeout: 15_000 });
test.setTimeout(120_000);
let workspaceId: string, userId: string, shortMix: { mixId: string; mixStepId: string; stepVersionId: string };
let midnight: Date;
const ids: string[] = [];
const names = ["Olive Overdue", "Tara Today", "Tobias Today"];
const token = randomUUID();
const suffix = randomUUID();
test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `today-momentum-${suffix}@example.com`, name: "Momentum owner", passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: `today-momentum-${suffix}`, name: "Momentum fixture", members: { create: { userId } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Check in", channel: "SMS" } });
  const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Hi, checking in." } });
  // Two Beats, so finishing the first leaves the Mix running and Today doesn't ask what's next (JITM-09 §2.77).
  const mix = await prisma.mix.create({ data: { workspaceId, name: "Momentum plan", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: [{ stepVersionId: version.id, dayOffset: 0, sortOrder: 1 }, { stepVersionId: version.id, dayOffset: 7, sortOrder: 2 }] } }, include: { steps: true } });
  const short = await prisma.mix.create({ data: { workspaceId, name: "Short plan", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: { stepVersionId: version.id, dayOffset: 0, sortOrder: 1 } } }, include: { steps: true } });
  shortMix = { mixId: short.id, mixStepId: short.steps[0].id, stepVersionId: version.id };
  const first = mix.steps.find(step => step.sortOrder === 1)!;
  midnight = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  for (const [index, name] of names.entries()) {
    const contact = await prisma.contact.create({ data: { workspaceId, displayName: name, phones: { create: { phone: `+1555010${3100 + index}`, normalized: `+1555010${3100 + index}`, isPrimary: true } } } });
    const id = `${suffix}-momentum-${index}`; ids.push(id);
    // One overdue follow-up, then two due today, in that order.
    const scheduledAt = index === 0 ? new Date(midnight.getTime() - 86_400_000) : new Date(midnight.getTime() + index * 60_000);
    await prisma.jump.create({ data: { id, workspaceId, contactId: contact.id, mixId: mix.id, mixStepId: first.id, stepVersionId: version.id, scheduledAt, status: "PENDING", reason: "Check in", uniquenessKey: id, templateSnapshot: {}, renderedSnapshot: { body: version.body } } });
  }
});
test.beforeEach(async ({ context }) => {
  await prisma.jump.updateMany({ where: { id: { in: ids } }, data: { status: "PENDING", completedAt: null, completionMethod: null } });
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
});
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});
async function ready(page: Page) { await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "", { timeout: 60_000 }); }
const headline = (page: Page) => page.locator(".today-page-header p").first();
const sectionCount = (page: Page, section: "overdue" | "today") => page.locator(`[data-today-section="${section}"] .section-label span`);
const doneCount = (page: Page) => page.locator("details.today-queue-group:not([data-today-section]) > summary > span");
const status = async (id: string) => (await prisma.jump.findUniqueOrThrow({ where: { id } })).status;
/** Records "Mark sent". A tap before the review has checked the Mix's next step asks to save once it has (existing). */
async function markSent(page: Page, review: Locator, name: string, id: string) {
  await record(page, review.getByRole("button", { name: `Mark sent for ${name}`, exact: true }), id);
}
async function markDone(page: Page, card: Locator, id: string) {
  await record(page, card.getByRole("button", { name: /^Mark done for/ }), id);
}
async function record(page: Page, button: Locator, id: string) {
  await button.click();
  const decisions = page.getByRole("group", { name: "Record journey outcome" });
  const recorded = page.locator(`#follow-up-confirmations [data-jump-workflow="${id}"], [data-mix-end]`);
  await expect(decisions.or(recorded).first()).toBeVisible();
  if (await decisions.isVisible()) await decisions.getByRole("button", { name: "Save outcome", exact: true }).click();
}

test("on a phone, an outcome opens the next due review with the Undo inside it, and counts change at once", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "The phone review is a modal sheet.");
  await page.goto("/jumps"); await ready(page);
  await expect(headline(page)).toHaveText("3 follow-ups need your attention · 1 overdue.");
  await expect(doneCount(page)).toHaveText("0");
  await page.getByRole("button", { name: `Review message for ${names[0]}`, exact: true }).click();
  await markSent(page, page.locator(".follow-up-review-sheet[open]"), names[0], ids[0]);
  // The next due follow-up's review opens by itself, and the counts already show the outcome.
  const next = page.locator(".follow-up-review-sheet[open]");
  await expect(next).toHaveCount(1);
  await expect(next.getByRole("button", { name: `Mark sent for ${names[1]}`, exact: true })).toBeVisible();
  await expect(next.locator(".sheet-header h2")).toBeFocused();
  await expect(headline(page)).toHaveText("2 follow-ups need your attention.");
  await expect(sectionCount(page, "today")).toHaveText("2");
  await expect(doneCount(page)).toHaveText("1");
  // Opening it recorded nothing for that person.
  expect(await status(ids[1])).toBe("PENDING");
  // The review covers the floating confirmation on a phone, so the Undo is inside it.
  const momentum = next.locator(".review-momentum");
  await expect(momentum).toContainText("Follow-up completed");
  await expect(momentum).toContainText(`${names[0]} · you can undo this for a moment`);
  await momentum.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(momentum).toHaveCount(0);
  await expect.poll(() => status(ids[0])).toBe("PENDING");
  await expect(headline(page)).toHaveText("3 follow-ups need your attention · 1 overdue.");
  await expect(doneCount(page)).toHaveText("0");
  // Undo leaves the opened review where it is.
  await expect(next.getByRole("button", { name: `Mark sent for ${names[1]}`, exact: true })).toBeVisible();
});

test("on a phone, an outcome recorded in the tray after returning from the app opens the next review", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "The phone review is a modal sheet.");
  await page.goto("/jumps"); await ready(page);
  // "Open text" closes the review and remembers the follow-up; the tray asks about it when the owner comes back.
  await page.evaluate(({ jumpId, contactName }) => {
    const scope = document.querySelector<HTMLElement>("[data-browser-scope]")!.dataset.browserScope!;
    const detail = { scope, jumpId, contactName, channel: "SMS", openedAt: Date.now() };
    sessionStorage.setItem(`jitm:private:${scope}:opened-jump`, JSON.stringify(detail));
    window.dispatchEvent(new CustomEvent("jitm:jump-opened", { detail }));
  }, { jumpId: ids[0], contactName: names[0] });
  const tray = page.getByLabel(`Finish follow-up with ${names[0]}`).filter({ visible: true });
  await tray.getByRole("button", { name: "Sent", exact: true }).click();
  const next = page.locator(".follow-up-review-sheet[open]");
  await expect(next.getByRole("button", { name: `Mark sent for ${names[1]}`, exact: true })).toBeVisible();
  await expect(next.locator(".review-momentum")).toContainText(`${names[0]} · you can undo this for a moment`);
  await expect(headline(page)).toHaveText("2 follow-ups need your attention.");
  await expect.poll(() => status(ids[0])).toBe("DONE");
  expect(await status(ids[1])).toBe("PENDING");
});

test("a quick action from the list opens no review, and the counts still change at once", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "On a phone an unexpected review would cover the list.");
  await page.goto("/jumps"); await ready(page);
  const card = page.locator(`#jump-${ids[0]}`);
  await card.getByRole("button", { name: /^More options for/ }).click();
  await markDone(page, card, ids[0]);
  await expect(page.locator("#follow-up-confirmations [data-follow-up-undo]")).toContainText(names[0]);
  await expect(headline(page)).toHaveText("2 follow-ups need your attention.");
  await expect(page.locator(".follow-up-review-sheet[open]")).toHaveCount(0);
  await expect(page.locator(`#jump-${ids[1]}`).getByRole("button", { name: /^More options for/ })).toBeVisible();
});

test("on a phone, the Undo inside the review ends with the card's own", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "The phone review is a modal sheet.");
  await page.clock.install();
  await page.goto("/jumps"); await ready(page);
  await page.getByRole("button", { name: `Review message for ${names[1]}`, exact: true }).click();
  await markSent(page, page.locator(".follow-up-review-sheet[open]"), names[1], ids[1]);
  const next = page.locator(".follow-up-review-sheet[open]");
  // After the last due card, the next due one is the first left in the list.
  await expect(next.getByRole("button", { name: `Mark sent for ${names[2]}`, exact: true })).toBeVisible();
  await expect(next.locator(".review-momentum")).toContainText(`${names[1]} · you can undo this for a moment`);
  await page.clock.runFor(10_500);
  await expect(next.locator(".review-momentum")).toHaveCount(0);
  await expect(page.locator(`#follow-up-confirmations [data-jump-workflow="${ids[1]}"]`)).toHaveCount(0);
  expect(await status(ids[1])).toBe("DONE");
});

test("on a wider screen, the docked review moves to the next due follow-up and the Undo stays in the confirmation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The docked review shows from 768px.");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/jumps"); await ready(page);
  const docked = page.locator(".follow-up-review-sheet[open]");
  await markSent(page, docked, names[0], ids[0]);
  await expect(docked.getByRole("button", { name: `Mark sent for ${names[1]}`, exact: true })).toBeVisible();
  await expect(headline(page)).toHaveText("2 follow-ups need your attention.");
  await expect(sectionCount(page, "today")).toHaveText("2");
  await expect(doneCount(page)).toHaveText("1");
  await expect(docked.locator(".review-momentum")).toHaveCount(0);
  // The emptied Overdue section leaves until Undo brings its follow-up back.
  await expect(page.locator('[data-today-section="overdue"]')).toBeHidden();
  const confirmation = page.locator("#follow-up-confirmations [data-follow-up-undo]");
  await expect(confirmation).toContainText(names[0]);
  expect(await status(ids[1])).toBe("PENDING");
  await confirmation.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect.poll(() => status(ids[0])).toBe("PENDING");
  await expect(headline(page)).toHaveText("3 follow-ups need your attention · 1 overdue.");
  await expect(doneCount(page)).toHaveText("0");
  await expect(page.locator('[data-today-section="overdue"]')).toBeVisible();
  await expect(sectionCount(page, "overdue")).toHaveText("1");
});

test("the last due follow-up leaves nothing to open, and the summary says so at once", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "One project is enough for the end of the list.");
  await prisma.jump.updateMany({ where: { id: { in: ids.slice(0, 2) } }, data: { status: "DONE", completedAt: new Date(), completionMethod: "done" } });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/jumps"); await ready(page);
  await expect(headline(page)).toHaveText("1 follow-up needs your attention.");
  await expect(doneCount(page)).toHaveText("2");
  await markSent(page, page.locator(".follow-up-review-sheet[open]"), names[2], ids[2]);
  await expect(headline(page)).toHaveText("Nothing else needs your attention right now.");
  await expect(doneCount(page)).toHaveText("3");
  await expect(page.locator(".follow-up-review-sheet[open]")).toHaveCount(0);
});

test("when the outcome finishes a Mix, Today asks what's next instead of opening the next review", async ({ page }) => {
  const contact = await prisma.contact.create({ data: { workspaceId, displayName: "Mia Mixend", phones: { create: { phone: "+15550103199", normalized: "+15550103199", isPrimary: true } } } });
  const id = `${suffix}-mix-end-${test.info().project.name}`;
  await prisma.jump.create({ data: { id, workspaceId, contactId: contact.id, ...shortMix, scheduledAt: new Date(midnight.getTime() + 30_000), status: "PENDING", reason: "Check in", uniquenessKey: id, templateSnapshot: {}, renderedSnapshot: { body: "Hi, checking in." } } });
  try {
    await page.goto("/jumps"); await ready(page);
    await page.getByRole("button", { name: "Review message for Mia Mixend", exact: true }).click();
    await markSent(page, page.locator(".follow-up-review-sheet[open]"), "Mia Mixend", id);
    await expect(page.locator(`[data-mix-end="${contact.id}"]`)).toContainText("Short plan is finished for Mia Mixend.");
    await expect(page.locator(".follow-up-review-sheet[open]")).toHaveCount(0);
    await expect(headline(page)).toHaveText("3 follow-ups need your attention · 1 overdue.");
  } finally {
    await prisma.contact.deleteMany({ where: { id: contact.id } });
  }
});
