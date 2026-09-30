import { createHash, randomBytes, randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";

// Billing stays off until Kevin chooses a start date (docs/PRICING_DECISION_2026-09-29.md): the page explains the free
// beta and offers nothing to buy, and the Stripe webhook refuses events.
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
const users: string[] = [];

async function account(page: Page) {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { name: "Plan Owner", email: `plan-owner-${suffix}@example.test`, emailVerifiedAt: new Date() } }); users.push(user.id);
  await prisma.workspace.create({ data: { name: "Plan fixture", slug: suffix, ownerId: user.id, members: { create: { userId: user.id } }, profile: { create: { onboardingDone: true, onboardingStep: 5 } } } });
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  await page.context().clearCookies();
  await page.context().addCookies([{ name: "jitm_session", value: token, url: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000", httpOnly: true, sameSite: "Strict" }]);
  await page.request.get("/api/auth/browser-context");
}

test.afterEach(async () => {
  await prisma.workspace.deleteMany({ where: { ownerId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } }); users.length = 0;
});

test("while billing is off, Plan and billing explains the free beta and offers nothing to buy", async ({ page }) => {
  await account(page);
  await page.goto("/account");
  await Promise.all([page.waitForURL(/\/account\/billing$/), page.getByRole("link", { name: "See your plan" }).click()]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Plan and billing");
  await expect(page.getByRole("heading", { name: "Free during the beta" })).toBeVisible();
  const main = page.locator("#main-content, main").first();
  await expect(main).toContainText("Paid plans haven’t started yet, so nothing is charged and no plan limits apply.");
  await expect(main).toContainText("Plus ($15 a month or $144 a year) and Pro ($29 a month or $288 a year)");
  await expect(page.getByRole("button", { name: /a month|a year|Manage billing/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "See what each plan includes" })).toHaveAttribute("href", "/pricing");
  expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  const webhook = await page.request.post("/api/webhooks/stripe", { data: "{}", headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=0" } });
  expect(webhook.status()).toBe(503);
});
