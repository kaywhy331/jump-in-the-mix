import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { prisma } from "../src/lib/prisma";
import { createSupportFixture } from "../tests/helpers/support-fixture";
import { adminReplyToSupportTicketRecord } from "../src/lib/support-service";
import { frozenSupportEmail } from "../src/lib/support-email-delivery";
import { emailRecipientHash } from "../src/lib/email-budget";
import { preparedEmail } from "../src/lib/transactional-email";
import { clearRateLimit } from "../src/lib/rate-limit";
const enabled = process.env.SUPPORT_EMAIL_E2E === "1" && process.env.AUTH_REQUIRE_ADMIN_MFA === "true" && /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
test.skip(!enabled, "Requires isolated support email fixtures and administrator MFA.");
test.use({ screenshot: "off", video: "off", trace: "off", actionTimeout: 20_000 });
let f: Awaited<ReturnType<typeof createSupportFixture>>;
const password = "local-support-browser-password", ids: string[] = [];
test.beforeEach(async () => {
  f = await createSupportFixture();
  await prisma.staffMembership.update({ where: { userId: f.admin.user.id }, data: { grants: ["email.manage"] } });
  await prisma.user.update({ where: { id: f.admin.user.id }, data: { passwordHash: await bcrypt.hash(password, 4) } });
});
test.afterEach(async () => {
  if (!f) return;
  await prisma.emailMessage.deleteMany({ where: { id: { in: ids.splice(0) } } });
  await clearRateLimit("admin.support-action", [f.admin.user.id]); await f.cleanup();
});
async function layout(page: import("@playwright/test").Page) {
  for (const width of [320, 1440]) for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width, height: 1000 }); await page.evaluate(value => document.documentElement.setAttribute("data-theme", value), theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
}
async function oldNotification(accepted = false) {
  const { message } = await adminReplyToSupportTicketRecord({ ticketId: f.ticket.id, adminUserId: f.admin.user.id, actorSessionId: f.admin.session.id, requestKey: randomUUID(), body: "PRIVATE_SUPPORT_EMAIL_BODY: the response stays in your ticket." });
  let delivery = await prisma.supportEmailDelivery.findFirstOrThrow({ where: { messageId: message.id } });
  const prepared = preparedEmail(frozenSupportEmail(delivery)), first = new Date(Date.now() - 25 * 3600_000);
  ids.push(delivery.emailMessageId);
  await prisma.emailMessage.create({ data: { id: delivery.emailMessageId, category: "PRODUCT", payloadHash: prepared.payloadHash, recipientHash: emailRecipientHash(prepared.email), firstAttemptAt: first, ...(accepted ? { acceptedAt: first, providerId: randomUUID() } : {}) } });
  delivery = await prisma.supportEmailDelivery.update({ where: { id: delivery.id }, data: { status: "REVIEW", firstAttemptAt: first, createdAt: first, attempts: 1, lastError: "Provider acceptance needs review." } });
  await prisma.supportTicketMessage.update({ where: { id: message.id }, data: { emailStatus: "FAILED" } });
  return { message, delivery };
}

test("a saved reply appears for the customer while its notification waits for the worker", async ({ page, context, browser }, info) => {
  const baseURL = info.project.use.baseURL!;
  await context.addCookies([{ name: "jitm_session", value: f.admin.token, url: baseURL, httpOnly: true, sameSite: "Strict" }]);
  await page.goto(`/admin/support/${f.ticket.id}`);
  const body = "We checked the Mix. Please confirm its Jump Date in the ticket.";
  await page.getByRole("textbox", { name: "Jump in the Mix Response", exact: true }).fill(body);
  await page.getByRole("button", { name: "Send Jump in the Mix Response", exact: true }).click();
  await expect(page).toHaveURL(/replied=1$/); await expect(page.getByText("Email pending", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Jump in the Mix Response", exact: true })).toHaveValue("");
  const delivery = await prisma.supportEmailDelivery.findFirstOrThrow({ where: { message: { ticketId: f.ticket.id } } });
  expect(delivery.status).toBe("QUEUED"); expect(await prisma.emailSendAttempt.count({ where: { messageId: delivery.emailMessageId } })).toBe(0);
  await layout(page);
  const customer = await browser.newContext({ baseURL });
  try {
    await customer.addCookies([{ name: "jitm_session", value: f.customer.token, url: baseURL, httpOnly: true, sameSite: "Strict" }]);
    const view = await customer.newPage(); await view.goto(`/account/tickets/${f.ticket.id}`); await expect(view.getByText(body, { exact: true })).toBeVisible();
    expect(await view.content()).not.toContain(delivery.emailMessageId); await expect(view.getByText("Review this email notification", { exact: true })).toHaveCount(0);
  } finally { await customer.close(); }
});

test("an administrator finds a review and repairs local acceptance without sending another email", async ({ page, context }, info) => {
  const item = await oldNotification(true);
  await context.addCookies([{ name: "jitm_session", value: f.admin.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  await page.goto("/admin/support?email=review"); await page.getByRole("link").filter({ hasText: f.ticket.reference }).click();
  await page.getByText("Review this email notification", { exact: true }).click();
  await layout(page);
  await page.getByRole("textbox", { name: "Review reason", exact: true }).fill("Confirmed the original local provider acceptance receipt.");
  await page.getByRole("button", { name: "Check acceptance receipt", exact: true }).click();
  await expect(page).toHaveURL(/emailReviewed=1$/); await expect(page.getByText("Accepted by email provider", { exact: true })).toBeVisible();
  expect((await prisma.supportEmailDelivery.findUniqueOrThrow({ where: { id: item.delivery.id } })).status).toBe("SENT");
  expect(await prisma.emailSendAttempt.count({ where: { messageId: item.delivery.emailMessageId } })).toBe(0);
});

test("a replacement requires explicit review and a current password, preserving one reply and its delivery history", async ({ page, context }, info) => {
  const item = await oldNotification();
  await context.addCookies([{ name: "jitm_session", value: f.admin.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  await page.goto(`/admin/support/${f.ticket.id}`); await page.getByText("Approve a replacement notification", { exact: true }).click();
  await layout(page);
  await page.getByRole("textbox", { name: "Reason for another email" }).fill("Customer requested another notification after provider review.");
  await page.getByRole("textbox", { name: "Provider investigation reference" }).fill("Provider review CASE-100");
  await page.getByRole("textbox", { name: "Customer request reference" }).fill("Customer request CASE-101");
  await page.getByLabel("I checked the provider history.", { exact: true }).check();
  await page.getByLabel("The customer requested another notification.", { exact: true }).check();
  await page.getByLabel("I understand another copy may arrive.", { exact: true }).check();
  await page.getByLabel("Current administrator password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Approve replacement email", exact: true }).click();
  await expect(page).toHaveURL(/emailReviewed=1$/); await expect(page.getByText("Email pending", { exact: true })).toBeVisible();
  const deliveries = await prisma.supportEmailDelivery.findMany({ where: { messageId: item.message.id }, orderBy: { generation: "asc" } });
  expect(deliveries).toHaveLength(2); expect(deliveries[0].status).toBe("REVIEW"); expect(deliveries[1].status).toBe("QUEUED");
  expect(preparedEmail(frozenSupportEmail(deliveries[0])).body).toBe(preparedEmail(frozenSupportEmail(deliveries[1])).body);
  expect(await prisma.supportTicketMessage.count({ where: { ticketId: f.ticket.id, authorType: "ADMIN" } })).toBe(1);
  expect(await prisma.emailSendAttempt.count({ where: { messageId: { in: deliveries.map(d => d.emailMessageId) } } })).toBe(0);
});
