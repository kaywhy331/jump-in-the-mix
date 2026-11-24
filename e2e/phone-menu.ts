import { expect, type Locator } from "@playwright/test";

/** A press before React attaches to a control is lost: wait until React has attached to it and a frame has passed. */
export async function hydrated(control: Locator) {
  await expect.poll(() => control.evaluate(element => Object.keys(element).some(key => key.startsWith("__reactProps")))).toBe(true);
  await control.page().evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

/**
 * Opens a phone menu (PhoneMenu, JITM-UXB-07: a Mix's "More Mix actions", the Mix collection selector) once React has
 * attached to its button. A menu that is already open stays open; a press the page undoes is pressed again.
 */
export async function openPhoneMenu(button: Locator) {
  await hydrated(button);
  await expect(async () => {
    if (await button.getAttribute("aria-expanded") !== "true") await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
  }).toPass();
}
