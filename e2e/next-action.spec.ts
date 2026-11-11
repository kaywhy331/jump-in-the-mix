import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import type { Prisma } from "../src/generated/prisma/client";
import { emptyWorkflowState, type WorkflowDefinition } from "../src/lib/mix-workflow-types";
import { axeInPage } from "./axe-in-page";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Disposable local database only");
let userId: string, workspaceId: string, versionId: string, mixId: string, stepId: string;
const token = randomUUID(), suffix = randomUUID();
const now = new Date("2026-10-01T12:00:00Z");
test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `next-action-${suffix}@example.com`, name: "Next action owner", passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: `next-action-${suffix}`, name: "Next action fixture", members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "America/Los_Angeles" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  versionId = (await prisma.stepVersion.create({ data: { stepTemplate: { create: { workspaceId, name: "Check in", channel: "SMS" } }, version: 1, body: "Hi, checking in." } })).id;
  const mix = await prisma.mix.create({ data: { workspaceId, name: "One-time follow-up", status: "ACTIVE", source: "ONE_TIME", triggerMode: "MANUAL_START", steps: { create: { stepVersionId: versionId, dayOffset: 0, sortOrder: 1 } } }, include: { steps: true } });
  mixId = mix.id; stepId = mix.steps[0].id;
});
test.beforeEach(async ({ context }) => {
  await prisma.contact.deleteMany({ where: { workspaceId } });
  await prisma.job.deleteMany({ where: { workspaceId } });
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
});
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});
async function person() { return prisma.contact.create({ data: { workspaceId, displayName: "Morgan Fixture", firstName: "Morgan", phones: { create: { phone: "+1 555 010 1002", normalized: "+15550101002", isPrimary: true } } } }); }
async function visit(page: Page, href: string) { await page.goto(href); await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", ""); }
const next = (page: Page) => page.locator("[data-next-action-state]");
async function jump(contactId: string, scheduledAt: Date) {
  const id = randomUUID();
  return prisma.jump.create({ data: { id, workspaceId, contactId, mixId, mixStepId: stepId, stepVersionId: versionId, reason: "One-time check-in", status: "PENDING", scheduledAt, baseScheduledAt: scheduledAt, uniquenessKey: id, templateSnapshot: { oneTime: true, body: "Hi, checking in.", channel: "SMS", originalLocalDate: scheduledAt.toISOString().slice(0, 10), timezone: "America/Los_Angeles" }, renderedSnapshot: { body: "Hi, checking in." } } });
}
async function outcome(contactId: string) {
  const mix = await prisma.mix.create({ data: { workspaceId, name: "Estimate follow-up", status: "ACTIVE", source: "USER", triggerMode: "MANUAL_START", steps: { create: { stepVersionId: versionId, dayOffset: 0, sortOrder: 1 } } }, include: { steps: true } });
  const definition: WorkflowDefinition = { revision: 1, gatedStepIds: [], intentionalEnds: [], mixes: [{ id: mix.id, name: mix.name, status: "ACTIVE", source: "USER", triggerMode: "MANUAL_START", steps: [{ id: mix.steps[0].id, versionId, name: "Check in", channel: "SMS", dayOffset: 0, sendTimeMinutes: null, plannedAt: null, anchor: "CALENDAR_DAY", offsetMinutes: null, subject: null, body: "Hi, checking in.", script: null }] }], rules: [{ id: "decision", name: "Estimate reply", source: { mixId: mix.id, stepId: null }, enabled: true, mode: "CHOICE", join: null, routes: [{ id: "yes", label: "Yes", when: "OUTCOME", outcome: "yes", target: null, delayMinutes: 0, maxVisits: null, replace: false }] }] };
  const state = emptyWorkflowState();
  state.runs = ["first", "second"].map(id => ({ id, mixId: mix.id, startedAt: now.toISOString(), completedAt: now.toISOString(), status: "FINISHED", parentTransitionId: null, legacy: false }));
  state.evaluations = ["first", "second"].map(id => ({ id, ruleId: "decision", runId: id, visitId: null, occurredAt: now.toISOString(), outcome: null, decidedAt: null, generation: 0, status: "WAITING", joined: false }));
  return prisma.mixWorkflowInstance.create({ data: { workspaceId, contactId, admissionKey: randomUUID(), label: "Estimate follow-up", definition: definition as unknown as Prisma.InputJsonValue, state: state as unknown as Prisma.InputJsonValue } });
}

test("outcome-only work leads both surfaces, preserves secondary obligations and counts once", async ({ page }) => {
  const contact = await person(); await outcome(contact.id);
  let identity: string | null = null;
  for (const route of [`/contacts/${contact.id}`, "/jumps"]) {
    await visit(page, route);
    const primary = next(page).locator(".contact-next-description");
    await expect(primary).toHaveAttribute("data-next-action-kind", "outcome");
    const current = await primary.getAttribute("data-next-action-id");
    if (identity) expect(current).toBe(identity); else identity = current;
    await expect(next(page).locator(".contact-review-button")).toHaveText("Record outcome");
    const secondary = next(page).locator("summary");
    await expect(secondary).toBeVisible();
    await secondary.focus();
    await expect(secondary).toBeFocused();
    await secondary.press("Enter");
    await expect(next(page).locator(".next-action-secondary")).toHaveAttribute("open", "");
    await expect(next(page).locator("[data-next-action-kind=outcome]")).toHaveCount(2);
    await next(page).locator(".contact-review-button").focus();
    await expect(next(page).locator(".contact-review-button")).toBeFocused();
    expect((await axeInPage(page).include("[data-next-action-state]").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  }
  await expect(page.locator(".today-page-header p").first()).toHaveText("2 actions need your attention.");
  await expect(page.locator("#needs-your-input [data-next-action-id]")).toHaveCount(2);
  await next(page).locator(".contact-review-button").click();
  await expect(page).toHaveURL(new RegExp(`/journey\\?contactId=${contact.id}`));
});

test("an overdue one-time follow-up offers Review message while enrollment stays neutral", async ({ page }) => {
  const contact = await person(); const pending = await jump(contact.id, now);
  await visit(page, `/contacts/${contact.id}`);
  await expect(next(page).locator(".contact-review-button")).toHaveText("Review message");
  await expect(next(page).locator(".contact-review-button")).toHaveAttribute("href", `/jumps?jump=${pending.id}&range=all`);
  // Today lists its card, marked Next up, so Next doesn't repeat it (UXA-02).
  await visit(page, "/jumps");
  const card = page.locator(`[id="jump-${pending.id}"]`);
  await expect(card.locator(".eyebrow")).toHaveText("Next up");
  await expect(card.getByRole("button", { name: /^Review message for Morgan Fixture/ })).toBeVisible();
  await expect(next(page)).toHaveCount(0);
  await visit(page, `/contacts/${contact.id}`);
  await expect(page.locator(".contact-mixes")).toContainText("Not in a Mix yet.");
  expect(await prisma.mixAssignment.count({ where: { contactId: contact.id } })).toBe(0);
});

test("future appointments precede later follow-ups on both surfaces in the account timezone", async ({ page }) => {
  const contact = await person();
  // A fixed far-future fixture avoids changing with the wall clock during local qualification.
  await jump(contact.id, new Date("2099-11-04T17:00:00Z"));
  const appointment = await prisma.calendarEntry.create({ data: { workspaceId, contactId: contact.id, kind: "MEETING", title: "Site visit", startsAt: new Date("2099-11-03T17:00:00Z"), endsAt: new Date("2099-11-03T18:00:00Z"), timezone: "UTC" } });
  for (const route of [`/contacts/${contact.id}`, "/jumps"]) {
    await visit(page, route);
    await expect(next(page).locator(".contact-review-button")).toHaveText("View appointment");
    await expect(next(page)).toContainText("9:00 AM");
    await expect(next(page)).not.toContainText("Nothing scheduled");
  }
  await prisma.calendarEntry.delete({ where: { id: appointment.id } });
  for (const route of [`/contacts/${contact.id}`, "/jumps"]) {
    await visit(page, route);
    await expect(next(page).locator(".contact-review-button")).toHaveText("Review message");
    await expect(next(page)).toContainText("Nov 4");
    await expect(next(page)).not.toContainText("Nothing scheduled");
  }
  await visit(page, "/jumps?q=no-such-person");
  await expect(next(page)).toContainText("Nothing matches this view.");
});

test("empty, preparing, unreadable and Do not contact states remain distinct", async ({ page }) => {
  const contact = await person();
  await visit(page, `/contacts/${contact.id}`);
  await expect(next(page)).toContainText("Nothing scheduled.");
  const job = await prisma.job.create({ data: { workspaceId, task: "generate-jumps", payload: { contactId: contact.id } } });
  await page.reload(); await expect(next(page)).toContainText("Your follow-ups are being prepared.");
  await prisma.job.delete({ where: { id: job.id } });
  const work = await outcome(contact.id);
  await prisma.mixWorkflowInstance.update({ where: { id: work.id }, data: { state: { unreadable: true } } });
  for (const route of [`/contacts/${contact.id}`, "/jumps"]) {
    await visit(page, route);
    await expect(next(page)).toContainText("Your next steps could not be checked.");
    await expect(next(page).getByRole("link", { name: "Try again" })).toBeVisible();
  }
  await prisma.contactRelationshipState.create({ data: { workspaceId, contactId: contact.id, doNotContact: true } });
  await visit(page, `/contacts/${contact.id}`);
  await expect(next(page)).toContainText("Do not contact is on.");
  await expect(next(page).locator(".contact-review-button")).toHaveCount(0);
});

test("a Next link to another view looks pressed at once and stays so until that view arrives", async ({ page }) => {
  const contact = await person(); const pending = await jump(contact.id, new Date("2099-11-04T17:00:00Z"));
  await page.setViewportSize({ width: 375, height: 667 });
  await visit(page, "/jumps");
  // Nothing is due, so Today lists no card for it and Next leads with it (UXA-02).
  const link = next(page).locator(".contact-review-button");
  await expect(link).toHaveAttribute("href", `/jumps?jump=${pending.id}&range=all`);
  await expect.poll(() => link.evaluate(element => Object.keys(element).some(key => key.startsWith("__reactProps")))).toBe(true);
  const resting = await link.evaluate(element => getComputedStyle(element).filter);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  // The view's server response waits until released, as on a slow phone connection.
  await page.route("**/*", async route => { if (route.request().headers().rsc === "1") await gate; await route.continue().catch(() => undefined); });
  try {
    const box = (await link.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    expect(await link.evaluate(element => getComputedStyle(element).filter)).not.toBe(resting);
    await page.mouse.up();
    await expect(link.locator("[data-pending]")).toHaveCount(1, { timeout: 300 });
    expect(await link.evaluate(element => getComputedStyle(element).filter)).not.toBe(resting);
    release();
    await expect(page.getByRole("dialog", { name: "Follow up with Morgan Fixture" })).toBeVisible();
  } finally {
    release();
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
});
