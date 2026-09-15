import { createHash, randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { APPOINTMENT_HOLD_METHODS, reconcileJumps } from "../src/lib/jump-engine";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", actionTimeout: 15_000 });
test.setTimeout(120_000);

let workspaceId: string, userId: string, contactId: string, planId: string;
const token = randomUUID();
const visitDate = (() => { const d = new Date(Date.now() + 6 * 86_400_000); return d.toISOString().slice(0, 10); })();

test.beforeAll(async () => {
  const suffix = randomUUID();
  userId = (await prisma.user.create({ data: { email: `appointment-visit-${suffix}@example.com`, name: "Visit fixture owner", passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: `appointment-visit-${suffix}`, name: "Visit fixture", members: { create: { userId } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  contactId = (await prisma.contact.create({ data: { workspaceId, firstName: "Casey", displayName: "Casey Brook", phones: { create: { phone: "+15550100600", normalized: "+15550100600", isPrimary: true } } } })).id;
  const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Visit reminder", channel: "SMS" } });
  const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Hi {{First Name}}, see you {{Appointment Date}} at {{Appointment Time}} at {{Appointment Location}}." } });
  const mix = await prisma.mix.create({ data: { workspaceId, name: "Estimate visit plan", status: "ACTIVE", triggerMode: "MANUAL_START" } });
  planId = mix.id;
  await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: version.id, dayOffset: -1, sortOrder: 1, sendTimeMinutes: 9 * 60 } });
});
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
});
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});

async function ready(page: Page) { await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "", { timeout: 60_000 }); }
async function audit(page: Page) { expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]); }

test("saves a visit with its details and plan in one step, anchors the follow-up, and holds it per visit", async ({ page }) => {
  await page.goto(`/calendar?contact=${contactId}&date=${visitDate}`); await ready(page);
  const form = page.locator("form.form-grid");
  await form.getByLabel("Title").fill("Kitchen estimate");
  await form.getByLabel("Where").fill("12 Elm St");
  await form.getByLabel("Details the customer should be reminded of (optional)").fill("Bring the tile samples");
  await form.getByLabel("Follow-up plan for this visit (optional)").selectOption(planId);
  await audit(page);
  await form.getByRole("button", { name: "Save event", exact: true }).click();
  await expect(page.getByText(/line up with this visit\. 1 beat is scheduled and will appear on Today\./)).toBeVisible();
  const binding = await prisma.appointmentBinding.findFirstOrThrow({ where: { workspaceId, mixId: planId }, include: { calendarEntry: true } });
  expect(binding.calendarEntry).toMatchObject({ title: "Kitchen estimate", location: "12 Elm St", details: "Bring the tile samples", contactId });
  expect(binding.automaticDelivery).toBe(false);
  await expect(page.locator(".calendar-binding").getByText("Estimate visit plan", { exact: false })).toBeVisible();

  // The worker's pass generates the anchored reminder, the day before at nine.
  await reconcileJumps({ workspaceId, mixId: planId });
  const reminder = await prisma.jump.findFirstOrThrow({ where: { appointmentBindingId: binding.id } });
  expect(reminder.reason).toBe("Kitchen estimate");
  expect((reminder.renderedSnapshot as { body: string }).body).toContain("Hi Casey, see you");
  expect((reminder.renderedSnapshot as { body: string }).body).toContain("at 12 Elm St.");
  await page.goto("/jumps?range=week&status=pending"); await ready(page);
  await expect(page.locator(`#jump-${reminder.id}`)).toContainText("Kitchen estimate");

  // Holding the visit's follow-ups takes only this visit's rows off Today until resumed.
  await page.goto(`/calendar?date=${visitDate}`); await ready(page);
  await page.locator(".calendar-binding").getByRole("button", { name: "Hold follow-ups", exact: true }).click();
  await expect(page.locator(".calendar-binding")).toContainText("on hold");
  await reconcileJumps({ workspaceId, mixId: planId });
  expect(await prisma.jump.findUniqueOrThrow({ where: { id: reminder.id } })).toMatchObject({ status: "CANCELED", completionMethod: APPOINTMENT_HOLD_METHODS.held });
  await page.locator(".calendar-binding").getByRole("button", { name: "Resume follow-ups", exact: true }).click();
  await expect(page.locator(".calendar-binding")).not.toContainText("on hold");
  await reconcileJumps({ workspaceId, mixId: planId });
  expect((await prisma.jump.findUniqueOrThrow({ where: { id: reminder.id } })).status).toBe("PENDING");

  // Recording a missed visit holds this visit's follow-ups; clearing it brings them back.
  await page.locator(".calendar-outcome").getByRole("button", { name: "No-show", exact: true }).click();
  await expect(page.locator(".calendar-outcome")).toContainText("Visit missed");
  await reconcileJumps({ workspaceId, mixId: planId });
  expect(await prisma.jump.findUniqueOrThrow({ where: { id: reminder.id } })).toMatchObject({ status: "CANCELED", completionMethod: APPOINTMENT_HOLD_METHODS.noShow });
  await page.locator(".calendar-outcome").getByRole("button", { name: "Clear outcome", exact: true }).click();
  await expect(page.locator(".calendar-outcome")).toContainText("Outcome not recorded");
  await reconcileJumps({ workspaceId, mixId: planId });
  expect((await prisma.jump.findUniqueOrThrow({ where: { id: reminder.id } })).status).toBe("PENDING");
});

test("asks for one inline choice when the entered phone and email match different saved people, keeping everything typed", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const blakeEmail = `blake-${suffix}@example.com`;
  await prisma.contact.create({ data: { workspaceId, firstName: "Avery", displayName: `Avery ${suffix}`, phones: { create: { phone: "+15550100601", normalized: "+15550100601", isPrimary: true } } } });
  const blake = await prisma.contact.create({ data: { workspaceId, firstName: "Blake", displayName: `Blake ${suffix}`, emails: { create: { email: blakeEmail, normalized: blakeEmail, isPrimary: true } } } });
  await page.goto(`/calendar?date=${visitDate}`); await ready(page);
  const form = page.locator("form.form-grid");
  await form.getByLabel("Title").fill("Bathroom estimate");
  await form.getByLabel("Where").fill("9 Pine Ct");
  await form.getByLabel("Details the customer should be reminded of (optional)").fill("Side entrance");
  await form.getByText("Add a new person for this visit").click();
  await form.getByLabel("Name", { exact: true }).fill("A. Stone");
  await form.getByLabel("Phone", { exact: true }).fill("+1 555-010-0601");
  await form.getByLabel("Email", { exact: true }).fill(blakeEmail);
  await form.getByLabel("Follow-up plan for this visit (optional)").selectOption(planId);
  await form.getByRole("button", { name: "Save event", exact: true }).click();
  const choice = form.getByRole("group", { name: "Which saved person is this visit with?" });
  await expect(choice).toBeVisible();
  await expect(choice.getByRole("radio", { name: new RegExp(`Avery ${suffix}`) })).toBeVisible();
  await expect(choice.getByRole("radio", { name: new RegExp(`Blake ${suffix}`) })).toBeVisible();
  // Nothing typed was lost, and nothing was saved yet.
  await expect(form.getByLabel("Title")).toHaveValue("Bathroom estimate");
  await expect(form.getByLabel("Where")).toHaveValue("9 Pine Ct");
  await expect(form.getByLabel("Details the customer should be reminded of (optional)")).toHaveValue("Side entrance");
  await expect(form.getByLabel("Phone", { exact: true })).toHaveValue("+1 555-010-0601");
  await expect(form.getByLabel("Follow-up plan for this visit (optional)")).toHaveValue(planId);
  expect(await prisma.calendarEntry.count({ where: { workspaceId, title: "Bathroom estimate" } })).toBe(0);
  await audit(page);
  await choice.getByRole("radio", { name: new RegExp(`Blake ${suffix}`) }).check();
  // The default time collides with the first visit. That error keeps everything typed as well.
  await form.getByRole("button", { name: "Save event", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("overlaps");
  await expect(form.getByLabel("Title")).toHaveValue("Bathroom estimate");
  await expect(form.getByLabel("Email", { exact: true })).toHaveValue(blakeEmail);
  await expect(form.getByLabel("Where")).toHaveValue("9 Pine Ct");
  await form.getByLabel(/Allow an intentional overlap/).check();
  await form.getByRole("button", { name: "Save event", exact: true }).click();
  await expect(page.getByText(/line up with this visit\. 1 beat is scheduled and will appear on Today\./)).toBeVisible();
  const entry = await prisma.calendarEntry.findFirstOrThrow({ where: { workspaceId, title: "Bathroom estimate" } });
  expect(entry).toMatchObject({ contactId: blake.id, location: "9 Pine Ct", details: "Side entrance" });
  expect(await prisma.appointmentBinding.count({ where: { calendarEntryId: entry.id, contactId: blake.id, mixId: planId } })).toBe(1);
  expect(await prisma.contact.count({ where: { workspaceId, displayName: "A. Stone" } })).toBe(0);
});
