import { expect, type Page } from "@playwright/test";

/** Call after navigation, before measuring an already-rendered page. */
export async function applyRenderedTheme(page: Page, colorScheme: "light" | "dark") {
  await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
  // Chromium can update root tokens before inherited text styles on the next
  // frame. Measure the settled theme; do not let axe sample both palettes.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.locator("body")).toHaveCSS("color", colorScheme === "dark" ? "rgb(241, 244, 251)" : "rgb(23, 32, 54)");
}
