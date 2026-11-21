import { resolve } from "node:path";
import { build } from "esbuild";
import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";
import { BROWSER_CHANGE_CHANNEL } from "../src/lib/private-browser-state";

// Exercise the actual components and native dialogs with controlled inputs. No product code or browser scheduler
// is replaced: the fixture supplies a late close, and the account response stays pending until the keyboard action.
test.use({ serviceWorkers: "block" });
let bundle: string;
test.beforeAll(async () => {
  const result = await build({
    entryPoints: [resolve("e2e/fixtures/today-races.tsx")], bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }
  });
  bundle = result.outputFiles[0].text;
});
test.beforeEach(async ({ page }) => {
  await page.route("**/__today-races?*", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><div id="root"></div><script src="/__today-races.js"></script>' }));
  await page.route("**/__today-races.js", route => route.fulfill({ contentType: "text/javascript", body: bundle }));
});

for (const event of ["focus", "online"]) {
  test(`background ${event} recheck preserves Profile Escape`, async ({ page }) => {
    await page.route("**/api/auth/browser-context", route => route.fulfill({ json: { scope: "fixture-account" } }));
    await page.goto("/__today-races?kind=account");
    await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    const profile = page.getByRole("dialog", { name: "Profile", exact: true });
    await expect(profile).toBeVisible();
    let pending: Route | undefined;
    await page.route("**/api/auth/browser-context", route => { pending = route; });
    await page.evaluate(name => window.dispatchEvent(new Event(name)), event);
    await expect.poll(() => Boolean(pending)).toBe(true);
    try {
      await page.keyboard.press("Escape");
      await expect(profile).not.toBeVisible();
      await expect(page.locator(".browser-account-gate")).not.toBeVisible();
      await expect(page.getByRole("button", { name: "Profile", exact: true })).toBeFocused();
    } finally {
      await pending!.fulfill({ json: { scope: "fixture-account" } });
    }
    await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    await expect(page.getByLabel("Draft")).toHaveValue("Keep my draft");
  });
}

test("a background focus recheck does not restore focus and scroll from a hidden tab", async ({ page }) => {
  await page.route("**/api/auth/browser-context", route => route.fulfill({ json: { scope: "fixture-account" } }));
  await page.goto("/__today-races?kind=account-focus");
  const content = page.locator("[data-browser-scope]");
  const gate = page.locator(".browser-account-gate");
  await expect(content).not.toHaveAttribute("inert", "");
  await page.getByLabel("Field X").focus();
  await expect(page.getByLabel("Field X")).toBeFocused();
  await page.evaluate(() => {
    window.scrollTo({ top: 80, behavior: "instant" });
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    Object.defineProperty(document, "hasFocus", { configurable: true, value: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(content).toHaveAttribute("inert", "");
  let pending: Route | undefined;
  await page.route("**/api/auth/browser-context", route => { pending = route; });
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => Boolean(pending)).toBe(true);
  await expect(gate).toBeVisible();
  await pending!.fulfill({ json: { scope: "fixture-account" } });
  await expect(content).not.toHaveAttribute("inert", "");
  await expect(gate).not.toBeVisible();
  // The visible tab is usable, but the window has not gained focus yet. The owner chooses Y.
  await page.getByLabel("Field Y").focus();
  await expect(page.getByLabel("Field Y")).toBeFocused();
  pending = undefined;
  await page.evaluate(() => {
    window.scrollTo({ top: 160, behavior: "instant" });
    Object.defineProperty(document, "hasFocus", { configurable: true, value: () => true });
    window.dispatchEvent(new Event("focus"));
  });
  await expect.poll(() => Boolean(pending)).toBe(true);
  await expect(page.getByLabel("Field Y")).toBeFocused();
  const finished = page.waitForEvent("requestfinished", request => request.url().endsWith("/api/auth/browser-context"));
  await pending!.fulfill({ json: { scope: "fixture-account" } });
  await finished;
  // Let the response continuation and the browser's focus/scroll work finish before checking the result.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(content).not.toHaveAttribute("inert", "");
  await expect(gate).not.toBeVisible();
  await expect(page.getByLabel("Field Y")).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(160);
});

for (const result of ["offline", "expired", "changed"] as const) {
  test(`a background recheck that is ${result} still locks the account`, async ({ page }) => {
    await page.route("**/api/auth/browser-context", route => route.fulfill({ json: { scope: "fixture-account" } }));
    await page.goto("/__today-races?kind=account");
    await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    await page.route("**/api/auth/browser-context", route => route.fulfill(result === "offline" ? { status: 503 } : { json: { scope: result === "expired" ? null : "other-account" } }));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    const gate = page.locator(".browser-account-gate");
    await expect(gate).toBeVisible();
    await expect(page.locator("[data-browser-scope]")).toHaveAttribute("inert", "");
    await expect(gate).toContainText(result === "offline" ? "Reconnect to continue" : result === "expired" ? "Sign in to continue" : "Your account changed");
    await page.keyboard.press("Escape");
    await expect(gate).toBeVisible();
    if (result === "changed") await expect(page.getByLabel("Draft")).toHaveCount(0);
  });
}

test("the automatic next review survives a held card moving in the close frame", async ({ page }) => {
  await page.goto("/__today-races?kind=placement");
  await page.getByRole("button", { name: "Review first", exact: true }).click();
  await expect(page.locator("[data-placement]")).toHaveText("overdue");
  // A remote read can arrive while the phone's modal review is open.
  await page.getByRole("button", { name: "Receive next follow-up" }).evaluate((button: HTMLButtonElement) => button.click());
  const heldNext = page.locator('[data-today-section="overdue"] [data-jump-workflow="next"]');
  await expect(heldNext).toBeAttached();
  const oldCard = await heldNext.elementHandle();
  await page.getByRole("button", { name: "Record outcome" }).click();
  await expect(page.locator('[data-today-section="today"] [data-jump-workflow="next"] dialog[open]')).toBeVisible();
  expect(await oldCard!.evaluate(element => element.isConnected)).toBe(false);
  await expect(page.locator(".follow-up-review-sheet[open]")).toHaveCount(1);
  await expect(page.locator("[data-placement]")).toHaveText("today");
});

// Audit A-18: each gate state has its own wording. A lost connection reads as a connection problem, and account
// wording needs an answer from the server. The wording is all that differs: every failure masks the tab as before.
test.describe("account gate wording per state", () => {
  const ACCOUNT = "**/api/auth/browser-context";
  const offline = "You’re offline. Your unsaved work stays in this tab.";
  const unconfirmed = "We couldn’t confirm your account. Reconnect, then try again. Your unsaved work stays in this tab.";
  const changed = "A different account is signed in on this browser, so anything not yet saved in this tab was removed.";
  const signedOut = "You signed out in another tab, so anything not yet saved in this tab was removed.";
  async function open(page: Page) {
    await page.route(ACCOUNT, route => route.fulfill({ json: { scope: "fixture-account" } }));
    await page.goto("/__today-races?kind=account-focus");
    await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");
    await page.getByLabel("Field X").fill("Unsaved wording");
  }
  async function answer(page: Page, handler: (route: Route) => unknown) {
    await page.unroute(ACCOUNT);
    await page.route(ACCOUNT, handler);
  }
  async function recheck(page: Page) { await page.evaluate(() => window.dispatchEvent(new Event("focus"))); }
  async function expectGate(page: Page, heading: string, body: string, retry: boolean) {
    const gate = page.getByRole("dialog", { name: heading, exact: true });
    await expect(gate).toBeVisible({ timeout: 15_000 });
    await expect(gate.getByRole("status")).toHaveText(body);
    await expect(gate.getByRole("button", { name: "Check again", exact: true })).toHaveCount(retry ? 1 : 0);
    const content = page.locator("[data-browser-scope]");
    await expect(content).toHaveAttribute("inert", "");
    await expect(content).toHaveCSS("visibility", "hidden");
    await expect(page.locator("html")).toHaveAttribute("data-browser-locked", "true");
  }

  const cases: { name: string; trigger: (page: Page, context: BrowserContext) => Promise<unknown>; heading: string; body: string; retry: boolean }[] = [
    { name: "the browser goes offline", trigger: (_page, context) => context.setOffline(true), heading: "Reconnect to continue", body: offline, retry: true },
    { name: "the account check fails with a network error", trigger: async page => { await answer(page, route => route.abort("internetdisconnected")); await recheck(page); }, heading: "Reconnect to continue", body: offline, retry: true },
    { name: "the account check gets no reply in time", trigger: async page => { await answer(page, () => undefined); await recheck(page); }, heading: "Reconnect to continue", body: offline, retry: true },
    { name: "the server answers with an error", trigger: async page => { await answer(page, route => route.fulfill({ status: 503 })); await recheck(page); }, heading: "Reconnect to continue", body: unconfirmed, retry: true },
    { name: "the server's answer can't be read", trigger: async page => { await answer(page, route => route.fulfill({ contentType: "text/html", body: "<!doctype html><p>Sign in to the network</p>" })); await recheck(page); }, heading: "Reconnect to continue", body: unconfirmed, retry: true },
    { name: "the session has expired", trigger: async page => { await answer(page, route => route.fulfill({ json: { scope: null } })); await recheck(page); }, heading: "Sign in to continue", body: "Sign in to the same account in another tab, then return here to keep your draft.", retry: true },
    { name: "another account signed in", trigger: async page => { await answer(page, route => route.fulfill({ json: { scope: "other-account" } })); await recheck(page); }, heading: "Your account changed", body: changed, retry: false },
    { name: "another tab signed out", trigger: async page => {
      await answer(page, route => route.fulfill({ json: { scope: null } }));
      await page.evaluate(name => { const channel = new BroadcastChannel(name); channel.postMessage({ signedOut: true }); channel.close(); }, BROWSER_CHANGE_CHANNEL);
    }, heading: "You’re signed out", body: signedOut, retry: false }
  ];
  for (const { name, trigger, heading, body, retry } of cases) {
    test(`${name}: the gate says so and the tab stays masked`, async ({ page, context }) => {
      await open(page);
      await trigger(page, context);
      await expectGate(page, heading, body, retry);
    });
  }

  test("Check again while offline keeps the offline wording, and reconnecting returns the unsaved work", async ({ page, context }) => {
    await open(page);
    await context.setOffline(true);
    await expectGate(page, "Reconnect to continue", offline, true);
    await answer(page, route => route.abort("internetdisconnected"));
    await page.getByRole("button", { name: "Check again", exact: true }).click();
    await expectGate(page, "Reconnect to continue", offline, true);
    await answer(page, route => route.fulfill({ json: { scope: "fixture-account" } }));
    await context.setOffline(false);
    await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");
    await expect(page.locator(".browser-account-gate")).not.toBeVisible();
    await expect(page.getByLabel("Field X")).toHaveValue("Unsaved wording");
  });
});
