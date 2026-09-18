import { randomUUID, randomBytes, createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
const database = new URL(process.env.DATABASE_URL ?? "postgresql://localhost/unknown");
test.skip(!["localhost", "127.0.0.1"].includes(database.hostname) || !database.pathname.startsWith("/jitm_design_"), "Disposable fixtures only");
test.setTimeout(120_000);

test("older email events remain searchable and paging preserves the investigation", async ({ page }) => {
  const prefix = `ux-event-${randomUUID()}`;
  const user = await prisma.user.create({ data: { name: "UX operator", email: `${prefix}@example.test`, emailVerifiedAt: new Date(), staffMembership: { create: { role: "OPERATOR" } } } });
  const token = randomBytes(32).toString("base64url");
  const session = await prisma.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  await prisma.adminMfaCredential.create({ data: { userId: user.id, enabledAt: new Date(), secretCiphertext: "synthetic-ux-fixture" } });
  await prisma.adminMfaSession.create({ data: { userId: user.id, sessionId: session.id, expiresAt: session.expiresAt } });
  try {
    await prisma.emailProviderEvent.createMany({ data: Array.from({ length: 65 }, (_, i) => ({ id: `${prefix}-${String(i).padStart(3, "0")}`, type: "email.delivered", recipientHashes: [], providerId: `${prefix}-provider`, occurredAt: new Date("2026-01-01T00:00:00Z"), receivedAt: new Date("2026-01-01T00:00:00Z") })) });
    await page.context().addCookies([{ name: "jitm_session", value: token, url: process.env.PLAYWRIGHT_BASE_URL!, httpOnly: true, sameSite: "Strict" }]);
    await page.goto(`/admin/email?q=${prefix}`);
    await expect(page.getByRole("navigation", { name: "Results pages" })).toContainText("1–30 of 65 results");
    await page.getByRole("link", { name: "Next", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`q=${prefix}&page=2`));
    await page.getByRole("link", { name: "Next", exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Results pages" })).toContainText("61–65 of 65 results");
    await page.getByLabel("Event type or identifier").fill(`${prefix}-000`);
    await page.getByRole("button", { name: "Search events" }).click();
    await expect(page.getByRole("navigation", { name: "Results pages" })).toContainText("1–1 of 1 results");
    await expect(page.locator("main")).toContainText(`${prefix}-000`);
  } finally {
    await prisma.emailProviderEvent.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.platformAuditEvent.deleteMany({ where: { actorUserId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
