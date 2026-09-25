import { createHash, randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { APPOINTMENT_HOLD_METHODS, reconcileJumps } from "../src/lib/jump-engine";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", actionTimeout: 15_000 });
test.setTimeout(150_000);

let workspaceId: string, userId: string, contactId: string;
const token = randomUUID();
const visitDate = (() => { const d = new Date(Date.now() + 6 * 86_400_000); return d.toISOString().slice(0, 10); })();

test.beforeAll(async () => {
  const suffix = randomUUID();
  userId = (await prisma.user.create({ data: { email: `beat-timing-${suffix}@example.com`, name: "Timing fixture owner", passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: `beat-timing-${suffix}`, name: "Timing fixture", members: { create: { userId } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  contactId = (await prisma.contact.create({ data: { workspaceId, firstName: "Casey", displayName: "Casey Brook", phones: { create: { phone: "+15550100700", normalized: "+15550100700", isPrimary: true } } } })).id;
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

test("a beat is timed as a positive duration before or after the visit, or after it is marked completed, and the setting survives editing", async ({ page }) => {
  const name = `Estimate visit ${randomUUID().slice(0, 8)}`;
  await page.goto("/mixes/new?custom=1"); await ready(page);
  await page.getByLabel("Mix name").fill(name);
  await page.getByLabel("When should it start?").selectOption("MANUAL_START");
  const beat = page.getByRole("group", { name: "Beat 1" });
  const dayField = beat.getByRole("spinbutton", { name: "Days after start", exact: true });
  await expect(dayField).toBeVisible();
  // Appointment timing lives in the beat's options.
  await beat.getByLabel("Options for beat 1", { exact: true }).click();
  await beat.getByText("Appointment timing (optional)", { exact: true }).click();
  await beat.getByLabel("Count from").selectOption("APPOINTMENT_START");
  // The day field gives way to a positive minutes field plus before/after; the day-based settings no longer apply to this beat.
  await expect(dayField).toHaveCount(0);
  await expect(beat.getByText("More timing options")).toHaveCount(0);
  const minutes = beat.getByLabel("Minutes", { exact: true });
  await expect(minutes).toHaveAttribute("min", "0");
  await minutes.fill("90");
  await beat.getByLabel("Before or after").selectOption("before");
  await expect(beat.getByText(/Becomes due 1 hour 30 minutes before the appointment starts\. It is preparation, so it lapses once the visit has started\./)).toBeVisible();
  await beat.getByLabel("Message").fill("Hi {{First Name}}, leaving now for {{Appointment Title}}.");
  await audit(page);
  await page.getByRole("button", { name: "Create a mix" }).click();
  const mix = await expect.poll(() => prisma.mix.findFirst({ where: { workspaceId, name }, include: { steps: { orderBy: { sortOrder: "asc" } } } }), { timeout: 20_000 }).not.toBeNull().then(() => prisma.mix.findFirstOrThrow({ where: { workspaceId, name }, include: { steps: { orderBy: { sortOrder: "asc" } } } }));
  // The stored offset keeps its sign; the editor showed a positive duration.
  expect(mix.steps.map((step) => [step.anchor, step.offsetMinutes, step.dayOffset])).toEqual([["APPOINTMENT_START", -90, 0]]);

  // The editor reads the saved timing back as ninety minutes before, and can move the beat to the recorded completion.
  await page.goto(`/mixes/${mix.id}/edit`); await ready(page);
  const saved = page.getByRole("group", { name: "Beat 1" });
  await saved.getByLabel("Options for beat 1", { exact: true }).click();
  await saved.getByText("Appointment timing (optional)", { exact: true }).click();
  await expect(saved.getByLabel("Count from")).toHaveValue("APPOINTMENT_START");
  await expect(saved.getByLabel("Minutes", { exact: true })).toHaveValue("90");
  await expect(saved.getByLabel("Before or after")).toHaveValue("before");
  await saved.getByLabel("Count from").selectOption("VISIT_COMPLETED");
  // Completion timing is after-only: no before/after choice, zero allowed.
  await expect(saved.getByLabel("Before or after")).toHaveCount(0);
  const after = saved.getByLabel("Minutes after completion", { exact: true });
  await expect(after).toHaveAttribute("min", "0");
  await after.fill("0");
  await expect(saved.getByText(/Becomes due as soon as the visit is marked completed\. It has nothing to count from until you mark the visit completed\./)).toBeVisible();
  await after.fill("60");
  await expect(saved.getByText(/Becomes due 1 hour after the visit is marked completed\./)).toBeVisible();
  await page.getByRole("button", { name: /Save mix|Review and start/ }).click();
  await expect.poll(async () => (await prisma.mixStep.findFirstOrThrow({ where: { mixId: mix.id, isActive: true } })).anchor, { timeout: 20_000 }).toBe("VISIT_COMPLETED");
  expect(await prisma.mixStep.findFirstOrThrow({ where: { mixId: mix.id, isActive: true } })).toMatchObject({ anchor: "VISIT_COMPLETED", offsetMinutes: 60 });

  // Back to the calendar-day rule: the day field returns and the minutes are cleared.
  await page.goto(`/mixes/${mix.id}/edit`); await ready(page);
  const again = page.getByRole("group", { name: "Beat 1" });
  await again.getByLabel("Options for beat 1", { exact: true }).click();
  await again.getByText("Appointment timing (optional)", { exact: true }).click();
  await again.getByLabel("Count from").selectOption("CALENDAR_DAY");
  await expect(again.getByRole("spinbutton", { name: "Days after start", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Save mix|Review and start/ }).click();
  await expect.poll(async () => (await prisma.mixStep.findFirstOrThrow({ where: { mixId: mix.id, isActive: true } })).anchor, { timeout: 20_000 }).toBe("CALENDAR_DAY");
  expect((await prisma.mixStep.findFirstOrThrow({ where: { mixId: mix.id, isActive: true } })).offsetMinutes).toBeNull();
});

test("an appointment-based mix starts with no one enrolled, attaches to the visit the owner chooses, and reports only the work that exists", async ({ page }) => {
  const name = `Estimate visit flow ${randomUUID().slice(0, 8)}`;
  await page.goto("/mixes/new?custom=1"); await ready(page);
  await page.getByLabel("Mix name").fill(name);
  await page.getByLabel("When should it start?").selectOption("MANUAL_START");
  await page.getByLabel("After saving").selectOption("ACTIVE");
  const first = page.getByRole("group", { name: "Beat 1" });
  await first.getByLabel("Options for beat 1", { exact: true }).click();
  await first.getByText("Appointment timing (optional)", { exact: true }).click();
  await first.getByLabel("Count from").selectOption("APPOINTMENT_START");
  await first.getByLabel("Minutes", { exact: true }).fill("90");
  await first.getByLabel("Before or after").selectOption("before");
  await first.getByLabel("Message").fill("Hi {{First Name}}, leaving now for {{Appointment Title}}.");
  await page.getByRole("button", { name: "Add a beat" }).click();
  const second = page.getByRole("group", { name: "Beat 2" });
  await second.getByLabel("Channel").selectOption("SMS");
  await second.getByLabel("Options for beat 2", { exact: true }).click();
  await second.getByText("Appointment timing (optional)", { exact: true }).click();
  await second.getByLabel("Count from").selectOption("APPOINTMENT_END");
  await second.getByLabel("Minutes", { exact: true }).fill("30");
  await second.getByLabel("Before or after").selectOption("after");
  await expect(second.getByText(/Becomes due 30 minutes after the appointment ends\. It waits until you record that the visit happened\./)).toBeVisible();
  await second.getByLabel("Message").fill("Thanks for having me today, {{First Name}}.");
  await page.getByRole("button", { name: "Add a beat" }).click();
  const third = page.getByRole("group", { name: "Beat 3" });
  await third.getByLabel("Channel").selectOption("SMS");
  await third.getByLabel("Options for beat 3", { exact: true }).click();
  await third.getByText("Appointment timing (optional)", { exact: true }).click();
  await third.getByLabel("Count from").selectOption("VISIT_COMPLETED");
  await third.getByLabel("Minutes after completion", { exact: true }).fill("0");
  await third.getByLabel("Message").fill("Here is your estimate, {{First Name}}.");

  // Starting the mix needs no one enrolled. The review counts nothing as scheduled: every beat waits for a visit.
  await page.getByRole("button", { name: "Review and start" }).click();
  const review = page.getByRole("dialog", { name: "Start this mix?" });
  await expect(review.locator("div:has(> span:text-is('potential follow-ups')) > strong")).toHaveText("0");
  await expect(review.locator("div:has(> span:text-is('beats wait for a visit')) > strong")).toHaveText("3");
  await expect(review).toContainText("No one is enrolled yet. Line this mix up with a visit from the calendar, or start it from one person’s page.");
  await audit(page);
  await review.getByRole("button", { name: "Start the mix", exact: true }).click();
  await page.waitForURL(/created=manual/);
  const mix = await prisma.mix.findFirstOrThrow({ where: { workspaceId, name }, include: { steps: { orderBy: { sortOrder: "asc" } }, assignments: true } });
  expect(mix.status).toBe("ACTIVE");
  expect(mix.assignments).toEqual([]);
  expect(mix.steps.map((step) => [step.anchor, step.offsetMinutes])).toEqual([["APPOINTMENT_START", -90], ["APPOINTMENT_END", 30], ["VISIT_COMPLETED", 0]]);
  await reconcileJumps({ workspaceId, mixId: mix.id });
  expect(await prisma.jump.count({ where: { mixId: mix.id } })).toBe(0);
  // The Mix library does not present visit-timed beats as days: the row counts beats and the preview describes each timing.
  await page.goto(`/mixes?mix=${mix.id}`); await ready(page);
  await expect(page.locator(".mix-library-row", { hasText: name })).toContainText("active · 3 Beats");
  const preview = page.getByRole("region", { name: "Beat preview" });
  await expect(preview.locator("li").first()).toContainText("1 hour 30 minutes before the appointment starts");
  await expect(preview.locator("li").nth(1)).toContainText("30 minutes after the appointment ends");
  await expect(preview.locator("li").nth(2)).toContainText("as soon as the visit is marked completed");
  await expect(preview).not.toContainText(/Day \d/);

  // Attached to the one visit the owner chooses on the calendar. The confirmation reports what that gives them now.
  await page.goto(`/calendar?contact=${contactId}&date=${visitDate}`); await ready(page);
  const form = page.locator("form.form-grid");
  await form.getByLabel("Title").fill("Roof estimate");
  await form.getByLabel("Follow-up plan for this visit (optional)").selectOption(mix.id);
  await form.getByRole("button", { name: "Save event", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "line up with this visit" })).toHaveText("Calendar updated. The plan’s follow-ups line up with this visit. 1 beat is scheduled and will appear on Today. 1 beat after the visit waits until you record how it went. 1 beat counts from the moment you mark the visit completed.");
  const binding = await prisma.appointmentBinding.findFirstOrThrow({ where: { workspaceId, mixId: mix.id }, include: { calendarEntry: true } });
  expect(binding.calendarEntry).toMatchObject({ title: "Roof estimate", contactId });
  expect(await prisma.appointmentBinding.count({ where: { workspaceId, mixId: mix.id } })).toBe(1);

  // The worker's pass generates exactly the preparation reminder, ninety minutes before the start; the rest has nothing to count from yet.
  await reconcileJumps({ workspaceId, mixId: mix.id });
  const rows = () => prisma.jump.findMany({ where: { appointmentBindingId: binding.id }, include: { mixStep: { select: { sortOrder: true } } }, orderBy: { mixStep: { sortOrder: "asc" } } });
  const { startsAt, endsAt } = binding.calendarEntry;
  const leaving = new Date(startsAt.getTime() - 90 * 60_000).toISOString();
  expect((await rows()).map((row) => [row.mixStep.sortOrder, row.status, row.scheduledAt.toISOString()])).toEqual([[1, "PENDING", leaving]]);
  const reminder = (await rows())[0];
  expect((reminder.renderedSnapshot as { body: string }).body).toBe("Hi Casey, leaving now for Roof estimate.");
  await page.goto("/jumps?range=week&status=pending"); await ready(page);
  await expect(page.locator(`#jump-${reminder.id}`)).toContainText("Roof estimate");

  // Recording that the visit happened releases the beat after it and starts the completion beat's clock; the preparation lapses.
  await page.goto(`/calendar?date=${visitDate}`); await ready(page);
  // The visit's outcome and plan controls sit under its "Event details and actions".
  const visit = page.locator("article.calendar-event", { hasText: "Roof estimate" });
  const eventOptions = visit.locator("details.calendar-event-options");
  const openEventOptions = async () => { if (!await eventOptions.evaluate(element => (element as HTMLDetailsElement).open)) await eventOptions.locator("summary").click(); };
  await openEventOptions();
  await expect(visit.locator(".calendar-binding")).toContainText("Follow-ups after the visit wait until you record how it went.");
  await visit.locator(".calendar-outcome").getByRole("button", { name: "Visit happened", exact: true }).click();
  await page.waitForURL(/saved=1/);
  await expect(visit.locator(".calendar-outcome .status-pill")).toHaveText("Visit happened");
  await openEventOptions();
  await expect(visit.locator(".calendar-outcome").getByRole("button", { name: "Clear outcome", exact: true })).toBeVisible();
  await reconcileJumps({ workspaceId, mixId: mix.id });
  const completedAt = (await prisma.calendarEntry.findUniqueOrThrow({ where: { id: binding.calendarEntryId } })).outcomeAt!;
  expect((await rows()).map((row) => [row.mixStep.sortOrder, row.status, row.completionMethod, row.scheduledAt.toISOString()])).toEqual([
    [1, "CANCELED", APPOINTMENT_HOLD_METHODS.completed, leaving],
    [2, "PENDING", null, new Date(endsAt.getTime() + 30 * 60_000).toISOString()],
    [3, "PENDING", null, completedAt.toISOString()]
  ]);
});
