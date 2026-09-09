import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Prisma } from "../src/generated/prisma/client";
import { prisma } from "../src/lib/prisma";
import { runDataRetention } from "../src/lib/data-retention";
import { createSupportFixture } from "../tests/helpers/support-fixture";
const enabled = process.env.DATA_RETENTION_E2E === "1" && process.env.AUTH_REQUIRE_ADMIN_MFA === "true" && /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
test.skip(!enabled, "Requires isolated retention fixtures and administrator MFA.");
test.use({ screenshot: "off", video: "off", trace: "off", actionTimeout: 20_000 });
let f: Awaited<ReturnType<typeof createSupportFixture>>;
let originalState: Awaited<ReturnType<typeof prisma.dataRetentionState.findUnique>>, priorAuditIds: string[];
const grants: string[] = [], events: string[] = [];
test.beforeEach(async () => {
  originalState = await prisma.dataRetentionState.findUnique({ where: { id: "primary" } });
  priorAuditIds = (await prisma.platformAuditEvent.findMany({ where: { action: "privacy.retention.complete" }, select: { id: true } })).map(row => row.id);
  await prisma.dataRetentionState.deleteMany({ where: { id: "primary" } });
  f = await createSupportFixture();
  await prisma.staffMembership.update({ where: { userId: f.admin.user.id }, data: { role: "OWNER" } });
});
test.afterEach(async () => {
  if (!f) return;
  await prisma.referralAccessInvite.deleteMany({ where: { id: { in: grants } } });
  await prisma.emailProviderEvent.deleteMany({ where: { id: { in: events } } });
  await prisma.platformAuditEvent.deleteMany({ where: { OR: [{ action: "privacy.retention.complete", id: { notIn: priorAuditIds } }, { entityId: f.ticket.id }] } });
  await prisma.dataRetentionState.deleteMany({ where: { id: "primary" } });
  if (originalState) await prisma.dataRetentionState.create({ data: { ...originalState, counts: originalState.counts ?? Prisma.DbNull } });
  await f.cleanup(); grants.length = 0; events.length = 0;
});
async function signIn(context: import("@playwright/test").BrowserContext, baseURL: string, token: string) {
  await context.addCookies([{ name: "jitm_session", value: token, url: baseURL, httpOnly: true, sameSite: "Strict" }]);
}
async function layout(page: import("@playwright/test").Page) {
  for (const width of [320, 1440]) for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width, height: 900 }); await page.evaluate(value => document.documentElement.setAttribute("data-theme", value), theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  }
}
test("the administrator sees missing, current, stale and failed cleanup evidence behind permission and MFA gates", async ({ page, context }, info) => {
  await signIn(context, info.project.use.baseURL!, f.admin.token);
  await page.goto("/admin/operations"); const card = page.locator("#data-retention");
  await expect(card).toContainText("Data cleanup is missing");
  await runDataRetention(); await page.reload(); await expect(card).toContainText("complete data cleanup pass"); await layout(page);
  await prisma.dataRetentionState.update({ where: { id: "primary" }, data: { completedAt: new Date(Date.now() - 25 * 3600_000) } });
  await page.reload(); await expect(card).toContainText("Data cleanup is missing");
  await prisma.dataRetentionState.update({ where: { id: "primary" }, data: { completedAt: new Date(), failedAt: new Date(), lastError: "PRIVATE_DATABASE_DIAGNOSTIC", counts: { privatePayload: "PRIVATE_COUNT_PAYLOAD" } } });
  await page.reload(); await expect(card).toContainText("Data cleanup is missing"); expect(await page.content()).not.toContain("PRIVATE_");
  await prisma.staffMembership.update({ where: { userId: f.admin.user.id }, data: { denies: ["operations.read"] } });
  await page.goto("/admin/operations"); await expect(page).toHaveURL(/access-denied/);
  await prisma.staffMembership.update({ where: { userId: f.admin.user.id }, data: { denies: [] } });
  await prisma.adminMfaSession.deleteMany({ where: { userId: f.admin.user.id } });
  await page.goto("/admin/operations"); await expect(page).toHaveURL(/\/account\/admin-mfa/);
});
test("customers see the retention policy and an expired resolved conversation disappears from their account", async ({ page, context }, info) => {
  await signIn(context, info.project.use.baseURL!, f.customer.token);
  const old = new Date(Date.now() - 181 * 86_400_000);
  await prisma.supportTicketMessage.updateMany({ where: { ticketId: f.ticket.id }, data: { createdAt: old } });
  await prisma.supportTicket.update({ where: { id: f.ticket.id }, data: { status: "RESOLVED", resolvedAt: old, lastActivityAt: old, updatedAt: old } });
  await page.goto("/help"); await expect(page.locator("#contact-support")).toContainText("180 days without activity");
  await page.goto("/account/tickets"); await expect(page.getByRole("link", { name: /Help with a missing follow-up/ })).toBeVisible();
  await page.goto(`/account/tickets/${f.ticket.id}`); await expect(page.getByText("PRIVATE_SUPPORT_BODY_SENTINEL", { exact: true })).toBeVisible(); await layout(page);
  await runDataRetention(); await page.reload(); await expect(page.getByText("PRIVATE_SUPPORT_BODY_SENTINEL", { exact: true })).toHaveCount(0);
  await page.goto("/account/tickets"); await expect(page.getByRole("link", { name: /Help with a missing follow-up/ })).toHaveCount(0); await expect(page.getByText("180 days without activity", { exact: false })).toBeVisible();
});
test("expired invitation payloads leave recovery and provider events retain only replay metadata", async ({ page, context }, info) => {
  await signIn(context, info.project.use.baseURL!, f.admin.token);
  const old = new Date(Date.now() - 31 * 86_400_000), email = `retention-browser-${randomUUID()}@example.test`;
  const invite = await prisma.referralAccessInvite.create({ data: { recipientEmail: email, source: "WAITLIST_MANUAL", tokenHash: randomUUID(), tokenCiphertext: "PRIVATE_ACCESS_TOKEN", revokedAt: old, createdAt: old } }); grants.push(invite.id);
  await prisma.waitlistDelivery.create({ data: { inviteId: invite.id, status: "SENT", messageCiphertext: "PRIVATE_EMAIL_CONTENT", createdAt: old, updatedAt: old, generationStartedAt: old } });
  const eventId = `retention-browser-${randomUUID()}`; events.push(eventId);
  await prisma.emailProviderEvent.create({ data: { id: eventId, type: "email.delivered", providerId: "PRIVATE_PROVIDER_RECORD", recipientHashes: ["PRIVATE_RECIPIENT_HASH"], occurredAt: old, receivedAt: old } });
  const path = `/admin/email/recovery?status=SENT&q=${encodeURIComponent(email)}`;
  await page.goto(path); await expect(page.getByRole("heading", { name: email, exact: true })).toBeVisible(); expect(await page.content()).not.toContain("PRIVATE_ACCESS_TOKEN");
  await runDataRetention(); await page.reload(); await expect(page.getByRole("heading", { name: email, exact: true })).toHaveCount(0);
  await page.goto("/admin/email"); await expect(page.getByText("Private provider details expired", { exact: false })).toBeVisible();
  expect(await page.content()).not.toContain("PRIVATE_PROVIDER_RECORD"); expect(await page.content()).not.toContain("PRIVATE_RECIPIENT_HASH");
});
