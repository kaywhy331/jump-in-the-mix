import { expect, type Page } from "@playwright/test";

/** Call after navigation, before measuring an already-rendered page. */
export async function applyRenderedTheme(page: Page, colorScheme: "light" | "dark", viewport?: { width: number; height: number }) {
  await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
  if (viewport) await page.setViewportSize(viewport);
  // Chromium can update root tokens before inherited text styles on the next
  // frame. Viewport media queries also need layout before measurements. Measure
  // settled styles; do not let axe or overflow assertions sample both layouts.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.locator("body")).toHaveCSS("color", colorScheme === "dark" ? "rgb(241, 244, 251)" : "rgb(23, 32, 54)");
}
