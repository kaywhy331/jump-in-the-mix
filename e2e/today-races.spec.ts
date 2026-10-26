import { resolve } from "node:path";
import { build } from "esbuild";
import { expect, test, type Route } from "@playwright/test";

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
