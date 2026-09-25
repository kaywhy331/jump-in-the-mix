import bcrypt from "bcryptjs";
import { generateTotpCode } from "../src/lib/totp";
import { ACCOUNT_DELETION_PHRASE } from "../src/lib/account-deletion-policy";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
const database = new URL(process.env.DATABASE_URL ?? "postgresql://localhost/unknown");
test.skip(!["localhost", "127.0.0.1"].includes(database.hostname) || !database.pathname.startsWith("/jitm_design_"), "Disposable fixtures only");
test.setTimeout(120_000);
const users: string[] = [];
async function member(page: Page, onboarded = true) {
  const id = randomUUID(); const user = await prisma.user.create({ data: { name: "Readiness Owner", email: `readiness-${id}@example.test`, emailVerifiedAt: new Date() } }); users.push(user.id);
  const workspace = await prisma.workspace.create({ data: { name: "Readiness workspace", slug: id, ownerId: user.id, members: { create: { userId: user.id } }, profile: { create: { onboardingDone: onboarded, reviewUrl: "https://example.com/review", website: "https://example.com/contact" } } } });
  await prisma.userPreference.create({ data: { userId: user.id, timezone: "America/Los_Angeles" } });
  const token = randomBytes(32).toString("base64url");
  const session = await prisma.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  await page.context().addCookies([{ name: "jitm_session", value: token, url: process.env.PLAYWRIGHT_BASE_URL!, httpOnly: true, sameSite: "Strict" }]);
  return { user, workspace, session };
}
test.afterEach(async () => {
  await prisma.platformAuditEvent.deleteMany({ where: { actorUserId: { in: users } } });
  await prisma.contactActivity.deleteMany({ where: { actorUserId: { in: users } } });
  const owned = await prisma.workspace.findMany({ where: { ownerId: { in: users } }, select: { id: true } });
  await prisma.automatedDelivery.deleteMany({ where: { workspaceId: { in: owned.map(item => item.id) } } });
  await prisma.workspace.deleteMany({ where: { ownerId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } }); users.length = 0;
});

test("timeline traverses more than 150 same-time events and corrects notes safely", async ({ page }) => {
  const { workspace, user } = await member(page);
  const contact = await prisma.contact.create({ data: { workspaceId: workspace.id, displayName: "History test" } });
  await prisma.contactActivity.createMany({ data: Array.from({ length: 163 }, (_, i) => ({ workspaceId: workspace.id, contactId: contact.id, actorUserId: user.id, kind: "CUSTOMER_NOTE" as const, visibility: "PRIVATE" as const, summary: `History note ${i}`, occurredAt: new Date("2026-01-01T10:00:00Z") })) });
  let cursor: string | null = null; const seen = new Set<string>();
  do {
    const response = await page.request.get(`/api/contacts/${contact.id}/activity?filter=NOTES${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    expect(response.status()).toBe(200); const data = await response.json();
    for (const item of data.items) { expect(seen.has(item.id)).toBe(false); seen.add(item.id); }
    cursor = data.nextCursor;
  } while (cursor);
  expect(seen.size).toBe(163);
  await page.goto(`/contacts/${contact.id}`);
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");
  // History filters live in the "History options" sheet; each note's Edit sits in its options menu.
  await page.getByRole("button", { name: "History options", exact: true }).click();
  const options = page.getByRole("dialog", { name: "History options", exact: true });
  await options.getByRole("button", { name: "Communications", exact: true }).click();
  await expect(page.getByText("No events match this filter. Choose All to see other history.")).toBeVisible();
  await expect(options.getByRole("button", { name: "Communications", exact: true })).toHaveAttribute("aria-pressed", "true");
  await options.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(options.getByRole("button", { name: "Notes", exact: true })).toHaveAttribute("aria-pressed", "true");
  await options.getByRole("button", { name: "Close History options", exact: true }).click();
  await page.getByLabel(/^Options for note from /).first().click();
  await page.getByRole("button", { name: "Edit note", exact: true }).first().click();
  await page.getByRole("textbox", { name: "Correct note", exact: true }).fill("Corrected private note");
  const savedNote = page.waitForResponse(response => response.url().endsWith(`/api/contacts/${contact.id}/activity`) && response.request().method() === "PATCH");
  await page.getByRole("button", { name: "Save correction", exact: true }).click();
  expect((await savedNote).status()).toBe(200);
  await expect(page.getByText("Corrected private note", { exact: true })).toBeVisible();
  const changed = await prisma.contactActivity.findFirstOrThrow({ where: { contactId: contact.id, summary: "Corrected private note" } });
  const conflict = await page.request.patch(`/api/contacts/${contact.id}/activity`, { headers: { Origin: process.env.PLAYWRIGHT_BASE_URL! }, data: { id: changed.id, expectedSummary: "Old stale note", summary: "Do not overwrite" } });
  expect(conflict.status()).toBe(409);
  const foreign = await page.request.patch("/api/contacts/demo_contact_sarah/activity", { headers: { Origin: process.env.PLAYWRIGHT_BASE_URL! }, data: { id: changed.id, expectedSummary: changed.summary, summary: "Forbidden" } });
  expect(foreign.status()).toBe(404);
});

test("worked schedule uses weekend and quiet-hour rules while appointment offsets stay exact", async ({ page }) => {
  await member(page);
  const response = await page.request.post("/api/mixes/schedule-preview", { headers: { Origin: process.env.PLAYWRIGHT_BASE_URL! }, data: { timezone: "America/Los_Angeles", start: "2026-09-19T10:00", end: "2026-09-19T11:00", appointment: true, rules: { defaultFollowUpMinutes: 600, quietHoursStart: 1200, quietHoursEnd: 480, weekendScheduling: "NEXT_MONDAY" }, steps: [{ anchor: "CALENDAR_DAY", dayOffset: 0, sendTimeMinutes: 1260, offsetMinutes: "", plannedAt: "" }, { anchor: "APPOINTMENT_START", dayOffset: 0, sendTimeMinutes: null, offsetMinutes: "-30", plannedAt: "" }] } });
  expect(response.status()).toBe(200); const data = await response.json();
  expect(data.items.map((item: { at: string }) => item.at)).toEqual(["2026-09-21T15:00:00.000Z", "2026-09-19T16:30:00.000Z"]);
});

test("onboarding permits minimal details only after reviewing its actual starter", async ({ page }) => {
  const { workspace } = await member(page, false);
  await page.goto("/onboarding");
  // Onboarding opens on the complete mega-mix; one person and one follow-up is its own starting point.
  await page.getByRole("radio", { name: /^Other uses or one follow-up/ }).check();
  await page.getByLabel("Name", { exact: true }).fill("Notes Only Person");
  await page.getByRole("checkbox", { name: /I reviewed this plan/ }).check();
  await page.getByRole("button", { name: "Prepare my first follow-up" }).click();
  await expect(page).toHaveURL(/\/jumps\?.*welcome=1/);
  await expect(page.getByText(/saved\. Add (an email address|a phone number)/)).toBeVisible();
  expect((await prisma.workspaceProfile.findUniqueOrThrow({ where: { workspaceId: workspace.id } })).company).toBeNull();
});

test("all ratings retain the same optional public-review route and a correction path", async ({ page }) => {
  const { workspace } = await member(page);
  const contact = await prisma.contact.create({ data: { workspaceId: workspace.id, displayName: "Feedback person" } });
  for (const rating of [1, 2, 3, 4, 5]) {
  const token = randomBytes(32).toString("base64url");
  await prisma.reviewRequest.create({ data: { workspaceId: workspace.id, contactId: contact.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  await page.goto(`/review/${token}`);
  await page.getByRole("radio", { name: `${rating} out of 5` }).check();
  await expect(page.getByText(`Selected ${rating} out of 5`)).toBeVisible();
  await page.getByRole("button", { name: "Send private feedback" }).click();
  await expect(page.getByRole("link", { name: "Leave a public review (optional)" })).toBeVisible();
  await page.getByText("Contact the business or correct feedback", { exact: true }).click();
  await expect(page.getByRole("link", { name: "Contact the business directly" })).toHaveAttribute("href", "https://example.com/contact");
  const handoff = await page.request.get(`/api/reviews/${token}/public-review`, { maxRedirects: 0 });
  expect(handoff.status()).toBe(302); expect(handoff.headers().location).toBe("https://example.com/review");
  }
});


test("passwordless deletion rechecks recent authentication on the server", async ({ page }) => {
  const { user, session } = await member(page);
  await page.goto("/account?section=privacy");
  await page.getByLabel(`Type ${ACCOUNT_DELETION_PHRASE}`, { exact: true }).fill("wrong phrase");
  await page.getByRole("button", { name: "Permanently delete account" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(`Type ${ACCOUNT_DELETION_PHRASE} exactly`);
  await prisma.session.update({ where: { id: session.id }, data: { createdAt: new Date(Date.now() - 6 * 60_000) } });
  await page.getByLabel(`Type ${ACCOUNT_DELETION_PHRASE}`, { exact: true }).fill(ACCOUNT_DELETION_PHRASE);
  await page.getByRole("button", { name: "Permanently delete account" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Sign in again");
  expect(await prisma.user.count({ where: { id: user.id } })).toBe(1);
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign in again to confirm identity" })).toBeVisible();
  await prisma.session.update({ where: { id: session.id }, data: { createdAt: new Date() } });
  await page.reload();
  await page.getByLabel(`Type ${ACCOUNT_DELETION_PHRASE}`, { exact: true }).fill(ACCOUNT_DELETION_PHRASE);
  await page.getByRole("button", { name: "Permanently delete account" }).click();
  await expect(page).toHaveURL(/\/account\/deleted/);
  expect(await prisma.user.count({ where: { id: user.id } })).toBe(0);
});

test("MFA clipboard denial preserves codes and continuing requires storage acknowledgment", async ({ page }) => {
  test.info().annotations.push({ type: "privacy", description: "Synthetic recovery material; no recordings" });
  const { user } = await member(page);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash("Readiness synthetic password!", 4), staffMembership: { create: { role: "OWNER" } } } });
  await page.goto("/account/admin-mfa");
  const secret = (await page.getByTestId("mfa-secret").textContent())!.trim();
  await page.getByLabel("Current password", { exact: true }).fill("Readiness synthetic password!");
  await page.getByLabel("Authenticator code", { exact: true }).fill(generateTotpCode(secret));
  await page.getByRole("button", { name: "Enable administrator MFA" }).click();
  await expect(page.getByTestId("mfa-recovery-code")).toHaveCount(10);
  await expect(page.getByRole("button", { name: "Continue to Admin" })).toBeDisabled();
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Clipboard denied by fixture"); } } }));
  await page.getByRole("button", { name: "Copy recovery codes" }).click();
  await expect(page.getByLabel("Recovery codes for manual copying")).toBeVisible();
  await expect(page.getByTestId("mfa-recovery-code")).toHaveCount(10);
  await page.getByRole("checkbox", { name: "I stored my one-time recovery codes securely." }).check();
  await expect(page.getByRole("button", { name: "Continue to Admin" })).toBeEnabled();
});

test("automatic sending preview excludes held work and explains prior attempts", async ({ page }) => {
  const { workspace } = await member(page);
  const contact = await prisma.contact.create({ data: { workspaceId: workspace.id, displayName: "Sending preview", emails: { create: { email: "preview@example.test", normalized: "preview@example.test", isPrimary: true } } } });
  const blocked = await prisma.contact.create({ data: { workspaceId: workspace.id, displayName: "Do not contact", relationshipState: { create: { workspaceId: workspace.id, doNotContact: true } } } });
  const template = await prisma.stepTemplate.create({ data: { workspaceId: workspace.id, name: "Preview email", channel: "EMAIL", versions: { create: { version: 1, subject: "Checking in", body: "Synthetic preview" } } }, include: { versions: true } });
  const versionId = template.versions[0].id;
  const mix = await prisma.mix.create({ data: { workspaceId: workspace.id, name: "Preview plan", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: { stepVersionId: versionId, dayOffset: 0, sortOrder: 0 } } }, include: { steps: true } });
  const scheduledAt = new Date(Date.now() + 3600_000);
  const base = { workspaceId: workspace.id, contactId: contact.id, mixId: mix.id, mixStepId: mix.steps[0].id, stepVersionId: versionId, scheduledAt, reason: "Preview", templateSnapshot: {}, renderedSnapshot: { subject: "Checking in", body: "Synthetic preview" } };
  const jumps = await Promise.all(Array.from({ length: 5 }, (_, i) => prisma.jump.create({ data: { ...base, uniquenessKey: randomUUID(), ...(i === 2 ? { scheduledAt: new Date(Date.now() + 25 * 3600_000) } : {}), ...(i === 3 ? { contactId: blocked.id } : {}) } })));
  await prisma.automatedDelivery.create({ data: { workspaceId: workspace.id, jumpId: jumps[1].id, channel: "EMAIL", status: "FAILED", reviewEligibleAt: new Date(), error: "Synthetic prior failure" } });
  await prisma.jumpDraft.create({ data: { workspaceId: workspace.id, jumpId: jumps[4].id, stepVersionId: versionId, family: "EMAIL", body: "Owner draft" } });
  const response = await page.request.get("/api/settings/sending-preview?email=1&sms=0&minutes=15");
  expect(response.status()).toBe(200); const value = await response.json();
  expect(value.count).toBe(2);
  expect(value.items.map((item: { id: string }) => item.id).sort()).toEqual([jumps[0].id, jumps[1].id].sort());
  expect(value.items.find((item: { id: string }) => item.id === jumps[1].id)).toMatchObject({ earliestAt: null, blockedReason: expect.stringContaining("earlier delivery attempt") });
  if (process.env.RESEND_API_KEY) expect(value.items.find((item: { id: string }) => item.id === jumps[0].id).earliestAt).toBe(new Date(scheduledAt.getTime() + 15 * 60_000).toISOString());
  await prisma.automatedDelivery.deleteMany({ where: { workspaceId: workspace.id } });
});

test("saving a different preferences form warns before discarding its draft", async ({ page }) => {
  const { user, workspace } = await member(page);
  await page.goto('/account/preferences');
  await page.locator('input[name="name"]').fill('Saved preference name');
  await page.locator('input[name="defaultFollowUpTime"]').fill('11:25');
  const warning = page.waitForEvent('dialog');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  expect((await warning).message()).toContain('other form’s changes');
  await expect(page).toHaveURL(/\/account\/preferences$/);
  await expect(page.locator('input[name="name"]')).toHaveValue('Saved preference name');
  await expect(page.locator('input[name="defaultFollowUpTime"]')).toHaveValue('11:25');
  expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe('Readiness Owner');
  await page.locator('input[name="name"]').fill('Readiness Owner');
  await page.getByRole('button', { name: 'Save scheduling defaults', exact: true }).click();
  await expect(page).toHaveURL(/schedulingSaved=1/);
  await expect.poll(() => page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(false);
  await page.locator('input[name="name"]').fill('Saved preference name');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page).toHaveURL(/personalSaved=1/);
  expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe('Saved preference name');
  await expect(page.locator('input[name="defaultFollowUpTime"]')).toHaveValue('11:25');
  await expect.poll(() => page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(false);
});
