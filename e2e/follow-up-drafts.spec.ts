import { createHash, randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", actionTimeout: 15_000 });
test.setTimeout(120_000);

let workspaceId: string, userId: string, contactId: string, jumpId: string;
const token = randomUUID();
const templateBody = "Hi {{First Name}}, your estimate is ready. {{SMS Signature}}";
const rendered = (firstName: string, tail = "your estimate is ready.") => `Hi ${firstName}, ${tail} Draft fixture owner`;

test.beforeAll(async () => {
  const suffix = randomUUID();
  userId = (await prisma.user.create({ data: { email: `follow-up-drafts-${suffix}@example.com`, name: "Draft fixture owner", passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: `follow-up-drafts-${suffix}`, name: "Draft fixture", members: { create: { userId } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Estimate text", channel: "SMS" } });
  const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: templateBody } });
  const mix = await prisma.mix.create({ data: { workspaceId, name: "Estimate plan", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: [{ stepVersionId: version.id, dayOffset: 0, sortOrder: 1 }] } }, include: { steps: true } });
  contactId = (await prisma.contact.create({ data: { workspaceId, firstName: "Alex", displayName: "Alex Rivera", phones: { create: { phone: "+15550100200", normalized: "+15550100200", isPrimary: true } } } })).id;
  const scheduledAt = new Date(Date.now() - 60_000);
  jumpId = `${suffix}-draft-jump`;
  await prisma.jump.create({ data: {
    id: jumpId, workspaceId, contactId, mixId: mix.id, mixStepId: mix.steps[0].id, stepVersionId: version.id, scheduledAt, baseScheduledAt: scheduledAt, status: "PENDING", reason: "Estimate follow-up", uniquenessKey: jumpId,
    templateSnapshot: { subject: null, body: templateBody, script: null, channel: "SMS", originalLocalDate: scheduledAt.toISOString().slice(0, 10), timezone: "UTC" },
    renderedSnapshot: { subject: null, body: rendered("Alex"), script: null }
  } });
});
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
});
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});

async function visit(page: Page) { await page.goto("/jumps"); await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "", { timeout: 60_000 }); }
const editor = (page: Page) => page.locator(`#jump-${jumpId} .editable-follow-up`);
const field = (page: Page) => editor(page).getByRole("textbox", { name: "Fine-tune before sending", exact: true });
const draftRow = () => prisma.jumpDraft.findUnique({ where: { jumpId_family: { jumpId, family: "TEXT" } } });
async function setName(first: string) { await prisma.contact.update({ where: { id: contactId }, data: { firstName: first, displayName: `${first} Rivera` } }); }
async function seedDraft(body: string) {
  const jump = await prisma.jump.findUniqueOrThrow({ where: { id: jumpId }, select: { stepVersionId: true } });
  await prisma.jumpDraft.deleteMany({ where: { jumpId } });
  await prisma.jumpDraft.create({ data: { jumpId, family: "TEXT", workspaceId, stepVersionId: jump.stepVersionId, body } });
}
async function audit(page: Page) { expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]); }

test("keeps fine-tuned text across a reload and renders it with the contact's current details", async ({ page }) => {
  await setName("Alex");
  await prisma.jumpDraft.deleteMany({ where: { jumpId } });
  await visit(page);
  await expect(field(page)).toHaveValue(rendered("Alex"));
  await field(page).fill(rendered("Alex", "your estimate is ready to review."));
  await expect(editor(page).getByRole("status")).toHaveText("Saved");
  await expect(page.locator('[data-follow-up-draft="true"]')).toHaveCount(0);
  // Only the literal text changed, so the name and signature stay tokens in storage.
  expect((await prisma.jumpDraft.findUniqueOrThrow({ where: { jumpId_family: { jumpId, family: "TEXT" } } })).body).toBe("Hi {{First Name}}, your estimate is ready to review. {{SMS Signature}}");

  await visit(page);
  await expect(field(page)).toHaveValue(rendered("Alex", "your estimate is ready to review."));
  await expect(editor(page).getByRole("link", { name: "Open text for Alex Rivera", exact: true })).toHaveAttribute("href", `sms:+15550100200?body=${encodeURIComponent(rendered("Alex", "your estimate is ready to review."))}`);

  await prisma.contact.update({ where: { id: contactId }, data: { firstName: "Alexandra", displayName: "Alexandra Rivera" } });
  await visit(page);
  await expect(field(page)).toHaveValue(rendered("Alexandra", "your estimate is ready to review."));

  await editor(page).getByRole("button", { name: "Discard edits", exact: true }).click();
  await expect(field(page)).toHaveValue(rendered("Alexandra"));
  await expect.poll(() => prisma.jumpDraft.count({ where: { jumpId } })).toBe(0);
  await expect(page.locator('[data-follow-up-draft="true"]')).toHaveCount(0);
});

test("guards leaving only while keystrokes have not reached the server", async ({ page }) => {
  await setName("Alexandra");
  await prisma.jumpDraft.deleteMany({ where: { jumpId } });
  let release = () => undefined as void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let held_count = 0;
  await page.route(`**/api/jumps/${jumpId}/draft`, async (route) => { held_count += 1; await held; await route.continue(); });
  await visit(page);
  await field(page).fill(rendered("Alexandra", "your estimate is ready whenever you are."));
  await expect(page.locator('[data-follow-up-draft="true"]')).toHaveCount(1);
  // The autosave has started and is being held; leaving now must be guarded.
  await expect.poll(() => held_count).toBeGreaterThan(0);
  await page.getByRole("link", { name: /This week/ }).click();
  const guard = page.getByRole("dialog", { name: "Keep your message edits?", exact: true });
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page).toHaveURL(/\/jumps$/);
  release();
  await expect(editor(page).getByRole("status")).toHaveText("Saved");
  await expect(page.locator('[data-follow-up-draft="true"]')).toHaveCount(0);
  await page.getByRole("link", { name: /This week/ }).click();
  await expect(page).toHaveURL(/range=week/);
  await expect(guard).toBeHidden();
  await prisma.jumpDraft.deleteMany({ where: { jumpId } });
});


test("keeps local wording on a revision conflict and offers one choice", async ({ page }) => {
  await setName("Alexandra");
  await prisma.jumpDraft.deleteMany({ where: { jumpId } });
  await visit(page);
  await field(page).fill(rendered("Alexandra", "your estimate is ready, first device."));
  await expect(editor(page).getByRole("status")).toHaveText("Saved");
  // Another device saves over it.
  const other = await draftRow();
  await prisma.jumpDraft.update({ where: { jumpId_family: { jumpId, family: "TEXT" } }, data: { body: "Hi {{First Name}}, saved elsewhere. {{SMS Signature}}", revision: { increment: 1 } } });
  const mine = rendered("Alexandra", "your estimate is ready, first device, then more.");
  await field(page).fill(mine);
  const conflict = editor(page).locator("[data-follow-up-conflict='save']");
  await expect(conflict).toBeVisible();
  await expect(conflict).toContainText("saved elsewhere");
  // Nothing replaced the local text, and it is still marked unsaved.
  await expect(field(page)).toHaveValue(mine);
  await expect(page.locator('[data-follow-up-draft="true"]')).toHaveCount(1);
  expect((await draftRow())?.revision).toBe((other?.revision ?? 0) + 1);
  await audit(page);
  await conflict.getByRole("button", { name: "Keep my wording", exact: true }).click();
  await expect(editor(page).getByRole("status")).toHaveText("Saved");
  await expect(field(page)).toHaveValue(mine);
  expect((await draftRow())?.body).toBe("Hi {{First Name}}, your estimate is ready, first device, then more. {{SMS Signature}}");

  // The other way round: take the version saved elsewhere, explicitly.
  await prisma.jumpDraft.update({ where: { jumpId_family: { jumpId, family: "TEXT" } }, data: { body: "Hi {{First Name}}, theirs wins. {{SMS Signature}}", revision: { increment: 1 } } });
  await field(page).fill(rendered("Alexandra", "mine again."));
  await expect(conflict).toBeVisible();
  await conflict.getByRole("button", { name: "Use the other version", exact: true }).click();
  await expect(field(page)).toHaveValue(rendered("Alexandra", "theirs wins."));
  await expect(page.locator('[data-follow-up-draft="true"]')).toHaveCount(0);
});

test("recovers a failed discard and keeps text typed during one", async ({ page }) => {
  await setName("Alexandra");
  await seedDraft("Hi {{First Name}}, theirs wins. {{SMS Signature}}");
  await visit(page);
  await expect(field(page)).toHaveValue(rendered("Alexandra", "theirs wins."));
  let fail = true;
  const seen: string[] = [];
  await page.route(`**/api/jumps/${jumpId}/draft`, async (route) => {
    seen.push(route.request().method());
    if (route.request().method() === "DELETE" && fail) return route.abort("failed");
    return route.continue();
  });
  await editor(page).getByRole("button", { name: "Discard edits", exact: true }).click();
  await expect(editor(page).getByRole("status")).toContainText("the discard didn't go through");
  expect(seen).toContain("DELETE");
  // The draft is still on the server and the text is still on screen.
  expect(await draftRow()).not.toBeNull();
  await expect(field(page)).toHaveValue(rendered("Alexandra", "theirs wins."));
  fail = false;
  await editor(page).getByRole("button", { name: "Try discarding again", exact: true }).click();
  await expect(field(page)).toHaveValue(rendered("Alexandra"));
  await expect.poll(() => draftRow()).toBeNull();
  await expect(page.locator('[data-follow-up-draft="true"]')).toHaveCount(0);
});

test("says when a detail written over by hand has changed, and when a draft holds automatic delivery", async ({ page }) => {
  await setName("Alexandra");
  await prisma.jumpDraft.deleteMany({ where: { jumpId } });
  await prisma.automationPreference.upsert({ where: { workspaceId }, create: { workspaceId, enabled: true, smsEnabled: true, reviewWindowMinutes: 15 }, update: { enabled: true, smsEnabled: true } });
  await visit(page);
  // Writing the name by hand detaches the token; the draft records "Alexandra" as the value at removal.
  // Cutting into the name itself detaches the token; editing only the words around it would keep it.
  await field(page).fill("Hi Alex, the estimate is attached. Draft fixture owner");
  await expect(editor(page).getByRole("status")).toHaveText("Saved");
  await expect(editor(page).locator("[data-follow-up-held]")).toContainText("won’t send automatically");
  expect((await draftRow())?.detached).toEqual({ "{{First Name}}": "Alexandra" });
  await setName("Alexa");
  await visit(page);
  const notice = editor(page).locator("[data-follow-up-changed-details]");
  await expect(notice).toContainText("first name");
  await expect(notice).toContainText("“Alexandra” to “Alexa”");
  // The owner's words are untouched.
  await expect(field(page)).toHaveValue("Hi Alex, the estimate is attached. Draft fixture owner");
  await audit(page);
  await prisma.automationPreference.deleteMany({ where: { workspaceId } });
  await prisma.jumpDraft.deleteMany({ where: { jumpId } });
});

test("records the exact opened text as an attempt and ties the outcome to it", async ({ page }) => {
  await setName("Alexandra");
  await prisma.jumpDraft.deleteMany({ where: { jumpId } });
  await prisma.jumpAttempt.deleteMany({ where: { jumpId } });
  await visit(page);
  const text = rendered("Alexandra", "your estimate is ready whenever suits you.");
  await field(page).fill(text);
  await expect(editor(page).getByRole("status")).toHaveText("Saved");
  // Chromium cannot open sms: links, so the page stays put while the same bookkeeping runs as on a phone.
  await editor(page).getByRole("link", { name: /^Open text for/ }).click();
  const tray = page.getByLabel(/^Finish follow-up with/).filter({ visible: true });
  await expect(tray).toBeVisible();
  // A cold dev server compiles the attempt and action routes on their first hit; allow for it.
  await expect.poll(() => prisma.jumpAttempt.count({ where: { jumpId } }), { timeout: 45_000 }).toBe(1);
  const attempt = await prisma.jumpAttempt.findFirstOrThrow({ where: { jumpId } });
  expect(attempt).toMatchObject({ body: text, channel: "SMS", family: "TEXT", contactId, outcomeActivityId: null });
  expect(attempt.draftRevision).toBeGreaterThan(0);
  await expect.poll(async () => (await prisma.jumpActionEvent.findFirst({ where: { jumpId, action: "COMPOSED" }, orderBy: { occurredAt: "desc" } }))?.attemptId, { timeout: 45_000 }).toBe(attempt.id);
  await audit(page);

  await tray.getByRole("button", { name: "Sent", exact: true }).click();
  await expect(tray).toBeHidden({ timeout: 45_000 });
  await expect.poll(async () => (await prisma.jumpAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).outcomeActivityId, { timeout: 45_000 }).not.toBeNull();
  const linked = await prisma.jumpAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
  expect(linked).toMatchObject({ body: text, recordedAt: expect.any(Date) });
  const activity = await prisma.contactActivity.findUniqueOrThrow({ where: { id: linked.outcomeActivityId! } });
  expect(activity.metadata).toMatchObject({ attemptId: attempt.id, preparationEvidence: "attempt" });
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.includes("opened-")))).toEqual([]);
});
