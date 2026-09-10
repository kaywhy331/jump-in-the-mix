import { applyRenderedTheme } from "./theme-fixture";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Webhook } from "svix";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { prisma } from "../src/lib/prisma";
import { emailRecipientHash } from "../src/lib/email-budget";

const enabled = process.env.STAFF_E2E === "1" && Boolean(process.env.RESEND_WEBHOOK_SECRET) && /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
test.skip(!enabled, "Requires isolated staff fixtures, a local test database, and a synthetic webhook signing secret.");

test("signed delivery events appear in admin diagnostics without exposing email content", async ({ page, context, request }, testInfo) => {
  const id = `email-browser-${randomUUID()}`;
  const email = `${id}@example.test`;
  const token = randomBytes(32).toString("base64url");
  const providerId = randomUUID(); const messageId = randomUUID(); const eventId = `msg_${randomUUID()}`;
  const staff = await prisma.user.create({ data: { email: `staff-${email}`, name: "Email operator", emailVerifiedAt: new Date(), staffMembership: { create: { role: "OPERATOR" } } } });
  const entry = await prisma.waitlistEntry.create({ data: { email, verifiedAt: new Date(), status: "ACCESS_GRANTED" } });
  await prisma.session.create({ data: { userId: staff.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  await prisma.emailMessage.create({ data: { id: messageId, recipientHash: emailRecipientHash(email), payloadHash: "test-only", category: "INVITATION", firstAttemptAt: new Date(), acceptedAt: new Date(), providerId } });
  const invite = await prisma.referralAccessInvite.create({ data: { recipientEmail: email, tokenHash: randomUUID(), tokenCiphertext: "test-only", source: "WAITLIST_MANUAL", delivery: { create: { messageCiphertext: "test-only", status: "SENT", providerId, emailMessageId: messageId } } } });
  try {
    const body = JSON.stringify({ type: "email.bounced", created_at: new Date().toISOString(), data: { email_id: providerId, to: [email], subject: "PRIVATE SUBJECT NEVER DISPLAY", bounce: { type: "Permanent", message: "PRIVATE PROVIDER BODY" } } });
    const signedAt = new Date();
    const headers = { "content-type": "application/json", "svix-id": eventId, "svix-timestamp": String(Math.floor(signedAt.getTime() / 1000)), "svix-signature": new Webhook(process.env.RESEND_WEBHOOK_SECRET!).sign(eventId, signedAt, body) };
    expect((await request.post("/api/webhooks/resend", { headers, data: `${body} ` })).status()).toBe(401);
    expect((await request.post("/api/webhooks/resend", { headers, data: body })).status()).toBe(200);
    expect(await (await request.post("/api/webhooks/resend", { headers, data: body })).json()).toEqual({ duplicate: true });
    expect((await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe("SUPPRESSED");
    await context.addCookies([{ name: "jitm_session", value: token, url: testInfo.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
    await page.goto("/admin/email");
    await expect(page.getByRole("heading", { name: "Admin · Email" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "email.bounced", exact: true })).toBeVisible();
    await expect(page.getByText(/0 of 90 attempts used/)).toBeVisible();
    await expect(page.getByText("PRIVATE SUBJECT NEVER DISPLAY")).toHaveCount(0);
    await expect(page.getByText("PRIVATE PROVIDER BODY")).toHaveCount(0);
    for (const colorScheme of ["light", "dark"] as const) for (const width of [320, 1440]) {
      await applyRenderedTheme(page, colorScheme, { width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    }
    await page.goto(`/admin/access?q=${encodeURIComponent(email)}`);
    await expect(page.getByText("Bounced", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Revoke invitation" })).toHaveCount(0);
    await prisma.staffMembership.update({ where: { userId: staff.id }, data: { denies: ["operations.read"] } });
    await page.goto("/admin/email");
    await expect(page).toHaveURL(/\/admin\/access-denied$/);
  } finally {
    await prisma.referralAccessInvite.deleteMany({ where: { id: invite.id } });
    await prisma.waitlistEntry.deleteMany({ where: { id: entry.id } });
    await prisma.emailMessage.deleteMany({ where: { id: messageId } });
    await prisma.emailProviderEvent.deleteMany({ where: { id: eventId } });
    await prisma.emailSuppression.deleteMany({ where: { email } });
    await prisma.platformAuditEvent.deleteMany({ where: { OR: [{ actorUserId: staff.id }, { entityId: eventId }] } });
    await prisma.user.deleteMany({ where: { id: staff.id } });
  }
});
