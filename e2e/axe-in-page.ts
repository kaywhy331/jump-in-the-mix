import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export function axeInPage(page: Page) {
  // The default result collector opens a new tab and triggers account locking.
  // In-page axe.run keeps the tested state intact. Its frame restriction is safe
  // here only because we require every tested surface to have no child frames.
  expect(page.frames(), "Use a frame-aware audit if this surface embeds content.").toHaveLength(1);
  return new AxeBuilder({ page }).setLegacyMode();
}
