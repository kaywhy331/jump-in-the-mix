import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.skip(!process.env.WEB_PUSH_VAPID_PUBLIC_KEY || !process.env.WEB_PUSH_VAPID_PRIVATE_KEY, "Requires local, non-delivering push configuration.");
test.use({ screenshot: "off", video: "off", trace: "off" });
test.setTimeout(120_000);
const password = "PushOwnership123!";
const owners: Array<{ id: string; email: string; workspaceId: string }> = [];
test.beforeAll(async () => {
  for (const name of ["Push Alpha", "Push Beta"]) {
    const suffix = randomUUID();
    const user = await prisma.user.create({ data: { name, email: `push-ui-${suffix}@example.com`, passwordHash: await bcrypt.hash(password, 4), emailVerifiedAt: new Date() } });
    const workspace = await prisma.workspace.create({ data: { ownerId: user.id, name, slug: `push-ui-${suffix}`, members: { create: { userId: user.id } }, profile: { create: { onboardingDone: true } } } });
    owners.push({ id: user.id, email: user.email, workspaceId: workspace.id });
  }
});
test.afterAll(async () => {
  for (const owner of owners) {
    await prisma.pushSubscription.deleteMany({ where: { workspaceId: owner.workspaceId } });
    await prisma.notificationPreference.deleteMany({ where: { workspaceId: owner.workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: owner.workspaceId } });
    await prisma.user.deleteMany({ where: { id: owner.id } });
  }
});
async function ready(page: Page) {
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");
}
async function signIn(page: Page, owner: typeof owners[number]) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(owner.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await Promise.all([page.waitForURL(/\/jumps/), page.getByRole("button", { name: "Sign in", exact: true }).click()]);
  await ready(page);
}
async function notifications(page: Page) {
  await page.goto("/settings/notifications"); await ready(page);
  await expect(page.getByRole("button", { name: "Turn on", exact: true })).toBeVisible();
}
test.beforeEach(async ({ context }, testInfo) => {
  const endpoint = `https://fcm.googleapis.com/fcm/send/local-ui-${testInfo.testId}-${testInfo.retry}`;
  // Browser APIs are simulated; only the real local application/API/database
  // handles ownership. No permission prompt, provider call or notification runs.
  await context.addInitScript(({ endpoint }) => {
    const fixture = { endpoint, pausePermission: false, permissionPending: false, release: () => undefined as void, unsubscribes: 0 };
    Object.assign(window, { pushFixture: fixture });
    Object.defineProperty(window, "Notification", { configurable: true, value: class {
      static permission = "granted";
      static requestPermission() { if (!fixture.pausePermission) return Promise.resolve("granted"); fixture.permissionPending = true; return new Promise(resolve => { fixture.release = () => resolve("granted"); }); }
    } });
    Object.defineProperty(window, "PushManager", { configurable: true, value: class {} });
    const subscription = { endpoint, toJSON: () => ({ endpoint, keys: { p256dh: "a".repeat(88), auth: "b".repeat(24) } }), unsubscribe: async () => { fixture.unsubscribes++; return true; } };
    Object.defineProperty(ServiceWorkerRegistration.prototype, "pushManager", { configurable: true, get: () => ({ getSubscription: async () => subscription, subscribe: async () => subscription }) });
  }, { endpoint });
  await context.route("**/api/notifications/test", route => { throw new Error(`Unexpected real notification test: ${route.request().method()}`); });
});

test("a shared browser needs explicit opt-in for its new account and sign-out stops delivery", async ({ page, context }) => {
  await signIn(page, owners[0]); await notifications(page);
  const endpoint = await page.evaluate(() => (window as any).pushFixture.endpoint as string);
  await page.getByRole("button", { name: "Turn on", exact: true }).click();
  await expect(page.getByText("Push reminders are on", { exact: true })).toBeVisible();
  const first = await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint } }); expect(first.sessionId).toBeTruthy();
  const other = await context.newPage(); await signIn(other, owners[1]);
  await expect(page.locator(".app-shell")).toHaveCount(0);
  expect((await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint } })).sessionId).toBeNull();
  await notifications(other);
  await other.getByRole("button", { name: "Turn on", exact: true }).click();
  await expect(other.getByText("Push reminders are on", { exact: true })).toBeVisible();
  const current = await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint } });
  expect(current.userId).toBe(owners[1].id); expect(current.sessionId).not.toBe(first.sessionId);
  for (const colorScheme of ["light", "dark"] as const) {
    await other.emulateMedia({ colorScheme }); await other.setViewportSize({ width: 390, height: 844 });
    expect((await axeInPage(other).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  }
  await other.getByRole("button", { name: "Turn off", exact: true }).click();
  await expect(other.getByText("Push reminders are off", { exact: true })).toBeVisible();
  expect(await prisma.pushSubscription.findUnique({ where: { endpoint } })).toBeNull();
  expect(await other.evaluate(() => (window as any).pushFixture.unsubscribes)).toBe(0);
  await other.getByRole("button", { name: "Turn on", exact: true }).click();
  await expect(other.getByText("Push reminders are on", { exact: true })).toBeVisible();
  await other.goto("/more"); await ready(other);
  await other.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(other).toHaveURL(/\/signed-out/);
  expect((await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint } })).sessionId).toBeNull();
  await other.close();
});

test("a permission result from an old tab cannot enable reminders for the next account", async ({ page, context }) => {
  await signIn(page, owners[0]); await notifications(page);
  const endpoint = await page.evaluate(() => { (window as any).pushFixture.pausePermission = true; return (window as any).pushFixture.endpoint as string; });
  await page.getByRole("button", { name: "Turn on", exact: true }).click();
  await page.waitForFunction(() => (window as any).pushFixture.permissionPending);
  const other = await context.newPage(); await signIn(other, owners[1]);
  await expect(page.locator(".app-shell")).toHaveCount(0);
  const response = page.waitForResponse(response => response.url().endsWith("/api/notifications/subscribe") && response.request().method() === "POST");
  await page.evaluate(() => (window as any).pushFixture.release());
  expect((await response).status()).toBe(409);
  expect(await prisma.pushSubscription.findUnique({ where: { endpoint } })).toBeNull();
  expect(await page.evaluate(() => (window as any).pushFixture.unsubscribes)).toBe(0);
  await other.close();
});
