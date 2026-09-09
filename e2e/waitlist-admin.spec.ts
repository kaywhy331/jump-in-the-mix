import { openTestAdmission } from "../tests/helpers/admission-fixture";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "../src/lib/prisma";

// Enable only for a disposable local database and a web process with test mail configuration.
// No worker runs in this test: the action must enqueue, never send mail itself.
const enabled = process.env.WAITLIST_E2E === "1" && /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
test.skip(!enabled, "Requires WAITLIST_E2E=1 and a disposable local test database.");

let restoreAdmission: (() => Promise<void>) | undefined;
test.beforeAll(async () => { restoreAdmission = await openTestAdmission(); });
test.afterAll(async () => { await restoreAdmission?.(); });

test("admin manually invites selected confirmed users and removes them from Waiting", async ({ page, context }, testInfo) => {
  const suffix = randomUUID();
  const email = `waitlist-${suffix}@example.test`;
  const unconfirmedEmail = `unconfirmed-${suffix}@example.test`;
  const user = await prisma.user.create({ data: { email: `admin-${suffix}@example.test`, name: "Test admin", emailVerifiedAt: new Date(), isPlatformAdmin: true, staffMembership: { create: { role: "OWNER" } } } });
  const workspace = await prisma.workspace.create({ data: { name: "Test", slug: suffix, ownerId: user.id, members: { create: { userId: user.id, role: "OWNER" } } } });
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 60 * 60_000) } });
  await prisma.waitlistEntry.create({ data: { email, verifiedAt: new Date() } });
  await prisma.waitlistEntry.create({ data: { email: unconfirmedEmail } });
  try {
    await context.addCookies([{ name: "jitm_session", value: token, url: testInfo.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
    await page.goto("/admin/waitlist");
    await expect(page.getByRole("heading", { name: "Admin · Waitlist" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: unconfirmedEmail, exact: true })).toBeDisabled();
    await page.getByRole("checkbox", { name: email, exact: true }).check();
    await page.getByLabel("Reason for manual invitations").fill("Browser test");
    await page.getByRole("button", { name: "Send invitations to selected people" }).click();
    await expect(page.getByRole("status").filter({ hasText: "1 invitations queued" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: email, exact: true })).toHaveCount(0);
    const invite = await prisma.referralAccessInvite.findFirstOrThrow({ where: { recipientEmail: email }, include: { delivery: true } });
    expect(invite.source).toBe("WAITLIST_MANUAL");
    expect(invite.delivery?.status).toBe("QUEUED");
    expect(invite.lastSentAt).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).referralInvitesIssued).toBe(0);
    await page.getByRole("link", { name: "Access history", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Access history/ })).toBeVisible();
    await expect(page.getByText("WAITLIST MANUAL · QUEUED", { exact: false })).toBeVisible();
    await prisma.staffMembership.update({ where: { userId: user.id }, data: { status: "DISABLED" } });
    await page.goto("/admin/waitlist");
    await expect(page).toHaveURL(/\/jumps/);
  } finally {
    await prisma.referralAccessInvite.deleteMany({ where: { recipientEmail: { in: [email, unconfirmedEmail] } } });
    await prisma.waitlistEntry.deleteMany({ where: { email: { in: [email, unconfirmedEmail] } } });
    await prisma.waitlistAudit.deleteMany({ where: { actorUserId: user.id } });
    await prisma.workspace.delete({ where: { id: workspace.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("email confirmation changes eligibility only after submitting the confirmation form", async ({ page }) => {
  const email = `confirm-${randomUUID()}@example.test`;
  const token = randomBytes(32).toString("base64url");
  const entry = await prisma.waitlistEntry.create({ data: { email } });
  await prisma.verificationToken.create({ data: { email, purpose: "waitlist", tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 60 * 60_000) } });
  try {
    await page.goto(`/waitlist/confirm?token=${token}`);
    expect((await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } })).verifiedAt).toBeNull();
    await page.getByRole("button", { name: "Confirm waitlist request" }).click();
    await expect(page).toHaveURL(/\/waitlist\?confirmed=1$/);
    expect((await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } })).verifiedAt).not.toBeNull();
  } finally {
    await prisma.waitlistEntry.delete({ where: { id: entry.id } });
    await prisma.verificationToken.deleteMany({ where: { email } });
  }
});

test("a recipient can leave only by confirming the email link, then rejoin with new email proof", async ({ page, request }) => {
  const email = `leave-${randomUUID()}@example.test`;
  const token = randomBytes(32).toString("base64url");
  const entry = await prisma.waitlistEntry.create({ data: { email, verifiedAt: new Date(), createdAt: new Date(Date.now() - 86400_000) } });
  await prisma.verificationToken.create({ data: { email, purpose: "invitation_optout", tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  try {
    const response = await request.get(`/waitlist/leave?token=${token}`);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["referrer-policy"]).toBe("no-referrer");
    await page.goto(`/waitlist/leave?token=${token}`);
    expect((await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe("WAITING");
    await page.getByRole("button", { name: "Leave waitlist and stop invitations" }).click();
    await expect(page).toHaveURL(/\/waitlist\/leave\?stopped=1$/);
    await expect(page.getByRole("heading", { name: "Invitation emails stopped" })).toBeVisible();
    expect((await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe("WITHDRAWN");
    expect(await prisma.emailSuppression.count({ where: { email } })).toBe(1);
    const rejoinToken = randomBytes(32).toString("base64url");
    await prisma.verificationToken.create({ data: { email, purpose: "waitlist", tokenHash: createHash("sha256").update(rejoinToken).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
    await page.goto(`/waitlist/confirm?token=${rejoinToken}`);
    await expect(page.getByText(/confirming allows invitation emails again/)).toBeVisible();
    await page.getByRole("button", { name: "Confirm waitlist request" }).click();
    await expect(page).toHaveURL(/\/waitlist\?confirmed=1$/);
    const rejoined = await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(rejoined.status).toBe("WAITING");
    expect(rejoined.createdAt.getTime()).toBeGreaterThan(entry.createdAt.getTime());
    expect(await prisma.emailSuppression.count({ where: { email } })).toBe(0);
  } finally {
    await prisma.waitlistAudit.deleteMany({ where: { entryId: entry.id } });
    await prisma.waitlistEntry.delete({ where: { id: entry.id } });
    await prisma.verificationToken.deleteMany({ where: { email } });
    await prisma.emailSuppression.deleteMany({ where: { email } });
  }
});
