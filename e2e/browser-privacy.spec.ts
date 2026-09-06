import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { axeInPage } from "./axe-in-page";
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { prisma } from "../src/lib/prisma";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "allow" });
test.setTimeout(120_000);
const password = "PrivacyFixture123!";
type Owner = { id: string; email: string; workspaceId: string; contactId: string };
const owners: Owner[] = [];

test.beforeAll(async () => {
  for (const name of ["Private Alpha Owner", "Private Beta Owner"]) {
    const suffix = randomUUID();
    const user = await prisma.user.create({ data: { name, email: `privacy-${suffix}@example.com`, passwordHash: await bcrypt.hash(password, 4), emailVerifiedAt: new Date() } });
    const workspace = await prisma.workspace.create({ data: { ownerId: user.id, slug: `privacy-${suffix}`, name, members: { create: { userId: user.id } }, profile: { create: { onboardingDone: true } } } });
    const contact = await prisma.contact.create({ data: { workspaceId: workspace.id, displayName: `${name} Contact` } });
    owners.push({ id: user.id, email: user.email, workspaceId: workspace.id, contactId: contact.id });
  }
});
test.afterAll(async () => {
  for (const owner of owners) {
    await prisma.workspace.deleteMany({ where: { id: owner.workspaceId } });
    await prisma.user.deleteMany({ where: { id: owner.id } });
  }
});
test.afterEach(async ({ context }) => {
  await context.clearCookies({ name: /^jitm_(offline|legacy)_fixture$/ });
  await context.setOffline(false);
});
async function useOwner(context: BrowserContext, page: Page, owner: Owner) {
  // Signing in replaces the browser's previous session. Each isolated test
  // therefore gets a fresh fixture session instead of reusing a revoked token.
  const token = randomUUID();
  await prisma.session.create({ data: { userId: owner.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: new URL(page.url() === "about:blank" ? process.env.APP_URL! : page.url()).origin, httpOnly: true, secure: true, sameSite: "Strict" }]);
}
async function controlled(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
  });
}
async function transportOffline(context: BrowserContext) {
  // Firefox/WebKit can leave service-worker fetches online when Playwright marks
  // their pages offline. The isolated proxy also closes the actual transport.
  if (process.env.PRIVACY_UPGRADE_FIXTURE === "1") await context.addCookies([{ name: "jitm_offline_fixture", value: "1", url: process.env.APP_URL!, secure: true }]);
  else await context.setOffline(true);
}
async function auditRecoveryPage(page: Page) {
  const result = await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(result.violations).toEqual([]);
}

test("offline navigation cannot restore the previous owner's private Today page", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium" && process.env.PRIVACY_UPGRADE_FIXTURE !== "1", "Requires real transport failure for service-worker fetches.");
  await useOwner(context, page, owners[0]);
  await page.goto("/jumps?privacy=setup"); await controlled(page);
  // Visit the account URL after installation so this navigation is controlled.
  await page.goto("/jumps?privacy=alpha"); await expect(page.locator(".user-label")).toContainText("Private Alpha Owner");
  await useOwner(context, page, owners[1]);
  await page.goto("/jumps?privacy=beta"); await expect(page.locator(".user-label")).toContainText("Private Beta Owner");
  await transportOffline(context);
  await page.goto("/jumps?privacy=alpha");
  await expect(page.getByRole("heading", { name: "You’re offline" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Private Alpha Owner");
  const cachedUrls = await page.evaluate(async () => (await Promise.all((await caches.keys()).filter(key => key.startsWith("jitm-")).map(async key => (await (await caches.open(key)).keys()).map(request => request.url)))).flat());
  expect(cachedUrls.filter(url => new URL(url).pathname === "/jumps")).toEqual([]);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme }); await page.setViewportSize({ width: 320, height: 800 });
    await auditRecoveryPage(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (colorScheme === "light") { await page.keyboard.press("Tab"); await expect(page.getByRole("link", { name: "Try again" })).toBeFocused(); }
  }
});

async function ready(page: Page) {
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");
}
async function signIn(page: Page, owner: Owner) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(owner.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await Promise.all([page.waitForURL(/\/jumps/), page.getByRole("button", { name: "Sign in", exact: true }).click()]);
  await ready(page);
}
async function remember(page: Page, name: string) {
  return page.evaluate(contactName => {
    const scope = document.querySelector<HTMLElement>("[data-browser-scope]")!.dataset.browserScope!;
    const detail = { scope, jumpId: "sample-return", contactName, channel: "PHONE_CALL", openedAt: Date.now() };
    sessionStorage.setItem(`jitm:private:${scope}:opened-jump`, JSON.stringify(detail));
    window.dispatchEvent(new CustomEvent("jitm:jump-opened", { detail }));
    return scope;
  }, name);
}

test("legacy and other-account recovery never appears in the next account", async ({ page, context }) => {
  await useOwner(context, page, owners[0]); await page.goto("/jumps"); await ready(page);
  const alphaScope = await remember(page, "Alpha confidential contact");
  await expect(page.getByText("How did the follow-up with Alpha confidential contact go?")).toBeVisible();
  await page.evaluate(() => {
    sessionStorage.setItem("jitm:opened-jump", JSON.stringify({ jumpId: "legacy", contactName: "Legacy confidential contact", channel: "SMS", openedAt: Date.now() }));
    sessionStorage.setItem("jitm:contacts:list-state", JSON.stringify({ href: "/contacts?q=SecretAlpha", scrollY: 100, savedAt: Date.now() }));
  });
  await useOwner(context, page, owners[1]); await page.goto("/jumps"); await ready(page);
  await page.evaluate(scope => window.dispatchEvent(new CustomEvent("jitm:jump-opened", { detail: { scope, jumpId: "old", contactName: "Injected old account", channel: "SMS", openedAt: Date.now() } })), alphaScope);
  await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await ready(page);
  await expect(page.locator("body")).not.toContainText("Alpha confidential contact");
  await expect(page.locator("body")).not.toContainText("Legacy confidential contact");
  await expect(page.locator("body")).not.toContainText("Injected old account");
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.includes("opened-jump") || key === "jitm:contacts:list-state"))).toEqual([]);
  await page.goto(`/contacts/${owners[1].contactId}`); await ready(page);
  await page.getByRole("link", { name: "Back to contacts" }).click(); await expect(page).toHaveURL(/\/contacts$/);
});

test("same-account reauthentication keeps a note and recovery while another account clears old tabs", async ({ page, context }) => {
  await useOwner(context, page, owners[0]); await page.goto(`/contacts/${owners[0].contactId}`); await ready(page);
  const note = page.getByRole("textbox", { name: "Add a note", exact: true });
  await note.fill("Unsaved Alpha draft");
  const originalScope = await remember(page, "Alpha return");
  const other = await context.newPage();
  await context.clearCookies();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading", { name: "Sign in to continue" })).toBeVisible();
  await signIn(other, owners[0]);
  await page.bringToFront(); await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await ready(page);
  await expect(note).toHaveValue("Unsaved Alpha draft");
  await expect(note).toBeFocused();
  expect(await page.locator("[data-browser-scope]").getAttribute("data-browser-scope")).toBe(originalScope);
  expect(await page.evaluate(scope => sessionStorage.getItem(`jitm:private:${scope}:opened-jump`), originalScope)).toContain("Alpha return");
  // A sign-in in a second tab must clear the first tab without relying on focus.
  await signIn(other, owners[1]);
  await expect(page.locator(".app-shell")).toHaveCount(0);
  await page.bringToFront();
  await expect(page.getByRole("heading", { name: "Your account changed" })).toBeVisible();
  await expect(page.locator("textarea")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Private Alpha Owner");
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith("jitm:private:")))).toEqual([]);
  await context.setOffline(true);
  await expect(page.getByRole("heading", { name: "Your account changed" })).toBeVisible();
  await context.setOffline(false);
  await page.getByRole("link", { name: "Open current account" }).click(); await ready(page);
  await expect(page.locator(".user-label")).toContainText("Private Beta Owner");
  await other.close();
});

test("confirmed sign-out clears recovery and an open private dialog in another tab", async ({ page, context, isMobile }) => {
  await signIn(page, owners[0]); await remember(page, "Alpha return");
  // Profile lives in the desktop sidebar. Exercise the phone's global dialog
  // with a real private draft instead of targeting a hidden desktop control.
  const dialogName = isMobile ? "Quick Add" : "Profile and settings";
  await page.getByRole("button", { name: isMobile ? "Quick Add" : "Profile", exact: true }).click();
  await expect(page.getByRole("dialog", { name: dialogName, exact: true })).toBeVisible();
  if (isMobile) await page.getByRole("textbox", { name: "What do you want to remember?", exact: true }).fill("Private Alpha capture");
  const other = await context.newPage(); await other.goto("/more"); await ready(other);
  await other.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(other).toHaveURL(/\/signed-out/);
  await expect(page.locator(".app-shell")).toHaveCount(0);
  await page.bringToFront();
  await expect(page.getByRole("heading", { name: "You’re signed out" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: dialogName, exact: true })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Private Alpha capture");
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith("jitm:private:")))).toEqual([]);
  await other.close();
});

test("offline drafts stay in the tab and return after reconnection", async ({ page, context }) => {
  await useOwner(context, page, owners[0]); await page.goto(`/contacts/${owners[0].contactId}`); await ready(page);
  const note = page.getByRole("textbox", { name: "Add a note", exact: true }); await note.fill("Keep during a connection loss");
  await context.setOffline(true);
  await expect(page.getByRole("heading", { name: "Reconnect to continue" })).toBeVisible();
  await expect(note).not.toBeVisible();
  await context.setOffline(false);
  await ready(page); await expect(note).toHaveValue("Keep during a connection loss");
});

test("blocked storage and rejected installation do not break the workspace or return tray", async ({ page, context }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await context.addInitScript(() => {
    for (const name of ["getItem", "setItem", "removeItem"] as const) Storage.prototype[name] = () => { throw new DOMException("Blocked", "SecurityError"); };
    navigator.serviceWorker.register = () => Promise.reject(new Error("Registration unavailable"));
  });
  await useOwner(context, page, owners[0]); await page.goto("/jumps"); await ready(page);
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("jitm:jump-state", { detail: { status: "DONE" } }));
    const scope = document.querySelector<HTMLElement>("[data-browser-scope]")!.dataset.browserScope!;
    window.dispatchEvent(new CustomEvent("jitm:jump-opened", { detail: { scope, jumpId: "blocked-storage", contactName: "Memory-only return", channel: "PHONE_CALL", openedAt: Date.now() } }));
  });
  await expect(page.getByText("How did the follow-up with Memory-only return go?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Install app", exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a public visit upgrades the legacy worker and preserves unrelated caches", async ({ page, context }) => {
  test.skip(process.env.PRIVACY_UPGRADE_FIXTURE !== "1", "Needs isolated HTTPS proxy with the preserved legacy worker.");
  await context.addCookies([{ name: "jitm_legacy_fixture", value: "1", url: process.env.APP_URL!, secure: true }]);
  await page.goto("/login"); await controlled(page);
  await page.evaluate(async () => {
    // Model an existing v1 cache without asking the old worker to load a
    // different generation of authenticated application scripts.
    const legacy = await caches.open("jitm-shell-v1"); await legacy.put("/jumps?privacy=legacy", new Response("Private Alpha Owner"));
    const unrelated = await caches.open("other-application"); await unrelated.put("/unrelated", new Response("Keep this"));
  });
  await context.clearCookies(); await page.goto("/login");
  await expect.poll(() => page.evaluate(() => caches.keys())) .not.toContain("jitm-shell-v1");
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === "activated" && navigator.serviceWorker.controller?.state === "activated")).toBe(true);
  expect(await page.evaluate(() => caches.keys())).toContain("other-application");
  await page.evaluate(async () => { for (const key of await caches.keys()) if (key.startsWith("jitm-")) await caches.delete(key); });
  await transportOffline(context); await page.goto("/never-visited");
  await expect(page.getByRole("heading", { name: "You’re offline" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Private Alpha Owner");
  expect(await page.locator("script,link,img").count()).toBe(0);
});

test.describe("session validation failures", () => {
  test.use({ serviceWorkers: "block" });
  test("an old response cannot revive a tab after an account switch", async ({ page, context }) => {
    await useOwner(context, page, owners[0]); await page.goto(`/contacts/${owners[0].contactId}`); await ready(page);
    const alphaScope = await page.locator("[data-browser-scope]").getAttribute("data-browser-scope");
    let stale: import("@playwright/test").Route | undefined;
    await page.route("**/api/auth/browser-context", route => { if (!stale) stale = route; else return route.continue(); });
    await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await expect.poll(() => Boolean(stale)).toBe(true);
    const other = await context.newPage(); await signIn(other, owners[1]);
    await expect(page.locator(".app-shell")).toHaveCount(0);
    await page.bringToFront();
    await expect(page.getByRole("heading", { name: "Your account changed" })).toBeVisible();
    await stale!.fulfill({ json: { scope: alphaScope } });
    await expect(page.getByRole("heading", { name: "Your account changed" })).toBeVisible();
    await expect(page.locator(".app-shell")).toHaveCount(0);
    await other.close();
  });

  test("offline and expired-session recovery stay accessible at narrow widths in both themes", async ({ page, context }) => {
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await useOwner(context, page, owners[0]); await page.goto(`/contacts/${owners[0].contactId}`); await ready(page);
    for (const scope of ["unavailable", null]) {
      await page.route("**/api/auth/browser-context", route => scope === null ? route.fulfill({ json: { scope: null } }) : route.fulfill({ status: 503 }));
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(page.getByRole("heading", { name: scope === null ? "Sign in to continue" : "Reconnect to continue" })).toBeVisible();
      for (const colorScheme of ["light", "dark"] as const) for (const width of [320, 1440]) {
        await page.emulateMedia({ colorScheme }); await page.setViewportSize({ width, height: 850 });
        await auditRecoveryPage(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        const button = page.getByRole("button", { name: "Check again", exact: true }); const box = await button.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(43.9);
        await button.focus(); await expect(button).toBeFocused(); await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toBeVisible();
      }
      await page.unroute("**/api/auth/browser-context");
    }
    expect(errors).toEqual([]);
  });
});
