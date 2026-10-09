import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";

// Today keeps momentum (D70, JITM-08 §2.36): after an outcome recorded in a review or the return tray, the next due
// follow-up's review opens by itself, the counts change at once, and each confirmation with its Undo shows inside the
// open review.
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", actionTimeout: 15_000 });
test.setTimeout(120_000);
let workspaceId: string, userId: string, shortMix: { mixId: string; mixStepId: string; stepVersionId: string };
let midnight: Date;
const ids: string[] = [];
let laterId = "";
const names = ["Olive Overdue", "Tara Today", "Tobias Today"];
const token = randomUUID();
const suffix = randomUUID();
const body = "Hi, checking in about your estimate.";
// Stored as the scheduler stores it, with an email and a call version, so each review shows its channel choice.
const snapshot = (scheduledAt: Date) => ({ subject: null, body, script: null, channel: "SMS", originalLocalDate: scheduledAt.toISOString().slice(0, 10), timezone: "UTC", variants: { EMAIL: { subject: "Your estimate", body, script: null }, CALL: { subject: null, body: null, script: "Ask how the estimate looks." } } });
test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `today-momentum-${suffix}@example.com`, name: "Momentum owner", passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: `today-momentum-${suffix}`, name: "Momentum fixture", members: { create: { userId } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Check in", channel: "SMS" } });
  const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body, variants: { create: [{ family: "EMAIL", subject: "Your estimate", body }, { family: "CALL", script: "Ask how the estimate looks." }] } } });
  // Two Beats, so finishing the first leaves the Mix running and Today doesn't ask what's next (JITM-09 §2.77).
  const mix = await prisma.mix.create({ data: { workspaceId, name: "Momentum plan", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: [{ stepVersionId: version.id, dayOffset: 0, sortOrder: 1 }, { stepVersionId: version.id, dayOffset: 7, sortOrder: 2 }] } }, include: { steps: true } });
  const short = await prisma.mix.create({ data: { workspaceId, name: "Short plan", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: { stepVersionId: version.id, dayOffset: 0, sortOrder: 1 } } }, include: { steps: true } });
  shortMix = { mixId: short.id, mixStepId: short.steps[0].id, stepVersionId: version.id };
  const first = mix.steps.find(step => step.sortOrder === 1)!;
  midnight = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  for (const [index, name] of names.entries()) {
    const contact = await prisma.contact.create({ data: { workspaceId, displayName: name, phones: { create: { phone: `+1555010${3100 + index}`, normalized: `+1555010${3100 + index}`, isPrimary: true } }, emails: { create: { email: `momentum-${index}@example.com`, normalized: `momentum-${index}@example.com`, isPrimary: true } } } });
    const id = `${suffix}-momentum-${index}`; ids.push(id);
    // One overdue follow-up, then two due today, in that order.
    const scheduledAt = index === 0 ? new Date(midnight.getTime() - 86_400_000) : new Date(midnight.getTime() + index * 60_000);
    await prisma.jump.create({ data: { id, workspaceId, contactId: contact.id, mixId: mix.id, mixStepId: first.id, stepVersionId: version.id, scheduledAt, baseScheduledAt: scheduledAt, status: "PENDING", reason: "Check in", uniquenessKey: id, templateSnapshot: snapshot(scheduledAt), renderedSnapshot: { subject: null, body, script: null } } });
    if (index === 0) {
      // Olive's next Beat, later this week, which her confirmation names.
      const later = new Date(midnight.getTime() + 6 * 86_400_000); laterId = `${suffix}-momentum-later`;
      const second = mix.steps.find(step => step.sortOrder === 2)!;
      await prisma.jump.create({ data: { id: laterId, workspaceId, contactId: contact.id, mixId: mix.id, mixStepId: second.id, stepVersionId: version.id, scheduledAt: later, baseScheduledAt: later, status: "PENDING", reason: "Second check in", uniquenessKey: laterId, templateSnapshot: snapshot(later), renderedSnapshot: { subject: null, body, script: null } } });
    }
  }
});
test.beforeEach(async ({ context }) => {
  // The fixture's "today" is the UTC day it was made on.
  test.skip(new Date().toISOString().slice(0, 10) !== midnight.toISOString().slice(0, 10) || Date.now() > midnight.getTime() + 86_400_000 - 10 * 60_000, "Too close to midnight UTC.");
  await prisma.jump.updateMany({ where: { id: { in: [...ids, laterId] } }, data: { status: "PENDING", completedAt: null, completionMethod: null } });
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
const openReview = (page: Page) => page.locator(".follow-up-review-sheet[open]");
const confirmationOf = (scope: Locator, id: string) => scope.locator(`[data-follow-up-undo][data-jump-workflow="${id}"]`);
const status = async (id: string) => (await prisma.jump.findUniqueOrThrow({ where: { id } })).status;
/** Inside a review the Undo keeps its own size beside its words, as in the floating stack. */
async function undoBesideWords(confirmation: Locator) {
  const undo = (await confirmation.getByRole("button", { name: "Undo", exact: true }).boundingBox())!;
  const words = (await confirmation.locator("strong").first().boundingBox())!;
  expect(undo.width).toBeLessThan(160);
  expect(undo.height).toBeGreaterThanOrEqual(44);
  expect(undo.x).toBeGreaterThan(words.x + words.width);
}
/** Opening a review records nothing: no status change, no handoff attempt, no action. */
async function untouched(id: string) {
  expect(await status(id)).toBe("PENDING");
  expect(await prisma.jumpAttempt.count({ where: { jumpId: id } })).toBe(0);
  expect(await prisma.jumpActionEvent.count({ where: { jumpId: id } })).toBe(0);
}
/** Records an outcome. A tap before the review has checked the Mix's next step asks to save once it has (existing). */
async function record(page: Page, button: Locator, id: string) {
  await button.click();
  const decisions = page.getByRole("group", { name: "Record journey outcome" });
  const recorded = page.locator(`[data-follow-up-undo][data-jump-workflow="${id}"], [data-mix-end]`);
  await expect(decisions.or(recorded).first()).toBeVisible();
  if (await decisions.isVisible()) await decisions.getByRole("button", { name: "Save outcome", exact: true }).click();
}
const markSent = (page: Page, review: Locator, name: string, id: string) => record(page, review.getByRole("button", { name: `Mark sent for ${name}`, exact: true }), id);
/** A person whose only Beat is due today in a one-Beat Mix, so recording it ends the Mix and Today asks what's next. */
async function mixEndPerson(name: string, phone: string) {
  const contact = await prisma.contact.create({ data: { workspaceId, displayName: name, phones: { create: { phone, normalized: phone, isPrimary: true } } } });
  const id = `${suffix}-mix-end-${contact.id}`;
  const scheduledAt = new Date(midnight.getTime() + 30_000);
  await prisma.jump.create({ data: { id, workspaceId, contactId: contact.id, ...shortMix, scheduledAt, baseScheduledAt: scheduledAt, status: "PENDING", reason: "Check in", uniquenessKey: id, templateSnapshot: snapshot(scheduledAt), renderedSnapshot: { subject: null, body, script: null } } });
  return { id, contactId: contact.id, remove: () => prisma.contact.deleteMany({ where: { id: contact.id } }) };
}
/**
 * Nothing covers the focused control: the point at its center hits it, and its focus ring, 6px outside the box it's drawn
 * around (the message's bubble, for the message), is inside the sheet and clear of the sheet's stuck header and action
 * bar, unless the control is inside one of them.
 */
async function focusedIsUncovered(page: Page) {
  return page.evaluate(() => {
    const focused = document.activeElement as HTMLElement | null;
    if (!focused || focused === document.body) return { name: "body", uncovered: true };
    const box = focused.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    const stuck = (selector: string) => {
      const element = focused.closest(".sheet-panel")?.querySelector(selector);
      return element && !element.contains(focused) && getComputedStyle(element).position === "sticky" ? element.getBoundingClientRect() : null;
    };
    const header = stuck(".sheet-header"), bar = stuck(".review-action-bar");
    const sheet = focused.closest(".sheet-panel")?.getBoundingClientRect();
    const ring = (focused.closest(".speech-bubble--compose") ?? focused).getBoundingClientRect();
    const clear = (!header || ring.top - 6 >= header.bottom) && (!bar || ring.bottom + 6 <= bar.top) && (!sheet || ring.bottom + 6 <= sheet.bottom);
    const name = focused.getAttribute("aria-label") ?? focused.textContent?.trim().slice(0, 30) ?? focused.tagName;
    return { name, uncovered: Boolean(hit && (hit === focused || focused.contains(hit))) && clear, at: [Math.round(ring.top - 6), Math.round(ring.bottom + 6), header ? Math.round(header.bottom) : null, bar ? Math.round(bar.top) : null] };
  });
}
/** Today moves a focused field clear of the stuck bar a frame after it takes focus, so this waits a few frames for it. */
async function settledFocus(page: Page) {
  let focused = await focusedIsUncovered(page);
  for (let attempt = 0; attempt < 10 && !focused.uncovered; attempt++) {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    focused = await focusedIsUncovered(page);
  }
  return focused;
}
async function expectUncovered(page: Page) {
  const focused = await settledFocus(page);
  expect(focused, `${focused.name} is covered (top, bottom, header bottom, bar top): ${JSON.stringify(focused.at)}`).toMatchObject({ uncovered: true });
}
async function returnFromApp(page: Page, id: string, name: string) {
  // "Open text" closes the review and remembers the follow-up; the tray asks about it when the owner comes back.
  await page.evaluate(({ jumpId, contactName }) => {
    const scope = document.querySelector<HTMLElement>("[data-browser-scope]")!.dataset.browserScope!;
    const detail = { scope, jumpId, contactName, channel: "SMS", openedAt: Date.now() };
    sessionStorage.setItem(`jitm:private:${scope}:opened-jump`, JSON.stringify(detail));
    window.dispatchEvent(new CustomEvent("jitm:jump-opened", { detail }));
  }, { jumpId: id, contactName: name });
  return page.getByLabel(`Finish follow-up with ${name}`).filter({ visible: true });
}

test.describe("on a phone", () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== "mobile-chromium", "The phone review is a modal sheet."); });

  test("an outcome in a review opens the next due one, with the confirmation and its Undo inside it", async ({ page }) => {
    await page.goto("/jumps"); await ready(page);
    await expect(headline(page)).toHaveText("3 follow-ups need your attention · 1 overdue.");
    await expect(doneCount(page)).toHaveText("0");
    await page.getByRole("button", { name: `Review message for ${names[0]}`, exact: true }).click();
    await markSent(page, openReview(page), names[0], ids[0]);
    const next = openReview(page);
    await expect(next.getByRole("button", { name: `Mark sent for ${names[1]}`, exact: true })).toBeVisible();
    await expect(next.locator(".sheet-header h2")).toBeFocused();
    await expect(headline(page)).toHaveText("2 follow-ups need your attention.");
    await expect(sectionCount(page, "today")).toHaveText("2");
    await expect(doneCount(page)).toHaveText("1");
    await untouched(ids[1]);
    // The card's own confirmation, in the review that covers the floating stack.
    const confirmation = confirmationOf(next, ids[0]);
    await expect(confirmation).toContainText("Follow-up completed");
    await expect(confirmation).toContainText(`${names[0]} · you can undo this for a moment`);
    await expect(confirmation).toContainText(/Next (?:follow-up|scheduled):/);
    await expect(page.locator("#follow-up-confirmations [data-follow-up-undo]")).toHaveCount(0);
    await undoBesideWords(confirmation);
    await confirmation.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    await expect.poll(() => status(ids[0])).toBe("PENDING");
    await expect(headline(page)).toHaveText("3 follow-ups need your attention · 1 overdue.");
    await expect(doneCount(page)).toHaveText("0");
    // Undo leaves the opened review where it is, with focus on its heading.
    await expect(next.getByRole("button", { name: `Mark sent for ${names[1]}`, exact: true })).toBeVisible();
    await expect(next.locator(".sheet-header h2")).toBeFocused();
  });

  test("two quick outcomes keep both confirmations, each with its own Undo, in the next review", async ({ page }) => {
    await page.goto("/jumps"); await ready(page);
    await page.getByRole("button", { name: `Review message for ${names[0]}`, exact: true }).click();
    await markSent(page, openReview(page), names[0], ids[0]);
    await expect(openReview(page).getByRole("button", { name: `Mark sent for ${names[1]}`, exact: true })).toBeVisible();
    await markSent(page, openReview(page), names[1], ids[1]);
    const third = openReview(page);
    await expect(third.getByRole("button", { name: `Mark sent for ${names[2]}`, exact: true })).toBeVisible();
    await expect(third.locator("[data-follow-up-undo]")).toHaveCount(2);
    await confirmationOf(third, ids[0]).getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => status(ids[0])).toBe("PENDING");
    await expect(confirmationOf(third, ids[0])).toHaveCount(0);
    await expect(confirmationOf(third, ids[1]).getByRole("button", { name: "Undo", exact: true })).toBeVisible();
    await expect(headline(page)).toHaveText("2 follow-ups need your attention · 1 overdue.");
  });

  test("a failed Undo shows its error in the review and can be tried again", async ({ page }) => {
    let fail = true;
    await page.route(`**/api/jumps/${ids[0]}/outcome`, async route => {
      if (fail && route.request().method() === "POST" && route.request().postDataJSON()?.outcome === "REOPENED") {
        fail = false;
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "The follow-up could not be reopened." }) });
        return;
      }
      await route.continue();
    });
    await page.goto("/jumps"); await ready(page);
    await page.getByRole("button", { name: `Review message for ${names[0]}`, exact: true }).click();
    await markSent(page, openReview(page), names[0], ids[0]);
    const confirmation = confirmationOf(openReview(page), ids[0]);
    await confirmation.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(confirmation.getByRole("alert")).toHaveText("The follow-up could not be reopened.");
    await expect(confirmation.getByRole("button", { name: "Undo", exact: true })).toBeFocused();
    expect(await status(ids[0])).toBe("DONE");
    await confirmation.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => status(ids[0])).toBe("PENDING");
  });

  test("the confirmation leaves with the card's own Undo window", async ({ page }) => {
    await page.clock.install();
    await page.goto("/jumps"); await ready(page);
    await page.getByRole("button", { name: `Review message for ${names[0]}`, exact: true }).click();
    await markSent(page, openReview(page), names[0], ids[0]);
    const next = openReview(page);
    await expect(confirmationOf(next, ids[0])).toBeVisible();
    await page.clock.runFor(10_500);
    await expect(confirmationOf(next, ids[0])).toHaveCount(0);
    await expect(next.getByRole("button", { name: `Mark sent for ${names[1]}`, exact: true })).toBeInViewport();
    expect(await status(ids[0])).toBe("DONE");
  });

  for (const viewport of [{ width: 320, height: 700 }, { width: 375, height: 667 }]) {
    test(`on a ${viewport.width}×${viewport.height} phone the handoff and outcomes stay on screen beside one or two confirmations`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/jumps"); await ready(page);
      await page.getByRole("button", { name: `Review message for ${names[0]}`, exact: true }).click();
      await markSent(page, openReview(page), names[0], ids[0]);
      for (const [name, confirmations] of [[names[1], 1], [names[2], 2]] as const) {
        const review = openReview(page);
        await expect(review.locator("[data-follow-up-undo]")).toHaveCount(confirmations);
        // JITM-08 §2.3: the handoff and the outcomes show together, without scrolling.
        await expect(review.getByRole("link", { name: `Open text for ${name}`, exact: true })).toBeInViewport();
        await expect(review.getByRole("button", { name: `Mark sent for ${name}`, exact: true })).toBeInViewport();
        await expect(review.getByRole("button", { name: "Skip Beat", exact: true })).toBeInViewport();
        await expect(review.locator("[data-follow-up-undo]").first().getByRole("button", { name: "Undo", exact: true })).toBeInViewport();
        if (confirmations === 1) await markSent(page, review, name, ids[1]);
      }
    });
  }

  test("closing the review Today opened puts its confirmation back in the floating stack, Undo and all", async ({ page }) => {
    await page.goto("/jumps"); await ready(page);
    await page.getByRole("button", { name: `Review message for ${names[0]}`, exact: true }).click();
    await markSent(page, openReview(page), names[0], ids[0]);
    await expect(confirmationOf(openReview(page), ids[0])).toBeVisible();
    await openReview(page).getByRole("button", { name: `Close Follow up with ${names[1]}`, exact: true }).click();
    const floating = confirmationOf(page.locator("#follow-up-confirmations"), ids[0]);
    await floating.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => status(ids[0])).toBe("PENDING");
  });

  test("a review opened by hand holds the confirmations its sheet would cover", async ({ page }) => {
    await page.goto("/jumps"); await ready(page);
    const card = page.locator(`#jump-${ids[0]}`);
    await card.getByRole("button", { name: /^More options for/ }).click();
    await record(page, card.getByRole("button", { name: /^Mark done for/ }), ids[0]);
    await expect(confirmationOf(page.locator("#follow-up-confirmations"), ids[0])).toBeVisible();
    await page.getByRole("button", { name: `Review message for ${names[2]}`, exact: true }).click();
    await expect(confirmationOf(openReview(page), ids[0]).getByRole("button", { name: "Undo", exact: true })).toBeVisible();
    await expect(page.locator("#follow-up-confirmations [data-follow-up-undo]")).toHaveCount(0);
  });

  test("Tab never lands behind the action bar on a 320×700 phone with one or two confirmations", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto("/jumps"); await ready(page);
    await page.getByRole("button", { name: `Review message for ${names[0]}`, exact: true }).click();
    await markSent(page, openReview(page), names[0], ids[0]);
    for (const [name, confirmations] of [[names[1], 1], [names[2], 2]] as const) {
      const review = openReview(page);
      await expect(review.locator("[data-follow-up-undo]")).toHaveCount(confirmations);
      await review.getByRole("textbox", { name: "Your message" }).focus();
      await expectUncovered(page);
      // Through the channel choice, the handoff and the outcomes: each control is in the clear when it takes focus. The
      // pass stops at the last outcome; tabbing on would leave the page, and refocusing it runs Today's account check.
      const reached: string[] = [];
      for (let step = 0; step < 12 && reached.at(-1) !== "Skip Beat"; step++) {
        await page.keyboard.press("Tab");
        const focused = await settledFocus(page);
        reached.push(focused.name);
        expect(focused, `${focused.name} is covered: ${JSON.stringify(focused.at)}`).toMatchObject({ uncovered: true });
      }
      expect(reached).toEqual(expect.arrayContaining(["Email", "Call", `Open text for ${name}`, `Mark sent for ${name}`, "Skip Beat"]));
      if (confirmations === 1) await markSent(page, review, name, ids[1]);
    }
  });

  test("on a screen 480px high or less the action bar scrolls with the review", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 240 });
    await page.goto("/jumps"); await ready(page);
    await page.getByRole("button", { name: `Review message for ${names[0]}`, exact: true }).click();
    const review = openReview(page);
    expect(await review.locator(".review-action-bar").evaluate(bar => getComputedStyle(bar).position)).toBe("static");
    await review.getByRole("textbox", { name: "Your message" }).focus();
    await expectUncovered(page);
  });

  for (const [width, height] of [[320, 700], [320, 568]] as const) {
    test(`at 200% text on a ${width}×${height} phone the bar scrolls with the review, so the message field is never caught under it`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/jumps"); await ready(page);
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      await page.getByRole("button", { name: `Review message for ${names[0]}`, exact: true }).click();
      await markSent(page, openReview(page), names[0], ids[0]);
      const review = openReview(page);
      await expect(confirmationOf(review, ids[0])).toBeVisible();
      await expect(review.locator(".sheet-panel")).toHaveAttribute("data-review-bar-flows", "");
      expect(await review.locator(".review-action-bar").evaluate(bar => getComputedStyle(bar).position)).toBe("static");
      await review.getByRole("textbox", { name: "Your message" }).focus();
      await expectUncovered(page);
    });
  }

  test("at 200% text on a 375×667 phone, outcome choices too tall for a stuck bar make it scroll with the review, choices in view", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    // The Mix's next step is checked slowly, so "Mark sent" opens the outcome choices first (the existing fallback).
    await page.route(url => url.pathname === "/api/mix-workflow", async route => { await new Promise(resolve => setTimeout(resolve, 4_000)); await route.continue(); });
    await page.goto("/jumps"); await ready(page);
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await page.getByRole("button", { name: `Review message for ${names[0]}`, exact: true }).click();
    await markSent(page, openReview(page), names[0], ids[0]);
    const next = openReview(page);
    await expect(confirmationOf(next, ids[0])).toBeVisible();
    const panel = next.locator(".sheet-panel");
    // Today has measured this review's bar, and it sticks before the tap.
    await expect.poll(() => panel.evaluate(element => (element as HTMLElement).style.getPropertyValue("--review-bar-height"))).not.toBe("");
    expect(await next.locator(".review-action-bar").evaluate(bar => getComputedStyle(bar).position)).toBe("sticky");
    const tapped = next.getByRole("button", { name: `Mark sent for ${names[1]}`, exact: true });
    await tapped.click();
    await expect(next.getByRole("group", { name: "Record journey outcome" })).toBeVisible();
    await expect(panel).toHaveAttribute("data-review-bar-flows", "");
    // The tapped "Mark sent" keeps focus, clear of the header, and "Save outcome" is on screen below the header (A11Y-06).
    await expect(tapped).toBeFocused();
    await expectUncovered(page);
    const save = next.getByRole("button", { name: "Save outcome", exact: true });
    await expect(save).toBeInViewport();
    expect(await save.evaluate(button => button.getBoundingClientRect().top >= button.closest(".sheet-panel")!.querySelector(".sheet-header")!.getBoundingClientRect().bottom)).toBe(true);
    await untouched(ids[1]);
  });

  test("a slow Undo doesn't pull focus out of the field the owner moved to", async ({ page }) => {
    await page.route(`**/api/jumps/${ids[0]}/outcome`, async route => {
      if (route.request().method() === "POST" && route.request().postDataJSON()?.outcome === "REOPENED") await new Promise(resolve => setTimeout(resolve, 1_500));
      await route.continue();
    });
    await page.goto("/jumps"); await ready(page);
    await page.getByRole("button", { name: `Review message for ${names[0]}`, exact: true }).click();
    await markSent(page, openReview(page), names[0], ids[0]);
    const review = openReview(page);
    await confirmationOf(review, ids[0]).getByRole("button", { name: "Undo", exact: true }).click();
    const message = review.getByRole("textbox", { name: "Your message" });
    await message.focus();
    await expect.poll(() => status(ids[0])).toBe("PENDING");
    await expect(confirmationOf(review, ids[0])).toHaveCount(0);
    await expect(message).toBeFocused();
  });

  test("a failed Undo leaves focus in the field the owner moved to", async ({ page }) => {
    await page.route(`**/api/jumps/${ids[0]}/outcome`, async route => {
      if (route.request().method() === "POST" && route.request().postDataJSON()?.outcome === "REOPENED") {
        await new Promise(resolve => setTimeout(resolve, 1_500));
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "The follow-up could not be reopened." }) });
        return;
      }
      await route.continue();
    });
    await page.goto("/jumps"); await ready(page);
    await page.getByRole("button", { name: `Review message for ${names[0]}`, exact: true }).click();
    await markSent(page, openReview(page), names[0], ids[0]);
    const review = openReview(page);
    const confirmation = confirmationOf(review, ids[0]);
    await confirmation.getByRole("button", { name: "Undo", exact: true }).click();
    const message = review.getByRole("textbox", { name: "Your message" });
    await message.focus();
    await expect(confirmation.getByRole("alert")).toHaveText("The follow-up could not be reopened.");
    await expect(message).toBeFocused();
    expect(await status(ids[0])).toBe("DONE");
  });

  test("when the last review finishes with nothing left to open, its confirmations float", async ({ page }) => {
    await page.goto("/jumps"); await ready(page);
    // Each confirmation has its own 10-second window, so the three outcomes and the checks run inside the first one's.
    await page.getByRole("button", { name: `Review message for ${names[0]}`, exact: true }).click();
    await markSent(page, openReview(page), names[0], ids[0]);
    await expect(openReview(page).getByRole("button", { name: `Mark sent for ${names[1]}`, exact: true })).toBeVisible();
    await expect(openReview(page).locator("[data-follow-up-undo]")).toHaveCount(1);
    await markSent(page, openReview(page), names[1], ids[1]);
    await expect(openReview(page).getByRole("button", { name: `Mark sent for ${names[2]}`, exact: true })).toBeVisible();
    await expect(openReview(page).locator("[data-follow-up-undo]")).toHaveCount(2);
    await markSent(page, openReview(page), names[2], ids[2]);
    await expect(openReview(page)).toHaveCount(0);
    const floating = page.locator("#follow-up-confirmations [data-follow-up-undo]");
    await expect(floating).toHaveCount(3);
    await expect(floating.getByRole("button", { name: "Undo", exact: true })).toHaveCount(3);
  });

  test("while Today asks what's next for someone, the next review still holds the new Undo", async ({ page }) => {
    const max = await mixEndPerson("Max Mixend", "+15550103198");
    try {
      await page.goto("/jumps"); await ready(page);
      await page.getByRole("button", { name: "Review message for Max Mixend", exact: true }).click();
      await markSent(page, openReview(page), "Max Mixend", max.id);
      const question = page.locator(`[data-mix-end="${max.contactId}"]`);
      await expect(question).toBeVisible();
      // The question waits for an answer while the owner carries on.
      await page.getByRole("button", { name: `Review message for ${names[0]}`, exact: true }).click();
      await markSent(page, openReview(page), names[0], ids[0]);
      const next = openReview(page);
      await expect(next.getByRole("button", { name: `Mark sent for ${names[1]}`, exact: true })).toBeVisible();
      await expect(confirmationOf(next, ids[0]).getByRole("button", { name: "Undo", exact: true })).toBeVisible();
      await expect(question).toBeAttached();
    } finally {
      await max.remove();
    }
  });

  test("an outcome recorded in the tray after returning from the app opens the next review", async ({ page }) => {
    await page.goto("/jumps"); await ready(page);
    const tray = await returnFromApp(page, ids[0], names[0]);
    await tray.getByRole("button", { name: "Sent", exact: true }).click();
    const next = openReview(page);
    await expect(next.getByRole("button", { name: `Mark sent for ${names[1]}`, exact: true })).toBeVisible();
    await expect(confirmationOf(next, ids[0])).toContainText(`${names[0]} · you can undo this for a moment`);
    await expect(headline(page)).toHaveText("2 follow-ups need your attention.");
    await expect.poll(() => status(ids[0])).toBe("DONE");
    await untouched(ids[1]);
  });

  test("a quick action from the list opens no review, and the counts still change at once", async ({ page }) => {
    await page.goto("/jumps"); await ready(page);
    const card = page.locator(`#jump-${ids[0]}`);
    await card.getByRole("button", { name: /^More options for/ }).click();
    await record(page, card.getByRole("button", { name: /^Mark done for/ }), ids[0]);
    await expect(page.locator("#follow-up-confirmations [data-follow-up-undo]")).toContainText(names[0]);
    await expect(headline(page)).toHaveText("2 follow-ups need your attention.");
    await expect(openReview(page)).toHaveCount(0);
    await expect(page.locator(`#jump-${ids[1]}`).getByRole("button", { name: /^More options for/ })).toBeVisible();
  });
});

test.describe("on a wider screen", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "The docked review shows from 768px.");
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("the docked review moves to the next due follow-up, with the confirmation inside it and focus on it", async ({ page }) => {
    await page.goto("/jumps"); await ready(page);
    const docked = openReview(page);
    await markSent(page, docked, names[0], ids[0]);
    await expect(docked.getByRole("button", { name: `Mark sent for ${names[1]}`, exact: true })).toBeVisible();
    await expect(docked.locator(".sheet-header h2")).toBeFocused();
    await expect(headline(page)).toHaveText("2 follow-ups need your attention.");
    await expect(sectionCount(page, "today")).toHaveText("2");
    await expect(doneCount(page)).toHaveText("1");
    // The emptied Overdue section leaves until Undo brings its follow-up back.
    await expect(page.locator('[data-today-section="overdue"]')).toBeHidden();
    await untouched(ids[1]);
    const confirmation = confirmationOf(docked, ids[0]);
    await expect(confirmation).toContainText(names[0]);
    await expect(page.locator("#follow-up-confirmations [data-follow-up-undo]")).toHaveCount(0);
    await undoBesideWords(confirmation);
    await confirmation.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    await expect.poll(() => status(ids[0])).toBe("PENDING");
    await expect(headline(page)).toHaveText("3 follow-ups need your attention · 1 overdue.");
    await expect(doneCount(page)).toHaveText("0");
    await expect(page.locator('[data-today-section="overdue"]')).toBeVisible();
    await expect(sectionCount(page, "overdue")).toHaveText("1");
    // Olive's own review, docked when the page opened, doesn't take the pane back; focus stays on the opened review.
    await expect(docked).toHaveCount(1);
    await expect(docked.getByRole("button", { name: `Mark sent for ${names[1]}`, exact: true })).toBeVisible();
    await expect(docked.locator(".sheet-header h2")).toBeFocused();
  });

  test("the docked review's buttons stay put when a confirmation leaves", async ({ page }) => {
    await page.clock.install();
    await page.goto("/jumps"); await ready(page);
    const docked = openReview(page);
    await markSent(page, docked, names[0], ids[0]);
    const send = docked.getByRole("button", { name: `Mark sent for ${names[1]}`, exact: true });
    await expect(confirmationOf(docked, ids[0])).toBeVisible();
    const before = (await send.boundingBox())!;
    await page.clock.runFor(10_500);
    await expect(confirmationOf(docked, ids[0])).toHaveCount(0);
    expect((await send.boundingBox())!.y).toBeCloseTo(before.y, 0);
  });

  test("the question about what's next sits below the Undos that float with it", async ({ page }) => {
    const mo = await mixEndPerson("Mo Mixend", "+15550103197");
    try {
      await page.goto("/jumps"); await ready(page);
      await page.getByRole("button", { name: "Review message for Mo Mixend", exact: true }).click();
      await markSent(page, openReview(page), "Mo Mixend", mo.id);
      await expect(page.locator(`[data-mix-end="${mo.contactId}"]`)).toBeVisible();
      // A list action after the question: its confirmation floats above the question, on screen and in the markup.
      const card = page.locator(`#jump-${ids[2]}`);
      await card.getByRole("button", { name: /^More options for/ }).click();
      await record(page, card.getByRole("button", { name: /^Mark done for/ }), ids[2]);
      await expect(confirmationOf(page.locator("#follow-up-confirmations"), ids[2])).toBeVisible();
      const order = await page.locator("#follow-up-confirmations").evaluate(stack => {
        const question = stack.querySelector("[data-mix-end]")!;
        const top = question.getBoundingClientRect().top;
        return [...stack.querySelectorAll("[data-follow-up-undo]")].map(undo => undo.getBoundingClientRect().bottom <= top + 1 && Boolean(undo.compareDocumentPosition(question) & Node.DOCUMENT_POSITION_FOLLOWING));
      });
      expect(order.length).toBeGreaterThan(0);
      expect(order.every(Boolean)).toBe(true);
      // Closing the question from the keyboard puts focus on an Undo still showing.
      await page.getByRole("button", { name: "Not now: leave Mo Mixend as they are", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(page.locator(`[data-mix-end="${mo.contactId}"]`)).toHaveCount(0);
      await expect(page.locator("#follow-up-confirmations [data-follow-up-undo] button:focus")).toHaveCount(1);
    } finally {
      await mo.remove();
    }
  });

  test("in a view that lists no completed follow-ups, Done stays as it is", async ({ page }) => {
    await page.goto("/jumps?range=week&status=pending"); await ready(page);
    await expect(doneCount(page)).toHaveText("0");
    const docked = openReview(page);
    await markSent(page, docked, names[1], ids[1]);
    await expect(confirmationOf(docked, ids[1])).toBeVisible();
    await expect(doneCount(page)).toHaveText("0");
  });

  test("after the last due follow-up in the list, the first one left opens", async ({ page }) => {
    await page.goto("/jumps"); await ready(page);
    await page.getByRole("button", { name: `Review message for ${names[2]}`, exact: true }).click();
    await markSent(page, openReview(page), names[2], ids[2]);
    await expect(openReview(page).getByRole("button", { name: `Mark sent for ${names[0]}`, exact: true })).toBeVisible();
  });

  test("a tray outcome leaves another follow-up's open review where it is", async ({ page }) => {
    await page.goto("/jumps"); await ready(page);
    const docked = openReview(page);
    await expect(docked.getByRole("button", { name: `Mark sent for ${names[0]}`, exact: true })).toBeVisible();
    const tray = await returnFromApp(page, ids[1], names[1]);
    await tray.getByRole("button", { name: "Sent", exact: true }).click();
    await expect.poll(() => status(ids[1])).toBe("DONE");
    // Today opened no review, so the confirmation floats as before.
    await expect(confirmationOf(page.locator("#follow-up-confirmations"), ids[1])).toBeVisible();
    await expect(docked.getByRole("button", { name: `Mark sent for ${names[0]}`, exact: true })).toBeVisible();
    await untouched(ids[2]);
  });

  test("Skip doesn't raise Done where Done counts only completed follow-ups", async ({ page }) => {
    await page.goto("/jumps"); await ready(page);
    await expect(doneCount(page)).toHaveText("0");
    await record(page, openReview(page).getByRole("button", { name: "Skip Beat", exact: true }), ids[0]);
    await expect(headline(page)).toHaveText("2 follow-ups need your attention.");
    await expect(confirmationOf(openReview(page), ids[0])).toContainText("Follow-up skipped");
    await expect(doneCount(page)).toHaveText("0");
    await page.reload(); await ready(page);
    await expect(doneCount(page)).toHaveText("0");
  });

  test("with nothing left due, the header already says what the next read will say", async ({ page }) => {
    // A search, so the next read's line is about this view.
    await page.goto(`/jumps?q=${encodeURIComponent(names[2])}`); await ready(page);
    await expect(headline(page)).toHaveText("1 follow-up needs your attention.");
    await markSent(page, openReview(page), names[2], ids[2]);
    await expect(openReview(page)).toHaveCount(0);
    await expect(headline(page)).not.toContainText("need your attention");
    const live = await headline(page).textContent();
    await page.reload(); await ready(page);
    await expect(headline(page)).toHaveText(live!);
  });
});

test("when the outcome finishes a Mix, Today asks what's next instead of opening the next review", async ({ page }) => {
  const contact = await prisma.contact.create({ data: { workspaceId, displayName: "Mia Mixend", phones: { create: { phone: "+15550103199", normalized: "+15550103199", isPrimary: true } } } });
  const id = `${suffix}-mix-end-${test.info().project.name}`;
  const scheduledAt = new Date(midnight.getTime() + 30_000);
  await prisma.jump.create({ data: { id, workspaceId, contactId: contact.id, ...shortMix, scheduledAt, baseScheduledAt: scheduledAt, status: "PENDING", reason: "Check in", uniquenessKey: id, templateSnapshot: snapshot(scheduledAt), renderedSnapshot: { subject: null, body, script: null } } });
  try {
    await page.goto("/jumps"); await ready(page);
    await page.getByRole("button", { name: "Review message for Mia Mixend", exact: true }).click();
    await markSent(page, openReview(page), "Mia Mixend", id);
    await expect(page.locator(`[data-mix-end="${contact.id}"]`)).toContainText("Short plan is finished for Mia Mixend.");
    await expect(openReview(page)).toHaveCount(0);
    await expect(headline(page)).toHaveText("3 follow-ups need your attention · 1 overdue.");
  } finally {
    await prisma.contact.deleteMany({ where: { id: contact.id } });
  }
});
