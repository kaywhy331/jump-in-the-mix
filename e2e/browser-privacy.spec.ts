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
async function expectAccountOwner(page: Page, ownerName: string) {
  const viewport = page.viewportSize();
  const account = page.locator(".sidebar-account-trigger");
  // Phones reach My account through More; expose the sidebar only for this identity check.
  const resize = viewport !== null && !await account.isVisible();
  try {
    if (resize) await page.setViewportSize({ ...viewport, width: 1440 });
    await expect(account).toBeVisible();
    await expect(account).toHaveAccessibleName(ownerName);
  } finally {
    if (resize) await page.setViewportSize(viewport);
  }
}

test("offline navigation cannot restore the previous owner's private Today page", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium" && process.env.PRIVACY_UPGRADE_FIXTURE !== "1", "Requires real transport failure for service-worker fetches.");
  await useOwner(context, page, owners[0]);
  await page.goto("/jumps?privacy=setup"); await controlled(page);
  // Visit the account URL after installation so this navigation is controlled.
  await page.goto("/jumps?privacy=alpha"); await expectAccountOwner(page, "Private Alpha Owner");
  await useOwner(context, page, owners[1]);
  await page.goto("/jumps?privacy=beta"); await expectAccountOwner(page, "Private Beta Owner");
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
  // A signed-in visit to /login opens the app; ?reauth shows the form so a second account can sign in here.
  await page.goto("/login?reauth=1");
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

// The note composer stays folded away until the profile's Note action ("Contact <name>" actions) opens it.
async function openNote(page: Page) {
  await page.getByRole("navigation", { name: /^Contact / }).getByRole("link", { name: "Note", exact: true }).click();
  return page.getByRole("textbox", { name: "Add a note", exact: true });
}

test("same-account reauthentication keeps a note and recovery while another account clears old tabs", async ({ page, context }) => {
  await useOwner(context, page, owners[0]); await page.goto(`/contacts/${owners[0].contactId}`); await ready(page);
  const note = await openNote(page);
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
  await expectAccountOwner(page, "Private Beta Owner");
  await other.close();
});

test("confirmed sign-out clears recovery and an open private dialog in another tab", async ({ page, context, isMobile }) => {
  await signIn(page, owners[0]); await remember(page, "Alpha return");
  // Profile lives in the desktop sidebar. Exercise the phone's global dialog
  // with a real private draft instead of targeting a hidden desktop control.
  const dialogName = isMobile ? "Quick Add" : "Account";
  await page.getByRole("button", { name: isMobile ? "Quick Add" : "Private Alpha Owner", exact: true }).click();
  await expect(page.getByRole("dialog", { name: dialogName, exact: true })).toBeVisible();
  if (!isMobile) {
    const account = page.getByRole("dialog", { name: dialogName, exact: true });
    await expect(account.getByRole("link", { name: "My account", exact: true })).toBeVisible();
    await expect(account.getByRole("link", { name: "Plan and billing", exact: true })).toBeVisible();
    await expect(account.getByText("Appearance", { exact: true })).toBeVisible();
    await expect(account.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  }
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

test("a sign-out signalled while a tab is offline discards its draft after the same account signs in again", async ({ page, context }) => {
  await signIn(page, owners[0]); await page.goto(`/contacts/${owners[0].contactId}`); await ready(page);
  const note = await openNote(page); await note.fill("Private Alpha offline draft");
  await remember(page, "Alpha return");
  const other = await context.newPage(); await other.goto("/more"); await ready(other);
  // context.setOffline would also take the signing-out tab offline, so apply the same network emulation to this tab only.
  const network = await context.newCDPSession(page);
  const setOffline = (offline: boolean) => network.send("Network.emulateNetworkConditions", { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await setOffline(true);
  await expect(page.getByRole("heading", { name: "Reconnect to continue" })).toBeVisible();
  await other.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(other).toHaveURL(/\/signed-out/);
  await signIn(other, owners[0]);
  await setOffline(false);
  await page.bringToFront();
  await expect(page.getByRole("heading", { name: "You’re signed out" })).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveCount(0);
  await expect(page.locator("textarea")).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith("jitm:private:")))).toEqual([]);
  // The account is signed in again, so Sign in opens it without the discarded draft.
  await page.getByRole("link", { name: "Sign in", exact: true }).click(); await ready(page);
  await expectAccountOwner(page, "Private Alpha Owner");
  await page.goto(`/contacts/${owners[0].contactId}`); await ready(page);
  await expect(await openNote(page)).toHaveValue("");
  await other.close();
});

test("offline drafts stay in the tab and return after reconnection", async ({ page, context }) => {
  await useOwner(context, page, owners[0]); await page.goto(`/contacts/${owners[0].contactId}`); await ready(page);
  const note = await openNote(page); await note.fill("Keep during a connection loss");
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
    // The account boundary can be ready before the page content (which owns the return tray) has hydrated.
    // Record when the tray subscribes, so the synthetic opening below is sent to a listener that exists.
    const subscribe = window.addEventListener.bind(window);
    window.addEventListener = ((type: string, ...rest: unknown[]) => {
      if (type === "jitm:jump-opened") (window as unknown as { __returnTrayListening?: boolean }).__returnTrayListening = true;
      return (subscribe as (...args: unknown[]) => void)(type, ...rest);
    }) as typeof window.addEventListener;
  });
  await useOwner(context, page, owners[0]); await page.goto("/jumps"); await ready(page);
  await page.waitForFunction(() => (window as unknown as { __returnTrayListening?: boolean }).__returnTrayListening === true);
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

// JITM-UXS-16: the sign-in shield. A save confirms the account first, so an expired session never costs the draft; the
// shield keeps the focus on its heading; and a fresh load checks the account once.
test.describe("sign-in shield", () => {
  test.use({ serviceWorkers: "block" });
  const ACCOUNT = "**/api/auth/browser-context";
  const isAccountCheck = (url: string) => new URL(url).pathname === "/api/auth/browser-context";
  // Account checks and Server Action posts, counted from the page's own requests.
  function requestLog(page: Page) {
    const log = { checks: 0, actions: 0, cancelled: [] as string[] };
    page.on("request", request => {
      if (isAccountCheck(request.url())) log.checks++;
      else if (request.method() === "POST" && request.headers()["next-action"]) log.actions++;
    });
    page.on("requestfailed", request => { if (isAccountCheck(request.url())) log.cancelled.push(request.failure()?.errorText ?? "failed"); });
    return log;
  }
  // Long enough for a late duplicate check (UXD-04 saw the second one 70-200 ms after the first).
  const settled = (page: Page) => page.evaluate(() => new Promise(resolve => setTimeout(resolve, 500)));
  const revoke = (owner: Owner) => prisma.session.deleteMany({ where: { userId: owner.id } });
  const shield = (page: Page) => page.locator(".browser-account-gate");
  const shieldHeading = (page: Page) => shield(page).getByRole("heading", { level: 1 });
  const focusInShield = (page: Page) => page.evaluate(() => document.activeElement !== document.body && Boolean(document.activeElement?.closest(".browser-account-gate")));
  async function expectTabStaysInShield(page: Page) {
    for (const key of ["Tab", "Tab", "Tab", "Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab"]) {
      await page.keyboard.press(key);
      expect(await focusInShield(page), key).toBe(true);
    }
  }
  const refocus = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event("focus")));
  async function returnAfterSignIn(page: Page, context: BrowserContext, owner: Owner) {
    const other = await context.newPage(); await signIn(other, owner); await other.close();
    await page.bringToFront(); await refocus(page); await ready(page);
  }

  test("a fresh load checks the account once and cancels nothing", async ({ page, context }) => {
    await useOwner(context, page, owners[0]);
    const log = requestLog(page);
    for (const path of ["/jumps", `/contacts/${owners[0].contactId}`, "/contacts/new", "/calendar?new=1"]) {
      log.checks = 0;
      await page.goto(path); await ready(page); await settled(page);
      expect(log.checks, path).toBe(1);
    }
    log.checks = 0;
    await page.reload(); await ready(page); await settled(page);
    expect(log.checks, "reload").toBe(1);
    expect(log.cancelled).toEqual([]);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`Save on Add contact after the session ends keeps every entry and saves after signing in again (${colorScheme})`, async ({ page, context }) => {
      await page.emulateMedia({ colorScheme });
      const log = requestLog(page);
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 850 });
        await useOwner(context, page, owners[0]);
        await page.goto("/contacts/new"); await ready(page);
        const firstName = `Shield ${colorScheme} ${width} ${randomUUID().slice(0, 8)}`;
        const first = page.getByLabel("First name", { exact: true }), last = page.locator("#lastName");
        await first.fill(firstName); await last.fill("Kept draft");
        await revoke(owners[0]);
        log.checks = 0; log.actions = 0;
        // The owner presses Enter in the field they are in. The one account check shows as the form's saving state.
        let held: import("@playwright/test").Route | undefined;
        await page.route(ACCOUNT, route => { held = route; });
        await last.press("Enter");
        await expect.poll(() => Boolean(held)).toBe(true);
        await expect(page.locator(".form-guard-status")).toHaveText("Saving…");
        await expect(shield(page)).not.toBeVisible();
        await held!.continue(); await page.unroute(ACCOUNT);
        await expect(shieldHeading(page)).toHaveText("Sign in to continue");
        await expect(shieldHeading(page)).toBeFocused();
        await settled(page);
        expect(log.checks).toBe(1); expect(log.actions).toBe(0);
        await expect(first).toHaveValue(firstName); await expect(last).toHaveValue("Kept draft");
        expect(await prisma.contact.count({ where: { workspaceId: owners[0].workspaceId, firstName } })).toBe(0);
        await returnAfterSignIn(page, context, owners[0]);
        await expect(last).toBeFocused();
        await expect(first).toHaveValue(firstName); await expect(last).toHaveValue("Kept draft");
        await Promise.all([page.waitForURL(/\/contacts\/[^/?]+\?created=1/), page.getByRole("button", { name: "Save contact", exact: true }).click()]);
        expect(log.actions).toBe(1);
        expect(await prisma.contact.count({ where: { workspaceId: owners[0].workspaceId, firstName } })).toBe(1);
      }
    });

    test(`Save on the Calendar event form after the session ends keeps every entry and saves after signing in again (${colorScheme})`, async ({ page, context }) => {
      await page.emulateMedia({ colorScheme });
      const log = requestLog(page);
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 850 });
        await useOwner(context, page, owners[0]);
        // Each width saves its own event at the form's default time, so clear the last one to avoid an overlap warning.
        await prisma.calendarEntry.deleteMany({ where: { workspaceId: owners[0].workspaceId } });
        await page.goto("/calendar?new=1"); await ready(page);
        const form = page.locator("form.calendar-entry-form");
        const title = form.getByLabel("Title", { exact: true }), kind = form.getByLabel("Event type");
        const eventTitle = `Shield ${colorScheme} ${width} ${randomUUID().slice(0, 8)}`;
        await kind.selectOption("BLOCK"); await title.fill(eventTitle);
        await revoke(owners[0]);
        log.checks = 0; log.actions = 0;
        await title.press("Enter");
        await expect(shieldHeading(page)).toHaveText("Sign in to continue");
        await expect(shieldHeading(page)).toBeFocused();
        await settled(page);
        expect(log.checks).toBe(1); expect(log.actions).toBe(0);
        await expect(title).toHaveValue(eventTitle); await expect(kind).toHaveValue("BLOCK");
        await returnAfterSignIn(page, context, owners[0]);
        await expect(title).toBeFocused();
        await expect(title).toHaveValue(eventTitle); await expect(kind).toHaveValue("BLOCK");
        await Promise.all([page.waitForURL(/[?&]saved=1/), form.getByRole("button", { name: "Save event", exact: true }).click()]);
        expect(log.actions).toBe(1);
        expect(await prisma.calendarEntry.count({ where: { workspaceId: owners[0].workspaceId, title: eventTitle } })).toBe(1);
      }
    });
  }

  test("the shield keeps the focus inside on its heading, and the tab title follows the heading", async ({ page, context }) => {
    await useOwner(context, page, owners[0]); await page.goto(`/contacts/${owners[0].contactId}`); await ready(page);
    const scope = await page.locator("[data-browser-scope]").getAttribute("data-browser-scope");
    const pageTitle = await page.title();
    let answer: { scope: string | null } = { scope: null }, hold = false, held: import("@playwright/test").Route | undefined;
    await page.route(ACCOUNT, route => { if (hold) held = route; else return route.fulfill({ json: answer }); });
    await refocus(page);
    await expect(shieldHeading(page)).toHaveText("Sign in to continue");
    await expect(shieldHeading(page)).toBeFocused();
    await expect(page).toHaveTitle(pageTitle.replace(/^.*(?= \| )/, "Sign in to continue"));
    await expectTabStaysInShield(page);
    // Check again while still expired: the actions stay mounted during the check, then the heading takes the focus.
    hold = true;
    const again = shield(page).getByRole("button", { name: "Check again", exact: true });
    await again.click();
    await expect.poll(() => Boolean(held)).toBe(true);
    await expect(again).toBeFocused();
    await expect(shield(page).getByRole("status")).toHaveText("Checking your account…");
    await expect(shield(page).getByRole("link", { name: "Sign in (opens a new tab)", exact: true })).toBeVisible();
    hold = false; await held!.fulfill({ json: answer }); held = undefined;
    await expect(shieldHeading(page)).toBeFocused();
    await expect(shield(page).getByRole("status")).toHaveText("Sign in to the same account in another tab, then return here to keep your draft.");
    await expectTabStaysInShield(page);
    // The window regains focus while the shield is open, with the focus on its sign-in link.
    await shield(page).getByRole("link", { name: "Sign in (opens a new tab)", exact: true }).focus();
    await refocus(page);
    await expect(shieldHeading(page)).toBeFocused();
    await expectTabStaysInShield(page);
    // A confirmed account closes the shield and gives the page its own title back.
    answer = { scope }; await again.click(); await ready(page);
    await expect(page).toHaveTitle(pageTitle);
    // Another account signs in: the changed state focuses its heading and keeps the focus inside.
    answer = { scope: "a-different-account" }; await refocus(page);
    await expect(shieldHeading(page)).toHaveText("Your account changed");
    await expect(shieldHeading(page)).toBeFocused();
    await expect(shield(page).getByRole("status")).toHaveText("A different account is signed in on this browser, so anything not yet saved in this tab was removed.");
    await expect(page).toHaveTitle(pageTitle.replace(/^.*(?= \| )/, "Your account changed"));
    await expectTabStaysInShield(page);
  });

  test("a sign-out in another tab focuses the signed-out heading and keeps the focus inside", async ({ page, context }) => {
    await useOwner(context, page, owners[0]); await page.goto(`/contacts/${owners[0].contactId}`); await ready(page);
    await page.route(ACCOUNT, route => route.fulfill({ json: { scope: null } }));
    await page.evaluate(() => { const channel = new BroadcastChannel("jitm:browser-change"); channel.postMessage({ signedOut: true }); channel.close(); });
    await expect(shieldHeading(page)).toHaveText("You’re signed out");
    await expect(shieldHeading(page)).toBeFocused();
    await expect(shield(page).getByRole("status")).toHaveText("You signed out in another tab, so anything not yet saved in this tab was removed.");
    await expect(page).toHaveTitle("You’re signed out | Jump in the Mix");
    await expectTabStaysInShield(page);
  });

  test("the installed app's own sign-in link leaves an unsaved form without a second warning", async ({ page, context }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, "standalone", { configurable: true, value: true }));
    const dialogs: string[] = [];
    page.on("dialog", dialog => { dialogs.push(`${dialog.type()}: ${dialog.message()}`); void dialog.dismiss(); });
    await useOwner(context, page, owners[0]); await page.goto("/contacts/new"); await ready(page);
    await page.getByLabel("First name", { exact: true }).fill("Unsaved in the installed app");
    await expect(page.locator(".form-guard-status")).toHaveText("Unsaved changes. Save before leaving this page.");
    await page.route(ACCOUNT, route => route.fulfill({ json: { scope: null } }));
    await refocus(page);
    await expect(shield(page).getByRole("status")).toHaveText("Sign in again to continue on this screen. Changes that haven’t been saved yet may be lost.");
    await Promise.all([page.waitForRequest(request => request.isNavigationRequest() && /\/login\?next=%2Fcontacts%2Fnew$/.test(request.url())), shield(page).getByRole("link", { name: "Sign in", exact: true }).click()]);
    await page.waitForLoadState();
    expect(dialogs).toEqual([]);
  });

  test("pagehide and a back-forward restore still mask the tab without opening the shield early", async ({ page, context }) => {
    await useOwner(context, page, owners[0]); await page.goto(`/contacts/${owners[0].contactId}`); await ready(page);
    const content = page.locator("[data-browser-scope]");
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
    await expect(content).toHaveAttribute("inert", ""); await expect(content).toHaveCSS("visibility", "hidden");
    await expect(page.locator("html")).toHaveAttribute("data-browser-locked", "true");
    await expect(shield(page)).not.toBeVisible();
    let held: import("@playwright/test").Route | undefined;
    await page.route(ACCOUNT, route => { held = route; });
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await expect.poll(() => Boolean(held)).toBe(true);
    await expect(shieldHeading(page)).toHaveText("Checking your account…");
    await expect(content).toHaveAttribute("inert", "");
    await held!.continue(); await ready(page);
    await expect(shield(page)).not.toBeVisible();
  });

  test("a tab hidden at load stays masked until it is shown", async ({ page, context }) => {
    await page.addInitScript(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    });
    await useOwner(context, page, owners[0]);
    const answered = page.waitForResponse(response => isAccountCheck(response.url()));
    await page.goto(`/contacts/${owners[0].contactId}`); await answered; await settled(page);
    const content = page.locator("[data-browser-scope]");
    await expect(content).toHaveAttribute("inert", ""); await expect(content).toHaveCSS("visibility", "hidden");
    await expect(shield(page)).not.toBeVisible();
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: false });
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await ready(page);
    await expect(shield(page)).not.toBeVisible();
  });

  // JITM-UXS-16-R1: once the account is confirmed, a held save is sent exactly as it was pressed: the same action, the
  // same button name and value and the same entries, whether or not its button is still on the page. A save that truly
  // can't be sent says so, and every entry stays.
  const NOT_SENT = "Not saved yet. Your entries are still here; save again.";
  // The fields each Server Action post carries, as name=value (React prefixes each name with its argument's id, as _1_).
  function sentFields(page: Page) {
    const sent: string[][] = [];
    page.on("request", request => {
      if (request.method() !== "POST" || !request.headers()["next-action"]) return;
      sent.push([...(request.postData() ?? "").matchAll(/name="(?:_?\d+_)?([^"]+)"\r\n\r\n([^\r]*)\r\n/g)].map(([, name, value]) => `${name}=${value}`));
    });
    return sent;
  }
  // Add contact with a draft. Its next account check is held until the test answers it.
  async function heldDraft(page: Page, context: BrowserContext) {
    await useOwner(context, page, owners[0]);
    await page.goto("/contacts/new"); await ready(page);
    const firstName = `Held ${randomUUID().slice(0, 8)}`;
    await page.getByLabel("First name", { exact: true }).fill(firstName);
    await page.locator("#lastName").fill("As pressed");
    const form = page.locator("form", { has: page.getByRole("button", { name: "Save contact", exact: true }) });
    const log = requestLog(page), sent = sentFields(page);
    let held: import("@playwright/test").Route | undefined;
    await page.route(ACCOUNT, route => { held = route; });
    const waitHeld = () => expect.poll(() => Boolean(held)).toBe(true);
    const answer = async () => { await waitHeld(); await held!.continue(); await page.unroute(ACCOUNT); };
    return { firstName, form, status: form.locator(".form-guard-status"), log, sent, waitHeld, answer };
  }
  const savedContacts = (firstName: string) => prisma.contact.findMany({ where: { workspaceId: owners[0].workspaceId, firstName }, select: { lastName: true } });
  const created = /\/contacts\/[^/?]+\?created=1/;
  async function reviewMixStart(page: Page, context: BrowserContext) {
    await useOwner(context, page, owners[0]);
    const name = `Held start ${randomUUID().slice(0, 8)}`;
    await page.goto("/mixes/new?custom=1"); await ready(page);
    await page.getByLabel("Mix name").fill(name);
    await page.getByLabel("When should it start?").selectOption("MANUAL_START");
    await page.getByLabel("After saving").selectOption("ACTIVE");
    await page.getByRole("group", { name: "Beat 1" }).getByLabel("Message").fill("Hi {{First Name}}, checking in.");
    await page.getByRole("button", { name: "Review and start", exact: true }).click();
    const review = page.getByRole("dialog", { name: "Start this Mix?" });
    await expect(review).toBeVisible();
    return { name, review, start: review.getByRole("button", { name: "Start the Mix", exact: true }) };
  }

  test("a held Save is sent once from its own button, also when it is pressed again during the account check", async ({ page, context }) => {
    const draft = await heldDraft(page, context);
    const save = page.getByRole("button", { name: "Save contact", exact: true });
    await save.click(); await draft.waitHeld();
    await expect(draft.status).toHaveText("Saving…");
    await save.click(); await settled(page);
    expect(draft.log.checks).toBe(1);
    await Promise.all([page.waitForURL(created), draft.answer()]);
    expect(draft.log.actions).toBe(1);
    expect(draft.sent[0]).toEqual(expect.arrayContaining([`firstName=${draft.firstName}`, "lastName=As pressed"]));
    expect(await savedContacts(draft.firstName)).toEqual([{ lastName: "As pressed" }]);
  });

  test("a held Save whose button leaves the page meanwhile is still sent once, with that button's name and value", async ({ page, context }) => {
    const draft = await heldDraft(page, context);
    // A Save button with a name and value, taken off the page while the account is checked, as a dialog that closes does.
    await draft.form.evaluate(form => form.insertAdjacentHTML("beforeend", '<button type="submit" id="held-save" name="heldSave" value="pressed">Save as pressed</button>'));
    await page.locator("#held-save").click(); await draft.waitHeld();
    await page.locator("#held-save").evaluate(button => button.remove());
    expect(draft.log.checks).toBe(1);
    await Promise.all([page.waitForURL(created), draft.answer()]);
    expect(draft.log.actions).toBe(1);
    expect(draft.sent[0]).toEqual(expect.arrayContaining(["heldSave=pressed", `firstName=${draft.firstName}`, "lastName=As pressed"]));
    expect(await savedContacts(draft.firstName)).toEqual([{ lastName: "As pressed" }]);
  });

  test("a held Save from a button outside the form, tied to it by its form attribute, is sent as pressed", async ({ page, context }) => {
    const draft = await heldDraft(page, context);
    await draft.form.evaluate(form => {
      form.id ||= "held-form";
      document.body.insertAdjacentHTML("beforeend", `<button type="submit" form="${form.id}" id="held-save" name="heldSave" value="outside" style="position:fixed;top:0;left:0;z-index:2147483647">Save from outside</button>`);
    });
    await page.locator("#held-save").click(); await draft.waitHeld();
    expect(draft.log.checks).toBe(1);
    await Promise.all([page.waitForURL(created), draft.answer()]);
    expect(draft.log.actions).toBe(1);
    expect(draft.sent[0]).toEqual(expect.arrayContaining(["heldSave=outside", `firstName=${draft.firstName}`, "lastName=As pressed"]));
    expect(await savedContacts(draft.firstName)).toEqual([{ lastName: "As pressed" }]);
  });

  // A button with its own address sends there, into a frame so the draft page stays.
  const OWN_ACTION = '<iframe name="held-frame" hidden></iframe><button type="submit" id="held-save" name="heldSave" value="own" formaction="/api/held-own-action" formmethod="get" formtarget="held-frame" formnovalidate>Send elsewhere</button>';
  test("a held Save from a button with its own formaction is sent to that address with its name and value", async ({ page, context }) => {
    const draft = await heldDraft(page, context);
    await draft.form.evaluate((form, html) => form.insertAdjacentHTML("beforeend", html), OWN_ACTION);
    await page.locator("#held-save").click(); await draft.waitHeld();
    const own = page.waitForRequest(request => new URL(request.url()).pathname === "/api/held-own-action");
    await draft.answer();
    const sent = new URL((await own).url()).searchParams;
    expect([sent.get("heldSave"), sent.get("firstName"), sent.get("lastName")]).toEqual(["own", draft.firstName, "As pressed"]);
    expect(draft.log.checks).toBe(1); expect(draft.log.actions).toBe(0);
  });

  test("a held Save whose own-action button has left the page says it wasn't saved and keeps every entry", async ({ page, context }) => {
    const draft = await heldDraft(page, context);
    const own: string[] = [];
    page.on("request", request => { if (new URL(request.url()).pathname === "/api/held-own-action") own.push(request.url()); });
    await draft.form.evaluate((form, html) => form.insertAdjacentHTML("beforeend", html), OWN_ACTION);
    await page.locator("#held-save").click(); await draft.waitHeld();
    await page.locator("#held-save").evaluate(button => button.remove());
    await draft.answer();
    await expect(draft.status).toHaveText(NOT_SENT);
    await settled(page);
    expect(own).toEqual([]); expect(draft.log.checks).toBe(1); expect(draft.log.actions).toBe(0);
    await expect(page.getByLabel("First name", { exact: true })).toHaveValue(draft.firstName);
    await expect(page.locator("#lastName")).toHaveValue("As pressed");
    expect(await savedContacts(draft.firstName)).toEqual([]);
  });

  test("a held requestSubmit() with no button sends the entries as they were when it was asked for", async ({ page, context }) => {
    const draft = await heldDraft(page, context);
    await draft.form.evaluate(form => (form as HTMLFormElement).requestSubmit());
    await draft.waitHeld();
    // The page changes an entry while the account is checked; the save still carries the one it was asked for with.
    await page.locator("#lastName").evaluate(field => { (field as HTMLInputElement).value = "Changed meanwhile"; });
    expect(draft.log.checks).toBe(1);
    await Promise.all([page.waitForURL(created), draft.answer()]);
    expect(draft.log.actions).toBe(1);
    expect(draft.sent[0]).toEqual(expect.arrayContaining([`firstName=${draft.firstName}`, "lastName=As pressed"]));
    expect(await savedContacts(draft.firstName)).toEqual([{ lastName: "As pressed" }]);
  });

  test("Start the Mix from its review is sent with the review's confirmation, though the editor re-renders during the check", async ({ page, context }) => {
    const mix = await reviewMixStart(page, context);
    const log = requestLog(page), sent = sentFields(page);
    let held: import("@playwright/test").Route | undefined;
    await page.route(ACCOUNT, route => { held = route; });
    await mix.start.click();
    await expect.poll(() => Boolean(held)).toBe(true);
    // The review has closed: the editor re-rendered while the save waited for the account check.
    await expect(mix.review).not.toBeVisible();
    expect(log.checks).toBe(1);
    await Promise.all([page.waitForURL(/created=manual/), held!.continue()]);
    await page.unroute(ACCOUNT);
    expect(log.actions).toBe(1);
    expect(sent[0]).toEqual(expect.arrayContaining(["activationConfirmed=1", `name=${mix.name}`]));
    expect((await prisma.mix.findFirstOrThrow({ where: { workspaceId: owners[0].workspaceId, name: mix.name } })).status).toBe("ACTIVE");
  });

  test("Start the Mix from its review after the session ends sends nothing, keeps the Mix and starts it after signing in again", async ({ page, context }) => {
    const mix = await reviewMixStart(page, context);
    await revoke(owners[0]);
    const log = requestLog(page);
    await mix.start.click();
    await expect(shieldHeading(page)).toHaveText("Sign in to continue");
    await settled(page);
    expect(log.checks).toBe(1); expect(log.actions).toBe(0);
    expect(await prisma.mix.count({ where: { workspaceId: owners[0].workspaceId, name: mix.name } })).toBe(0);
    await returnAfterSignIn(page, context, owners[0]);
    await expect(page.getByLabel("Mix name")).toHaveValue(mix.name);
    await page.getByRole("button", { name: "Review and start", exact: true }).click();
    await Promise.all([page.waitForURL(/created=manual/), mix.start.click()]);
    expect(log.actions).toBe(1);
    expect((await prisma.mix.findFirstOrThrow({ where: { workspaceId: owners[0].workspaceId, name: mix.name } })).status).toBe("ACTIVE");
  });

  // JITM-UXS-16-R2: every way a held save can end without being sent leaves the owner told on the form's status line,
  // with every entry kept; a shield, while one shows, says why. A save cancelled because the tab went to the background
  // is never sent by itself: the owner presses Save again, and that save is checked once and sent once.
  // Account checks and Server Action posts, with the checks counted so far at each post.
  function saveLog(page: Page) {
    const log = { checks: 0, actions: 0, checksAtActions: [] as number[] };
    page.on("request", request => {
      if (isAccountCheck(request.url())) log.checks++;
      else if (request.method() === "POST" && request.headers()["next-action"]) { log.actions++; log.checksAtActions.push(log.checks); }
    });
    return log;
  }
  // The next account check waits until the test answers it.
  async function holdCheck(page: Page) {
    let held: import("@playwright/test").Route | undefined;
    await page.route(ACCOUNT, route => { held = route; });
    return { asked: () => expect.poll(() => Boolean(held)).toBe(true) };
  }
  // The tab goes to the background or comes back, as the browser reports it. `announce: false` changes it before the
  // browser has said so.
  const setHidden = (page: Page, hidden: boolean, announce = true) => page.evaluate(({ hidden, announce }) => {
    Object.defineProperty(document, "hidden", { configurable: true, value: hidden });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: hidden ? "hidden" : "visible" });
    if (announce) document.dispatchEvent(new Event("visibilitychange"));
  }, { hidden, announce });
  // While a save's account check is held, the tab goes to the background, which cancels the check, and comes back,
  // which checks the account once more, no longer held.
  async function backgroundAndBack(page: Page) {
    await setHidden(page, true);
    await page.unroute(ACCOUNT);
    await setHidden(page, false);
    await ready(page); await settled(page);
    await expect(shield(page)).not.toBeVisible();
  }
  const transition = (page: Page, type: "pagehide" | "pageshow") => page.evaluate(type => window.dispatchEvent(new PageTransitionEvent(type, { persisted: true })), type);
  async function profileForm(page: Page, context: BrowserContext) {
    await useOwner(context, page, owners[0]);
    await page.goto("/account/preferences"); await ready(page);
    const save = page.getByRole("button", { name: "Save profile", exact: true });
    const form = page.locator("form", { has: save });
    return { save, name: form.getByLabel("Display name", { exact: true }), status: form.locator(".form-guard-status") };
  }
  const savedName = async () => (await prisma.user.findUniqueOrThrow({ where: { id: owners[0].id }, select: { name: true } })).name;
  const profileSaved = /\/account\/preferences\?(?:.*&)?personalSaved=1/;
  const contactSave = (page: Page) => page.getByRole("button", { name: "Save contact", exact: true });
  type HeldDraft = Awaited<ReturnType<typeof heldDraft>>;
  async function expectDraftKept(page: Page, draft: HeldDraft) {
    await expect(draft.status).toHaveText(NOT_SENT);
    await expect(page.getByLabel("First name", { exact: true })).toHaveValue(draft.firstName);
    await expect(page.locator("#lastName")).toHaveValue("As pressed");
    expect(await savedContacts(draft.firstName)).toEqual([]);
  }
  // Save again: one account check right before it, one Server Action post, the entries as they stand.
  async function saveDraftAgain(page: Page, draft: HeldDraft, log: ReturnType<typeof saveLog>) {
    const checks = log.checks;
    await Promise.all([page.waitForURL(created), contactSave(page).click()]);
    expect(log.actions).toBe(1); expect(log.checksAtActions).toEqual([checks + 1]);
    expect(draft.sent).toHaveLength(1);
    expect(draft.sent[0]).toEqual(expect.arrayContaining([`firstName=${draft.firstName}`, "lastName=As pressed"]));
    expect(await savedContacts(draft.firstName)).toEqual([{ lastName: "As pressed" }]);
  }

  test("Save profile with unchanged values, held while the tab goes to the background, says it wasn't saved on return and saves once when pressed again", async ({ page, context }) => {
    const profile = await profileForm(page, context);
    const unchanged = await profile.name.inputValue();
    await expect(profile.status).toHaveText("");
    const log = saveLog(page), check = await holdCheck(page);
    await profile.save.click(); await check.asked();
    await expect(profile.status).toHaveText("Saving…");
    expect(log.checks).toBe(1);
    await backgroundAndBack(page);
    expect(log.checks).toBe(2); expect(log.actions).toBe(0);
    await expect(profile.status).toHaveText(NOT_SENT);
    await expect(profile.name).toHaveValue(unchanged);
    await Promise.all([page.waitForURL(profileSaved), profile.save.click()]);
    expect(log.actions).toBe(1); expect(log.checksAtActions).toEqual([3]);
  });

  test("a changed Profile value, held while the tab goes to the background, stays as typed, says it wasn't saved and is saved when pressed again", async ({ page, context }) => {
    const before = await savedName();
    try {
      const profile = await profileForm(page, context);
      const typed = `${before} ${randomUUID().slice(0, 8)}`;
      await profile.name.fill(typed);
      const log = saveLog(page), check = await holdCheck(page);
      await profile.save.click(); await check.asked();
      await expect(profile.status).toHaveText("Saving…");
      await backgroundAndBack(page);
      expect(log.checks).toBe(2); expect(log.actions).toBe(0);
      await expect(profile.status).toHaveText(NOT_SENT);
      await expect(profile.name).toHaveValue(typed);
      expect(await savedName()).toBe(before);
      await Promise.all([page.waitForURL(profileSaved), profile.save.click()]);
      expect(log.actions).toBe(1); expect(log.checksAtActions).toEqual([3]);
      expect(await savedName()).toBe(typed);
    } finally {
      await prisma.user.update({ where: { id: owners[0].id }, data: { name: before } });
    }
  });

  test("Save on Add contact, held while the tab goes to the background, keeps every entry, says it wasn't saved and saves once when pressed again", async ({ page, context }) => {
    const draft = await heldDraft(page, context);
    const log = saveLog(page);
    await contactSave(page).click(); await draft.waitHeld();
    await expect(draft.status).toHaveText("Saving…");
    await backgroundAndBack(page);
    expect(log.checks).toBe(2); expect(log.actions).toBe(0);
    await expectDraftKept(page, draft);
    await saveDraftAgain(page, draft, log);
  });

  test("Start the Mix from its review, held while the tab goes to the background, says it wasn't saved and starts once when started again", async ({ page, context }) => {
    const mix = await reviewMixStart(page, context);
    const status = page.locator("form", { has: page.getByLabel("Mix name") }).locator(".form-guard-status");
    const log = saveLog(page), check = await holdCheck(page);
    await mix.start.click(); await check.asked();
    await expect(mix.review).not.toBeVisible();
    await expect(status).toHaveText("Saving…");
    await backgroundAndBack(page);
    expect(log.checks).toBe(2); expect(log.actions).toBe(0);
    await expect(status).toHaveText(NOT_SENT);
    await expect(page.getByLabel("Mix name")).toHaveValue(mix.name);
    expect(await prisma.mix.count({ where: { workspaceId: owners[0].workspaceId, name: mix.name } })).toBe(0);
    // Review and start is a save too, which the editor turns into its review: it and Start the Mix are checked once each.
    await page.getByRole("button", { name: "Review and start", exact: true }).click();
    await Promise.all([page.waitForURL(/created=manual/), mix.start.click()]);
    expect(log.actions).toBe(1); expect(log.checksAtActions).toEqual([4]);
    expect((await prisma.mix.findFirstOrThrow({ where: { workspaceId: owners[0].workspaceId, name: mix.name } })).status).toBe("ACTIVE");
  });

  test("a held Save when the page is put away and restored says it wasn't saved and keeps every entry", async ({ page, context }) => {
    const draft = await heldDraft(page, context);
    const log = saveLog(page);
    await contactSave(page).click(); await draft.waitHeld();
    await transition(page, "pagehide");
    await page.unroute(ACCOUNT);
    await transition(page, "pageshow");
    await ready(page); await settled(page);
    await expect(shield(page)).not.toBeVisible();
    expect(log.checks).toBe(2); expect(log.actions).toBe(0);
    await expectDraftKept(page, draft);
    await saveDraftAgain(page, draft, log);
  });

  test("a held Save whose account check answers while the tab is in the background says it wasn't saved on return", async ({ page, context }) => {
    const draft = await heldDraft(page, context);
    const log = saveLog(page);
    await contactSave(page).click(); await draft.waitHeld();
    await setHidden(page, true, false);
    await draft.answer();
    await expect(page.locator("[data-browser-scope]")).toHaveAttribute("inert", "");
    await expect(shield(page)).not.toBeVisible();
    await setHidden(page, false);
    await ready(page); await settled(page);
    expect(log.checks).toBe(2); expect(log.actions).toBe(0);
    await expectDraftKept(page, draft);
    await saveDraftAgain(page, draft, log);
  });

  test("a save asked for while the tab is masked is not sent and says so once the tab is back", async ({ page, context }) => {
    const draft = await heldDraft(page, context);
    await page.unroute(ACCOUNT);
    const log = saveLog(page);
    // The masked page is hidden from roles, so the form is found by its field.
    const form = page.locator("form", { has: page.locator("#lastName") });
    await transition(page, "pagehide");
    await form.evaluate(form => (form as HTMLFormElement).requestSubmit());
    await settled(page);
    expect(log.checks).toBe(0); expect(log.actions).toBe(0);
    await transition(page, "pageshow");
    await ready(page); await settled(page);
    expect(log.checks).toBe(1); expect(log.actions).toBe(0);
    await expectDraftKept(page, draft);
    await saveDraftAgain(page, draft, log);
  });

  test("a held Save the browser refuses to send again says it wasn't saved and keeps every entry", async ({ page, context }) => {
    const draft = await heldDraft(page, context);
    const log = saveLog(page);
    await draft.form.evaluate(form => form.append(Object.assign(document.createElement("button"), { type: "submit", id: "held-refused", textContent: "Save as pressed" })));
    await page.locator("#held-refused").click(); await draft.waitHeld();
    // The pressed button stays in the form but no longer submits it, so the browser refuses to send from it.
    await page.locator("#held-refused").evaluate(button => { (button as HTMLButtonElement).type = "button"; });
    await draft.answer(); await settled(page);
    expect(log.checks).toBe(1); expect(log.actions).toBe(0);
    await expectDraftKept(page, draft);
    await saveDraftAgain(page, draft, log);
  });

  test("a held Save refused because the session ended shows the shield, and after signing in again its form says it wasn't saved", async ({ page, context }) => {
    const draft = await heldDraft(page, context);
    await revoke(owners[0]);
    const log = saveLog(page);
    await contactSave(page).click(); await draft.answer();
    await expect(shieldHeading(page)).toHaveText("Sign in to continue");
    await settled(page);
    expect(log.checks).toBe(1); expect(log.actions).toBe(0);
    await returnAfterSignIn(page, context, owners[0]);
    await settled(page);
    expect(log.actions).toBe(0);
    await expectDraftKept(page, draft);
    await saveDraftAgain(page, draft, log);
  });

  test("a held Save refused because the tab went offline shows the shield, and back online its form says it wasn't saved", async ({ page, context }) => {
    const draft = await heldDraft(page, context);
    const log = saveLog(page);
    await contactSave(page).click(); await draft.waitHeld();
    await context.setOffline(true);
    await expect(shieldHeading(page)).toHaveText("Reconnect to continue");
    await page.unroute(ACCOUNT);
    await context.setOffline(false);
    await ready(page); await settled(page);
    expect(log.checks).toBe(2); expect(log.actions).toBe(0);
    await expectDraftKept(page, draft);
    await saveDraftAgain(page, draft, log);
  });

  test("a held Save whose account check never answers ends in the reconnect shield, and its form then says it wasn't saved", async ({ page, context }) => {
    const draft = await heldDraft(page, context);
    const log = saveLog(page);
    await contactSave(page).click(); await draft.waitHeld();
    // The boundary stops waiting for an unanswered check, so the save ends unsent with the shield saying why.
    await expect(shieldHeading(page)).toHaveText("Reconnect to continue", { timeout: test.info().timeout });
    await page.unroute(ACCOUNT);
    await shield(page).getByRole("button", { name: "Check again", exact: true }).click();
    await ready(page); await settled(page);
    expect(log.checks).toBe(2); expect(log.actions).toBe(0);
    await expectDraftKept(page, draft);
    await saveDraftAgain(page, draft, log);
  });
});
