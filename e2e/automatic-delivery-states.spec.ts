import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";

// A failed or unconfirmed automatic send must be visible on Today, force manual sending, and the
// review must say plainly when automatic sending applies.
const userEmail = process.env.E2E_USER_EMAIL ?? "demo@jumpinthemix.local";
const userPassword = process.env.E2E_USER_PASSWORD ?? "JumpInTheMix123!";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(userEmail);
  await page.getByLabel("Password", { exact: true }).fill(userPassword);
  await Promise.all([page.waitForURL(/\/(jumps|onboarding)(\?|$)/), page.getByRole("button", { name: "Sign in" }).click()]);
}

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const people = {
  failed: { contactId: `e2e-auto-failed-${suffix}`, jumpId: `e2e-auto-failed-jump-${suffix}`, name: `Auto Failed ${suffix}` },
  uncertain: { contactId: `e2e-auto-uncertain-${suffix}`, jumpId: `e2e-auto-uncertain-jump-${suffix}`, name: `Auto Uncertain ${suffix}` },
  pending: { contactId: `e2e-auto-pending-${suffix}`, jumpId: `e2e-auto-pending-jump-${suffix}`, name: `Auto Pending ${suffix}` }
};
let previousPreference: { enabled: boolean; emailEnabled: boolean; smsEnabled: boolean; reviewWindowMinutes: number } | null = null;

test.describe("automatic-delivery states on Today", () => {
  test.beforeAll(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Exercised once on the docked review.");
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: "demo_workspace" } });
    const mix = await prisma.mix.findFirstOrThrow({
      where: { workspaceId: workspace.id, status: "ACTIVE", steps: { some: { isActive: true } } },
      include: { steps: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, take: 1, include: { stepVersion: { include: { stepTemplate: true } } } } }
    });
    const step = mix.steps[0];
    if (!step) throw new Error("The E2E workspace needs an active Mix step.");
    const channel = step.stepVersion.stepTemplate.channel;
    const existing = await prisma.automationPreference.findUnique({ where: { workspaceId: workspace.id } });
    previousPreference = existing ? { enabled: existing.enabled, emailEnabled: existing.emailEnabled, smsEnabled: existing.smsEnabled, reviewWindowMinutes: existing.reviewWindowMinutes } : null;
    await prisma.automationPreference.upsert({ where: { workspaceId: workspace.id }, create: { workspaceId: workspace.id, enabled: true, emailEnabled: true, smsEnabled: true }, update: { enabled: true, emailEnabled: true, smsEnabled: true } });
    let phone = 14155550160;
    for (const person of Object.values(people)) {
      const [firstName, ...rest] = person.name.split(" ");
      await prisma.contact.create({ data: { id: person.contactId, workspaceId: workspace.id, firstName, lastName: rest.join(" "), displayName: person.name, phones: { create: { phone: `+${phone}`, normalized: String(phone), isPrimary: true } }, emails: { create: { email: `${person.contactId}@example.test`, normalized: `${person.contactId}@example.test`, isPrimary: true } } } });
      phone += 1;
      await prisma.jump.create({ data: { id: person.jumpId, workspaceId: workspace.id, contactId: person.contactId, mixId: mix.id, mixStepId: step.id, stepVersionId: step.stepVersionId, scheduledAt: new Date(Date.now() - 60_000), status: "PENDING", reason: "Automatic delivery state test", templateSnapshot: { channel, body: "Prepared E2E follow-up" }, renderedSnapshot: { body: "Prepared E2E follow-up" }, uniquenessKey: `e2e:auto:${person.jumpId}` } });
    }
    await prisma.automatedDelivery.create({ data: { workspaceId: workspace.id, jumpId: people.failed.jumpId, channel, status: "FAILED", reviewEligibleAt: new Date(), error: "Email provider rejected the request (status 400)." } });
    await prisma.automatedDelivery.create({ data: { workspaceId: workspace.id, jumpId: people.uncertain.jumpId, channel, status: "FAILED", reviewEligibleAt: new Date(), error: "Delivery result became uncertain after the lease expired; not retried to prevent a duplicate." } });
  });
  test.afterAll(async () => {
    const jumpIds = Object.values(people).map((person) => person.jumpId);
    await prisma.automatedDelivery.deleteMany({ where: { jumpId: { in: jumpIds } } });
    await prisma.jump.deleteMany({ where: { id: { in: jumpIds } } });
    await prisma.contact.deleteMany({ where: { id: { in: Object.values(people).map((person) => person.contactId) }, workspaceId: "demo_workspace" } });
    if (previousPreference) await prisma.automationPreference.update({ where: { workspaceId: "demo_workspace" }, data: previousPreference });
    else await prisma.automationPreference.deleteMany({ where: { workspaceId: "demo_workspace" } });
  });

  test("failed and unconfirmed sends are marked, force manual sending, and the automation line shows otherwise", async ({ page }) => {
    await signIn(page);
    await page.goto("/jumps?range=all&status=pending");
    const card = (id: string) => page.locator(`[data-jump-workflow="${id}"]:visible`);
    await expect(card(people.failed.jumpId).locator(".jump-delivery-failed[data-delivery-failed='failed']")).toContainText("Automatic send failed");
    await expect(card(people.uncertain.jumpId).locator(".jump-delivery-failed[data-delivery-failed='uncertain']")).toContainText("Send not confirmed");
    await expect(card(people.pending.jumpId).locator(".jump-delivery-failed")).toHaveCount(0);

    await card(people.failed.jumpId).getByRole("button", { name: /^Review (message|call) for/ }).click();
    const failedNotice = page.locator(".notice[data-delivery-failed='failed']:visible");
    await expect(failedNotice).toContainText("Couldn’t send automatically");
    await expect(failedNotice).toContainText("Send it yourself.");
    await expect(page.locator("[data-delivery-status='manual']:visible")).toHaveText("Manual · you send");
    await expect(page.locator("[data-follow-up-automatic]:visible")).toHaveCount(0);

    await card(people.uncertain.jumpId).getByRole("button", { name: /^Review (message|call) for/ }).click();
    await expect(page.locator(".notice[data-delivery-failed='uncertain']:visible")).toContainText("We couldn’t confirm whether this was sent. Check your sent messages before sending again.");

    await card(people.pending.jumpId).getByRole("button", { name: /^Review (message|call) for/ }).click();
    // The line carries the worker's computed "not before" time, or says it is due, never a bare "on".
    await expect(page.locator("[data-follow-up-automatic]:visible")).toHaveText(/^Sends automatically (?:at .+|any minute now) unless you send, snooze or skip it first\.$/);
    await expect(page.locator(".notice[data-delivery-failed]:visible")).toHaveCount(0);
  });
});
