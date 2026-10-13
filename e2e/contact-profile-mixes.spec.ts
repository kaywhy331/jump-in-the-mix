import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { installMegaMix } from "../src/lib/mega-mix-service";
import { initialJourneySetup } from "../src/lib/journey-preferences";
import { processWorkflowInstance, startWorkflowInstance } from "../src/lib/mix-workflow";
import { axeInPage } from "./axe-in-page";

// The contact profile's one Mixes section and its ••• menu (D77, JITM-09 §2.32): a row per Mix with its own menu
// below the Next card, Review only on the Next card, the person-level actions in one menu, and Notes to remember and
// the next meeting near the top.
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Disposable local database only");
test.use({ screenshot: "off", video: "off", trace: "off" });
test.setTimeout(120_000);
const DAY = 86_400_000;
let workspaceId: string, userId: string, textId: string, tagId: string;
const mixes: Record<"quote" | "aftercare" | "referral" | "seasonal" | "spare", string> = { quote: "", aftercare: "", referral: "", seasonal: "", spare: "" };
const token = randomUUID(), suffix = randomUUID();

test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `profile-mixes-${suffix}@example.com`, name: "Profile owner", passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: `profile-mixes-${suffix}`, name: "Profile fixture", members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  textId = (await prisma.stepVersion.create({ data: { stepTemplate: { create: { workspaceId, name: "Check in", channel: "SMS" } }, version: 1, body: "Hi {{First Name}}, checking in." } })).id;
  const create = async (name: string, status: "ACTIVE" | "PAUSED", offsets: number[]) => (await prisma.mix.create({ data: { workspaceId, name, status, triggerMode: "MANUAL_START", steps: { create: offsets.map((dayOffset, index) => ({ stepVersionId: textId, dayOffset, sortOrder: index + 1 })) } } })).id;
  mixes.quote = await create("Quote check-in", "ACTIVE", [0, 2, 5]);
  mixes.aftercare = await create("Aftercare check-in", "ACTIVE", [0]);
  mixes.referral = await create("Referral thanks", "ACTIVE", [0]);
  mixes.seasonal = await create("Seasonal tune-up", "PAUSED", [0]);
  // Alphabetically first, so an Add to a Mix that preselected would pick it.
  mixes.spare = await create("A first Mix", "ACTIVE", [0]);
  tagId = (await prisma.group.create({ data: { workspaceId, name: "Customers" } })).id;
  await prisma.mixAssignment.create({ data: { assignmentKey: `tag:${tagId}`, workspaceId, mixId: mixes.aftercare, groupId: tagId, mode: "SNAPSHOT", isActive: true } });
});
test.beforeEach(async ({ context }) => {
  await prisma.contact.deleteMany({ where: { workspaceId } });
  await prisma.job.deleteMany({ where: { workspaceId } });
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
});
test.afterAll(async () => {
  if (workspaceId) { await prisma.job.deleteMany({ where: { workspaceId } }); await prisma.workspace.deleteMany({ where: { id: workspaceId } }); }
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});

const NOTES = "Wants a call after 5 pm on weekdays. Prefers texts for anything quick.\nHas two dogs, so knock rather than ring.\nAsked about gutter guards for next spring.\nReferred by a neighbour on Elm Street.";
/** Marcus: his own start of Quote check-in (its first Beat two days late), Aftercare through his tag, a stop in Referral
 *  thanks, his own start of the paused Seasonal tune-up, a meeting in three days, and notes longer than three lines. */
async function marcus(options: { notes?: string | null } = {}) {
  const person = await prisma.contact.create({ data: { workspaceId, displayName: "Marcus Reed", firstName: "Marcus", publicNotes: options.notes === undefined ? NOTES : options.notes, phones: { create: { phone: "+1 555 010 1002", normalized: "+15550101002", isPrimary: true, label: "Mobile" } }, emails: { create: { email: "marcus@example.com", normalized: "marcus@example.com", isPrimary: true } }, groupMemberships: { create: { groupId: tagId } } } });
  const quote = await prisma.mixAssignment.create({ data: { assignmentKey: `quote:${person.id}`, workspaceId, mixId: mixes.quote, contactId: person.id, mode: "SNAPSHOT", isActive: true } });
  await prisma.mixAssignment.create({ data: { assignmentKey: `referral:${person.id}`, workspaceId, mixId: mixes.referral, contactId: person.id, mode: "SNAPSHOT", isActive: true } });
  await prisma.mixStop.create({ data: { workspaceId, mixId: mixes.referral, contactId: person.id, stoppedByUserId: userId } });
  await prisma.mixAssignment.create({ data: { assignmentKey: `seasonal:${person.id}`, workspaceId, mixId: mixes.seasonal, contactId: person.id, mode: "SNAPSHOT", isActive: true } });
  const start = new Date(Date.now() - 2 * DAY);
  for (const step of await prisma.mixStep.findMany({ where: { mixId: mixes.quote }, orderBy: { sortOrder: "asc" } })) {
    const when = new Date(start.getTime() + step.dayOffset * DAY), id = `${person.id}-${step.sortOrder}`;
    await prisma.jump.create({ data: { id, workspaceId, contactId: person.id, mixId: mixes.quote, mixStepId: step.id, stepVersionId: textId, scheduledAt: when, baseScheduledAt: when, status: "PENDING", reason: "Quote check-in", uniquenessKey: id, templateSnapshot: { subject: null, body: "Hi, checking in.", script: null, channel: "SMS", originalLocalDate: when.toISOString().slice(0, 10), timezone: "UTC" }, renderedSnapshot: { subject: null, body: "Hi, checking in.", script: null } } });
  }
  const meeting = new Date(Date.now() + 3 * DAY); meeting.setUTCHours(15, 0, 0, 0);
  const past = new Date(Date.now() - 3 * DAY);
  await prisma.calendarEntry.createMany({ data: [
    { workspaceId, contactId: person.id, title: "Site visit — deck repair", kind: "MEETING", startsAt: meeting, endsAt: new Date(meeting.getTime() + 3_600_000), timezone: "UTC" },
    // Neither a past meeting nor a cancelled one is the next meeting.
    { workspaceId, contactId: person.id, title: "Old walkthrough", kind: "MEETING", startsAt: past, endsAt: new Date(past.getTime() + 3_600_000), timezone: "UTC" },
    { workspaceId, contactId: person.id, title: "Cancelled call", kind: "MEETING", startsAt: new Date(Date.now() + DAY), endsAt: new Date(Date.now() + DAY + 3_600_000), timezone: "UTC", canceledAt: new Date() }
  ] });
  return { id: person.id, quoteAssignmentId: quote.id };
}
async function ready(page: Page) { await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "", { timeout: 60_000 }); }
const section = (page: Page) => page.getByRole("region", { name: "Mixes", exact: true });
const row = (page: Page, name: string) => section(page).getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) });
async function axe(page: Page, selector: string) {
  const result = await axeInPage(page).include(selector).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  return result.violations.map(violation => `${violation.id} ${violation.nodes.map(node => node.target.join(" ")).join(", ")}`);
}

test("one Mixes section lists each Mix once with where it stands, and Review stays on the Next card", async ({ page }) => {
  const person = await marcus();
  await page.goto(`/contacts/${person.id}`); await ready(page);
  const rows = section(page).getByRole("listitem");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText("Quote check-in");
  await expect(rows.nth(0)).toContainText("Next Beat · 2 days late");
  await expect(row(page, "Aftercare check-in")).toContainText("No follow-ups to come");
  await expect(row(page, "Aftercare check-in")).toContainText("Through the tag Customers");
  await expect(row(page, "Seasonal tune-up")).toContainText("Mix paused");
  await expect(row(page, "Referral thanks")).toContainText("Stopped");
  // The Mixes section follows the Next card and the next meeting, before the details and History.
  const top = async (selector: string) => (await page.locator(selector).first().boundingBox())!.y;
  expect(await top(".contact-mixes")).toBeGreaterThan(await top(".contact-next-meeting"));
  expect(await top(".contact-next-meeting")).toBeGreaterThan(await top(".contact-next-line"));
  expect(await top(".contact-mixes")).toBeLessThan(await top("#contact-history"));
  // Review appears once, on the Next card; the old blocks and the extra ways to start a Mix are gone.
  await expect(page.getByRole("link", { name: "Review", exact: true })).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Next follow-up" }).getByRole("link", { name: "Review", exact: true })).toBeVisible();
  for (const gone of ["Connected Mixes", "Start a follow-up", "Other stopped Mixes"]) await expect(page.getByText(gone, { exact: true })).toHaveCount(0);
  await expect(page.locator("#dates-and-mixes > summary")).toContainText("Dates, preferences and custom fields");
  await expect(page.locator("#dates-and-mixes").getByRole("heading", { name: "Mixes" })).toHaveCount(0);
  expect(await axe(page, ".contact-detail-page")).toEqual([]);
});

test("the profile menu holds Edit, Ask for a review, Schedule a meeting, Do not contact and Archive", async ({ page }) => {
  const person = await marcus();
  await page.goto(`/contacts/${person.id}`); await ready(page);
  const trigger = page.getByRole("button", { name: "More options for Marcus Reed" });
  await trigger.focus(); await page.keyboard.press("Enter");
  const menu = page.getByRole("dialog", { name: "Marcus Reed" });
  await expect(menu).toBeVisible();
  const items = menu.locator(".contact-menu-list").locator(":scope > a, :scope > button, :scope > form > button");
  await expect(items).toHaveText(["Edit contact", "Ask for a review", "Schedule a meeting", "Do not contact", "Archive contact"]);
  await expect(menu.getByRole("link", { name: "Edit contact" })).toHaveAttribute("href", `/contacts/${person.id}/edit`);
  await expect(menu.getByRole("link", { name: "Schedule a meeting" })).toHaveAttribute("href", `/calendar?contact=${person.id}`);
  expect(await axe(page, "dialog[open]")).toEqual([]);
  await menu.getByRole("button", { name: "Ask for a review" }).click();
  await expect(menu.getByText("Private check-in ready")).toBeVisible();
  await expect.poll(() => prisma.reviewRequest.count({ where: { workspaceId, contactId: person.id } })).toBe(1);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  // Archive acts at once, and Contacts says so with Undo, which brings Marcus back (D88, JITM-08 §2.5).
  await trigger.click();
  await Promise.all([page.waitForURL(/archived=1/), menu.getByRole("button", { name: "Archive contact", exact: true }).click()]);
  expect((await prisma.contact.findUniqueOrThrow({ where: { id: person.id } })).archivedAt).not.toBeNull();
  await expect(page.getByText("Contact archived.", { exact: false })).toBeVisible();
  await Promise.all([page.waitForURL(/restored=1/), page.getByRole("button", { name: "Undo", exact: true }).click()]);
  expect((await prisma.contact.findUniqueOrThrow({ where: { id: person.id } })).archivedAt).toBeNull();
});

test("Do not contact from the menu asks first and keeps the person's other preferences, and Priority keeps it on", async ({ page }) => {
  const person = await marcus();
  await prisma.contactRelationshipState.create({ data: { workspaceId, contactId: person.id, priority: "HIGH", preferredChannel: "EMAIL" } });
  await page.goto(`/contacts/${person.id}`); await ready(page);
  const open = async () => { await page.getByRole("button", { name: "More options for Marcus Reed" }).click(); return page.getByRole("dialog", { name: "Marcus Reed" }); };
  let menu = await open();
  await menu.getByRole("button", { name: "Do not contact", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Stop 3 pending follow-ups for this person?" });
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  // Long enough for a wrongly sent save to land before reading.
  await page.waitForTimeout(750);
  expect((await prisma.contactRelationshipState.findUniqueOrThrow({ where: { contactId: person.id } })).doNotContact).toBe(false);
  await menu.getByRole("button", { name: "Do not contact", exact: true }).click();
  await Promise.all([page.waitForURL(/dncOn=1/), confirm.getByRole("button", { name: "Stop follow-ups" }).click()]);
  await expect(page.getByText("Do not contact is on. No follow-ups will be prepared for them.", { exact: true })).toBeVisible();
  // The menu's change leaves More closed; only a Preferences save opens it.
  await expect(page.locator("#dates-and-mixes")).not.toHaveAttribute("open", "");
  let state = await prisma.contactRelationshipState.findUniqueOrThrow({ where: { contactId: person.id } });
  expect(state).toMatchObject({ doNotContact: true, priority: "HIGH", preferredChannel: "EMAIL" });
  expect(await prisma.jump.count({ where: { contactId: person.id, status: "PENDING" } })).toBe(0);
  // Saving Priority in More must not turn it off: the form carries it.
  if (await page.locator("#dates-and-mixes").getAttribute("open") === null) await page.locator("#dates-and-mixes > summary").click();
  await page.locator("#dates-and-mixes").getByText("Urgent", { exact: true }).click();
  await expect.poll(async () => (await prisma.contactRelationshipState.findUniqueOrThrow({ where: { contactId: person.id } })).priority).toBe("URGENT");
  expect((await prisma.contactRelationshipState.findUniqueOrThrow({ where: { contactId: person.id } })).doNotContact).toBe(true);
  await page.goto(`/contacts/${person.id}`); await ready(page);
  // While it's on, the menu offers to turn it off and doesn't offer a review request.
  menu = await open();
  await expect(menu.getByRole("button", { name: "Ask for a review" })).toHaveCount(0);
  await Promise.all([page.waitForURL(/dncOff=1/), menu.getByRole("button", { name: "Turn off Do not contact" }).click()]);
  await expect.poll(async () => (await prisma.contactRelationshipState.findUniqueOrThrow({ where: { contactId: person.id } })).doNotContact).toBe(false);
  await expect(page.getByText("Do not contact is off. Follow-ups can be prepared for them again.", { exact: true })).toBeVisible();
  await expect(page.getByText("Do not contact is on.", { exact: false })).toHaveCount(0);
  state = await prisma.contactRelationshipState.findUniqueOrThrow({ where: { contactId: person.id } });
  expect(state).toMatchObject({ doNotContact: false, priority: "URGENT", preferredChannel: "EMAIL" });
});

test("a row's menu stops, resumes and removes the Mix for the person, saying what each does", async ({ page }) => {
  const person = await marcus();
  await page.goto(`/contacts/${person.id}`); await ready(page);
  const options = (name: string) => row(page, name).getByRole("button", { name: new RegExp(`^Options for ${name}: `) });
  await options("Quote check-in").click();
  let menu = page.getByRole("dialog", { name: "Quote check-in" });
  await expect(menu).toContainText(/Next Beat was due/);
  await expect(menu.getByRole("link", { name: "Open the Mix" })).toHaveAttribute("href", `/mixes/${mixes.quote}/edit`);
  expect(await axe(page, "dialog[open]")).toEqual([]);
  await menu.getByRole("button", { name: "Stop for Marcus Reed…" }).click();
  const stop = page.getByRole("dialog", { name: "Stop Quote check-in for Marcus Reed?" });
  await expect(stop).toContainText("won’t prepare more for them, through a tag or a new start, until you resume it here");
  await Promise.all([page.waitForURL(/mixStopped=1/), stop.getByRole("button", { name: "Stop the Mix" }).click()]);
  await expect(row(page, "Quote check-in")).toContainText("Stopped");
  expect(await prisma.jump.count({ where: { contactId: person.id, mixId: mixes.quote, status: "PENDING" } })).toBe(0);
  await options("Quote check-in").click();
  menu = page.getByRole("dialog", { name: "Quote check-in" });
  await Promise.all([page.waitForURL(/mixResumed=1/), menu.getByRole("button", { name: "Resume for Marcus Reed" }).click()]);
  expect(await prisma.mixStop.count({ where: { contactId: person.id, mixId: mixes.quote } })).toBe(0);
  // Remove ends this start; a Mix that runs through a tag has nothing to remove.
  await options("Aftercare check-in").click();
  await expect(page.getByRole("dialog", { name: "Aftercare check-in" }).getByRole("button", { name: "Remove from this Mix…" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await options("Quote check-in").click();
  await page.getByRole("dialog", { name: "Quote check-in" }).getByRole("button", { name: "Remove from this Mix…" }).click();
  const remove = page.getByRole("dialog", { name: "Remove Marcus Reed from Quote check-in?" });
  await expect(remove).toContainText("you can start the Mix for them again later");
  await Promise.all([page.waitForURL(/mixRemoved=1/), remove.getByRole("button", { name: "Remove", exact: true }).click()]);
  expect((await prisma.mixAssignment.findUniqueOrThrow({ where: { id: person.quoteAssignmentId } })).isActive).toBe(false);
});

test("Add to a Mix ends the section, starts with no Mix chosen, and adds the person", async ({ page }) => {
  const person = await marcus();
  await page.goto(`/contacts/${person.id}`); await ready(page);
  await section(page).getByRole("button", { name: "Add to a Mix" }).click();
  const sheet = page.getByRole("dialog", { name: "Add Marcus Reed to a Mix" });
  const choice = sheet.getByRole("combobox", { name: "Choose a Mix" });
  await expect(choice).toHaveValue("");
  await choice.selectOption({ label: "A first Mix" });
  await Promise.all([page.waitForURL(/mixAssigned=/), sheet.getByRole("button", { name: "Add to the Mix" }).click()]);
  await expect(row(page, "A first Mix")).toBeVisible();
  expect(await prisma.mixAssignment.count({ where: { contactId: person.id, mixId: mixes.spare, isActive: true } })).toBe(1);
});

test("Notes to remember show three lines with Show all, and the next meeting links to the calendar", async ({ page }) => {
  const person = await marcus();
  await page.goto(`/contacts/${person.id}`); await ready(page);
  const notes = page.getByRole("region", { name: "Notes to remember" });
  const text = notes.locator(".note-copy");
  const clipped = () => text.evaluate(element => element.scrollHeight > element.clientHeight + 1);
  expect(await clipped()).toBe(true);
  const lines = await text.evaluate(element => Math.round(element.clientHeight / parseFloat(getComputedStyle(element).lineHeight)));
  expect(lines).toBe(3);
  const toggle = notes.getByRole("button", { name: "Show all" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(notes.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
  expect(await clipped()).toBe(false);
  await expect(notes.getByRole("link", { name: "Edit notes to remember" })).toHaveAttribute("href", `/contacts/${person.id}/edit#contact-notes`);
  const meeting = page.getByRole("link", { name: /^Meeting · .+ · Site visit — deck repair$/ });
  await expect(meeting).toHaveAttribute("href", /^\/calendar\?edit=/);
  for (const other of ["Old walkthrough", "Cancelled call"]) await expect(page.getByText(other)).toHaveCount(0);
  // Short notes show whole, with no toggle; none at all says so and offers to add them.
  const short = await marcus({ notes: "Prefers texts." });
  await page.goto(`/contacts/${short.id}`); await ready(page);
  await expect(page.getByRole("region", { name: "Notes to remember" }).getByRole("button", { name: "Show all" })).toHaveCount(0);
  const none = await marcus({ notes: null });
  await page.goto(`/contacts/${none.id}`); await ready(page);
  await expect(page.getByRole("region", { name: "Notes to remember" })).toContainText("No notes yet.");
  await expect(page.getByRole("link", { name: "Add notes to remember" })).toBeVisible();
});

test("a stop says what Resume will do: a stage change's stop, and a stop on a paused Mix", async ({ page }) => {
  const person = await marcus();
  // A stage change ended Aftercare's start and stopped it (src/lib/journey.ts); Seasonal tune-up is paused for everyone.
  const tagless = await prisma.contact.update({ where: { id: person.id }, data: { groupMemberships: { deleteMany: {} } } });
  await prisma.mixStop.create({ data: { workspaceId, mixId: mixes.aftercare, contactId: tagless.id, reason: "journey.stage.exit" } });
  await prisma.mixStop.create({ data: { workspaceId, mixId: mixes.seasonal, contactId: person.id, stoppedByUserId: userId } });
  await page.goto(`/contacts/${person.id}`); await ready(page);
  await expect(row(page, "Aftercare check-in")).toContainText("Ended at a stage change");
  await row(page, "Aftercare check-in").getByRole("button", { name: /^Options for Aftercare check-in: / }).click();
  await expect(page.getByRole("dialog", { name: "Aftercare check-in" })).toHaveAccessibleDescription("Ended when Marcus Reed’s stage changed. It starts again if they return to that stage. Resuming only lifts the stop: add them to the Mix to restart it.");
  await page.keyboard.press("Escape");
  await expect(row(page, "Seasonal tune-up")).toContainText("Stopped");
  await row(page, "Seasonal tune-up").getByRole("button", { name: /^Options for Seasonal tune-up: / }).click();
  await expect(page.getByRole("dialog", { name: "Seasonal tune-up" })).toHaveAccessibleDescription("Stopped for Marcus Reed. Resuming lets it prepare their follow-ups once the Mix is on.");
  // Escape returns focus to the row's •••.
  await page.keyboard.press("Escape");
  await expect(row(page, "Seasonal tune-up").getByRole("button", { name: /^Options for Seasonal tune-up: / })).toBeFocused();
});

test("a row's menu works by keyboard, and Cancel in its confirmation returns to Stop", async ({ page }) => {
  const person = await marcus();
  await page.goto(`/contacts/${person.id}`); await ready(page);
  const options = row(page, "Quote check-in").getByRole("button", { name: /^Options for Quote check-in: / });
  await options.focus(); await page.keyboard.press("Enter");
  const menu = page.getByRole("dialog", { name: "Quote check-in" });
  await expect(menu.getByRole("heading", { name: "Quote check-in" })).toBeFocused();
  const stop = menu.getByRole("button", { name: "Stop for Marcus Reed…" });
  for (let step = 0; step < 6 && !(await stop.evaluate(element => element === document.activeElement)); step++) await page.keyboard.press("Tab");
  await expect(stop).toBeFocused();
  await page.keyboard.press("Enter");
  const confirm = page.getByRole("dialog", { name: "Stop Quote check-in for Marcus Reed?" });
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(confirm).toBeHidden();
  await expect(stop).toBeFocused();
  await page.waitForTimeout(750);
  expect(await prisma.mixStop.count({ where: { contactId: person.id, mixId: mixes.quote } })).toBe(0);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(options).toBeFocused();
});

test("the person's Journey work sits in its Mix's menu, without Review", async ({ page }) => {
  await installMegaMix({ workspaceId, actorUserId: userId, blueprintId: "contractor", expectedVersion: 1, setup: initialJourneySetup(null, "UTC") }).catch(() => undefined);
  const mix = await prisma.mix.findFirstOrThrow({ where: { workspaceId, name: "Estimate follow-up" } });
  const person = await prisma.contact.create({ data: { workspaceId, displayName: "Jordan Hale", firstName: "Jordan", phones: { create: { phone: "+15555550123", normalized: "+15555550123", isPrimary: true } } } });
  const instance = await startWorkflowInstance({ workspaceId, contactId: person.id, mixId: mix.id, requestId: randomUUID(), label: "Kitchen estimate" });
  await processWorkflowInstance(workspaceId, instance, new Date());
  await prisma.job.updateMany({ where: { workspaceId, completedAt: null }, data: { completedAt: new Date() } });
  await page.goto(`/contacts/${person.id}`); await ready(page);
  // The owner started this work from Journey, so no connection is credited with it (TRU-01).
  await expect(row(page, "Estimate follow-up")).toContainText("Started in Journey");
  await row(page, "Estimate follow-up").getByRole("button", { name: /^Options for Estimate follow-up: / }).click();
  const menu = page.getByRole("dialog", { name: "Estimate follow-up" });
  await expect(menu.getByRole("link", { name: "Open in Journey" })).toHaveAttribute("href", `/journey?contactId=${person.id}&work=${instance}`);
  const work = menu.locator(`[data-workflow-instance="${instance}"]`);
  await expect(work).toContainText("Kitchen estimate");
  await expect(work.getByRole("link", { name: "Review" })).toHaveCount(0);
  // Its controls are 44px tall in the menu, text buttons and links included (A11Y-01).
  const short = await work.evaluate(card => [...card.querySelectorAll<HTMLElement>("button, a[href], summary")].filter(element => element.getClientRects().length && element.getBoundingClientRect().height < 44).map(element => element.textContent?.trim()));
  expect(short).toEqual([]);
  await expect(page.getByRole("link", { name: "Review", exact: true })).toHaveCount(1);
  await work.getByRole("button", { name: "Pause this work" }).click();
  await expect(work.locator(".status-pill")).toHaveText("Paused");
  await page.keyboard.press("Escape");
  await expect(row(page, "Estimate follow-up")).toContainText("Journey work paused");
});

test("the menu sits in the name row, and new controls are 44px with nothing past the screen, at every width and at 200% text", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Widths are set here");
  const person = await marcus();
  const problems: string[] = [];
    // Docking starts at 1200px, the details column at 1700px, and the quick actions join the name row at 1840px.
  for (const [width, path] of [[320, `/contacts/${person.id}`], [390, `/contacts/${person.id}`], [768, `/contacts/${person.id}`], [1024, `/contacts/${person.id}`], [1199, `/contacts/${person.id}`], [1200, `/contacts?person=${person.id}`], [1440, `/contacts?person=${person.id}`], [1699, `/contacts?person=${person.id}`], [1700, `/contacts?person=${person.id}`], [1839, `/contacts?person=${person.id}`], [1840, `/contacts?person=${person.id}`], [1920, `/contacts?person=${person.id}`], [2560, `/contacts?person=${person.id}`]] as const) {
    for (const text of width <= 390 ? ["100%", "200%"] : ["100%"]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path); await ready(page);
      // The profile streams in after the shell; measure it once it shows.
      await expect(page.locator(".contact-profile-header :is(h1, h2)")).toBeVisible();
      if (text === "200%") await page.addStyleTag({ content: "html { font-size: 200% !important }" });
      const read = await page.evaluate(() => {
        const box = (element: Element | null) => element?.getBoundingClientRect();
        const name = box(document.querySelector(".contact-profile-header :is(h1, h2)")), menu = box(document.querySelector(".contact-profile-menu button"));
        const controls = [...document.querySelectorAll<HTMLElement>(".contact-profile-menu button, .contact-mix-row-menu, .contact-add-mix, .contact-next-meeting, .contact-notes .contact-section-heading a, .clamped-text-toggle")].filter(element => element.getClientRects().length);
        const small = controls.filter(element => element.getBoundingClientRect().height < 44 || element.getBoundingClientRect().width < 44).map(element => element.textContent || element.getAttribute("aria-label"));
        const past = [...document.querySelectorAll<HTMLElement>(".contact-mixes *, .contact-notes *, .contact-next-meeting, .contact-profile-menu")].filter(element => element.getClientRects().length && element.getBoundingClientRect().right > document.documentElement.clientWidth + 1).map(element => element.className || element.tagName);
        return { menuInNameRow: Boolean(name && menu && menu.top < name.bottom && menu.bottom > name.top - 12), boxes: `name ${Math.round(name?.top ?? -1)}-${Math.round(name?.bottom ?? -1)} menu ${Math.round(menu?.top ?? -1)}-${Math.round(menu?.bottom ?? -1)}`, small, past, sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth };
      });
      if (!read.menuInNameRow) problems.push(`${width} ${text}: menu not in the name row (${read.boxes})`);
      if (read.small.length) problems.push(`${width} ${text}: small ${read.small.join(", ")}`);
      if (read.past.length || read.sideways) problems.push(`${width} ${text}: past the screen ${read.past.join(", ")}`);
    }
  }
  expect(problems).toEqual([]);
});
