import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import type { Prisma } from "../src/generated/prisma/client";
import { emptyWorkflowState, type WorkflowDefinition } from "../src/lib/mix-workflow-types";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Disposable local database only");
const token = randomUUID(), suffix = randomUUID();
const at = new Date("2026-10-01T12:00:00Z");
let userId: string, workspaceId: string, versionId: string;
test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `hierarchy-${suffix}@example.test`, name: "Contact fixture owner", passwordHash: "fixture-only", emailVerifiedAt: at } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: `hierarchy-${suffix}`, name: "Contact fixture", members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date("2099-01-01T00:00:00Z") } });
  versionId = (await prisma.stepVersion.create({ data: { stepTemplate: { create: { workspaceId, name: "Check in", channel: "SMS" } }, version: 1, body: "Hi, checking in." } })).id;
});
test.beforeEach(async ({ context }) => {
  await prisma.contact.deleteMany({ where: { workspaceId } });
  await prisma.job.deleteMany({ where: { workspaceId } });
  await prisma.mix.deleteMany({ where: { workspaceId } });
  await prisma.journeyStage.deleteMany({ where: { workspaceId } });
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
});
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});
async function visit(page: Page, href: string) {
  await page.goto(href);
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");
}
async function person() {
  return prisma.contact.create({ data: { workspaceId, displayName: "Morgan Fixture", firstName: "Morgan", publicNotes: "Call after lunch. Discuss the estimate before the next visit.", phones: { create: { phone: "+14155550102", normalized: "+14155550102", isPrimary: true } } } });
}
async function mix(name: string, status: "ACTIVE" | "PAUSED" | "ARCHIVED" = "ACTIVE", source: "USER" | "ONE_TIME" = "USER") {
  return prisma.mix.create({ data: { workspaceId, name, status, source, triggerMode: "MANUAL_START", steps: { create: { stepVersionId: versionId, dayOffset: 0, sortOrder: 1 } } }, include: { steps: true } });
}
async function jump(contactId: string, plan: Awaited<ReturnType<typeof mix>>, status: "PENDING" | "DONE") {
  return prisma.jump.create({ data: { workspaceId, contactId, mixId: plan.id, mixStepId: plan.steps[0].id, stepVersionId: versionId, uniquenessKey: randomUUID(), reason: plan.name, status, scheduledAt: at, baseScheduledAt: at, completedAt: status === "DONE" ? at : null, templateSnapshot: { channel: "SMS", body: "Hi, checking in.", originalLocalDate: "2026-10-01", timezone: "UTC" }, renderedSnapshot: { body: "Hi, checking in." } } });
}
async function workflow(contactId: string, finished = false) {
  const plan = await mix(finished ? "Finished Journey without follow-ups" : "Waiting for estimate outcome");
  const definition: WorkflowDefinition = { revision: 1, gatedStepIds: [], intentionalEnds: [], mixes: [{ id: plan.id, name: plan.name, status: "ACTIVE", source: "USER", triggerMode: "MANUAL_START", steps: [] }], rules: [{ id: "decision", name: "Estimate reply", source: { mixId: plan.id, stepId: null }, enabled: true, mode: "CHOICE", join: null, routes: [{ id: "yes", label: "Yes", when: "OUTCOME", outcome: "yes", target: null, delayMinutes: 0, maxVisits: null, replace: false }] }] };
  const state = emptyWorkflowState();
  state.runs = [{ id: "run", mixId: plan.id, startedAt: at.toISOString(), completedAt: at.toISOString(), status: "FINISHED", parentTransitionId: null, legacy: false }];
  if (!finished) state.evaluations = [{ id: "outcome", ruleId: "decision", runId: "run", visitId: null, occurredAt: at.toISOString(), outcome: null, decidedAt: null, generation: 0, status: "WAITING", joined: false }];
  await prisma.mixWorkflowInstance.create({ data: { workspaceId, contactId, status: finished ? "FINISHED" : "ACTIVE", admissionKey: randomUUID(), label: plan.name, definition: definition as unknown as Prisma.InputJsonValue, state: state as unknown as Prisma.InputJsonValue } });
  return plan;
}

test("current and waiting work stays separate from completion, including archived outstanding work", async ({ page }) => {
  const contact = await person();
  const due = await mix("Estimate check-in"), done = await mix("Completed aftercare"), archived = await mix("Archived estimate", "ARCHIVED"), ended = await mix("Archived completed", "ARCHIVED"), paused = await mix("Paused seasonal", "PAUSED");
  await jump(contact.id, due, "PENDING"); await jump(contact.id, done, "DONE");
  await jump(contact.id, archived, "PENDING"); await jump(contact.id, ended, "DONE");
  await prisma.mixAssignment.create({ data: { workspaceId, contactId: contact.id, mixId: paused.id, assignmentKey: randomUUID(), mode: "SNAPSHOT", isActive: true } });
  await workflow(contact.id);
  const finished = await workflow(contact.id, true);
  await visit(page, `/contacts/${contact.id}`);
  const current = page.locator('[data-mix-group="current"]');
  for (const name of [due.name, archived.name, paused.name, "Waiting for estimate outcome"]) await expect(current).toContainText(name);
  await expect(current).toContainText("Waiting for the next step");
  await expect(page.locator('[data-mix-group="completed"]')).toContainText(done.name);
  await expect(page.locator('[data-mix-group="completed"]')).toContainText(finished.name);
  await expect(page.locator(".contact-mixes")).not.toContainText(ended.name);
  await expect(page.getByRole("heading", { name: "Current Mixes", exact: true })).toHaveCount(1);
  await page.locator(`[data-mix-row="${archived.id}"]`).getByRole("button").click();
  const sheet = page.getByRole("dialog", { name: archived.name, exact: true });
  await expect(sheet).toContainText("reviewing it does not reactivate the Mix");
  await expect(sheet.getByRole("button", { name: /Resume|Stop for|Remove from/ })).toHaveCount(0);
  expect((await prisma.mix.findUniqueOrThrow({ where: { id: archived.id } })).status).toBe("ARCHIVED");
});

test("current stage is distinct from dated changes and real returns are retained", async ({ page }) => {
  const contact = await person();
  const lead = await prisma.journeyStage.create({ data: { workspaceId, name: "Lead", position: 0 } });
  const client = await prisma.journeyStage.create({ data: { workspaceId, name: "Client", position: 1 } });
  await prisma.journeyStage.create({ data: { workspaceId, name: "Future possibility", position: 2 } });
  await prisma.contactJourney.create({ data: { workspaceId, contactId: contact.id, stageId: client.id, stageSince: new Date("2026-10-20T12:00:00Z"), automatic: false } });
  for (const [i, stage] of [lead, client, lead].entries()) await prisma.journeyEvent.create({ data: { workspaceId, contactId: contact.id, resultingStageId: stage.id, eventType: "MANUAL", eventKey: randomUUID(), source: "fixture", occurredAt: new Date(`2026-10-${10 + i}T12:00:00Z`) } });
  await visit(page, `/contacts/${contact.id}`);
  await expect(page.getByRole("button", { name: "Change stage: Client", exact: true })).toBeVisible();
  await page.locator(".contact-detail-more > summary").click();
  const history = page.locator(".contact-stage-records");
  await history.locator("summary").focus(); await page.keyboard.press("Enter");
  await expect(history.getByRole("listitem")).toHaveText(["LeadOct 10", "ClientOct 11", "LeadOct 12"]);
  await expect(history.locator("time")).toHaveCount(3);
  await expect(history).not.toContainText("Future possibility");
  await expect(history.locator('[datetime="2026-10-20T12:00:00.000Z"]')).toHaveCount(0);
});

test("No Mix remains neutral and a one-time follow-up still has its own action", async ({ page }) => {
  const contact = await person(); const oneTime = await mix("One-time callback", "ACTIVE", "ONE_TIME");
  const followUp = await jump(contact.id, oneTime, "PENDING");
  await visit(page, `/contacts/${contact.id}`);
  await expect(page.locator('[data-status="no-mix"]')).toBeVisible();
  await expect(page.locator(".contact-next-line").getByRole("link", { name: "Review message" })).toHaveAttribute("href", `/jumps?jump=${followUp.id}&range=all`);
  await expect(page.locator(".contact-mixes")).not.toContainText(oneTime.name);
  await expect(page.getByText("No next action planned", { exact: true })).toHaveCount(0);
  await visit(page, "/contacts");
  await expect(page.locator(".contact-row-summary .contact-no-mix")).toHaveText("No Mix");
  await expect(page.locator(".contact-row-next")).toBeVisible();
});

test("single-page results keep announcements while pagination appears only when needed", async ({ page }) => {
  await visit(page, "/contacts");
  await expect(page.getByRole("navigation", { name: "Contact result pages" })).toHaveCount(0);
  await person(); await visit(page, "/contacts");
  await expect(page.getByRole("navigation", { name: "Contact result pages" })).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: /1 contact|1 person/i }).first()).toContainText(/1/);
  await prisma.contact.createMany({ data: Array.from({ length: 50 }, (_, i) => ({ workspaceId, displayName: `Pagination Fixture ${i}` })) });
  await visit(page, "/contacts");
  const pages = page.getByRole("navigation", { name: "Contact result pages" });
  await expect(pages).toContainText("Page 1 of 2");
  await pages.getByRole("link", { name: "Next", exact: true }).click();
  await expect(pages).toContainText("Page 2 of 2");
});

test("readable phone display preserves links and activity describes a recorded event", async ({ page }) => {
  const contact = await person();
  await prisma.contactActivity.create({ data: { workspaceId, contactId: contact.id, actorUserId: userId, kind: "JUMP_OUTCOME", outcome: "COMPLETED", channel: "SMS", summary: "Owner marked the follow-up complete.", occurredAt: at } });
  await visit(page, `/contacts/${contact.id}`);
  await expect(page.locator(".contact-detail-row").getByRole("link", { name: "(415) 555-0102", exact: true })).toHaveAttribute("href", "tel:+14155550102");
  await expect(page.getByRole("link", { name: "Text", exact: true })).toHaveAttribute("href", "sms:+14155550102");
  await expect(page.getByRole("link", { name: "Call", exact: true })).toHaveAttribute("href", "tel:+14155550102");
  await expect(page.locator("#contact-history")).toContainText("Text · Marked complete");
  await expect(page.locator("#contact-history")).toContainText("delivery not verified");
  const notes = await page.locator(".contact-notes").boundingBox(), next = await page.locator(".contact-next-line").boundingBox();
  expect(notes!.y + notes!.height).toBeLessThanOrEqual(next!.y);
  expect((await prisma.contactPhone.findFirstOrThrow({ where: { contactId: contact.id } })).phone).toBe("+14155550102");
});
