import { mkdir, appendFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { PERSONAS } from "../src/lib/persona-mixes";

const routes = ["/", ...PERSONAS.map(persona => `/for/${persona.slug}`)];
const widths = [320, 375, 390, 599, 600, 601, 767, 768, 834, 900, 901, 999, 1000, 1001, 1099, 1100, 1194, 1199, 1200, 1279, 1280, 1440, 1599, 1600, 1699, 1700, 1920, 2560, 3110, 3840];
const fullNote = "Practice with a fictional contact. The demo sends nothing itself. If you choose to open the draft in your own text, email or phone app, the recipient is a non-working example and you decide whether to send or call. Free accounts, no card; access is by invitation from a member, or from the waitlist as space opens.";
const shortNote = "The demo sends nothing.";

async function geometry(page: Page) {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const r = document.querySelector(selector)!.getBoundingClientRect();
      return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height, bottom: r.bottom + scrollY };
    };
    return {
      demo: box("#sample"), chips: box(".mixes-for"), copy: box(".hero-copy"), actions: box(".hero-actions"),
      next: box("#how-it-works"), header: box(".public-header"), footer: box(".public-footer"),
      headingSize: parseFloat(getComputedStyle(document.querySelector("h1")!).fontSize),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
}

async function noShift(page: Page) {
  const before = await geometry(page);
  for (const channel of ["email", "phone", "text"]) {
    const button = page.locator(`[data-demo-beat="${channel}"]`);
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-current", "step");
    const after = await geometry(page);
    for (const key of ["chips", "copy", "actions", "next", "header", "footer", "demo"] as const) {
      expect(after[key], `${channel}: ${key} must not move or resize`).toEqual(before[key]);
    }
    await expect(page.locator("#sample textarea:visible")).toHaveCount(1);
    await expect(page.locator('#sample [aria-hidden="true"] input:not(:disabled), #sample [aria-hidden="true"] textarea:not(:disabled)')).toHaveCount(0);
    await expect(page.locator("#sample h3:visible")).toBeFocused();
  }
}

for (const theme of ["light", "dark"] as const) {
  for (const route of routes) {
    test(`hero remains compact and stable: ${theme} ${route}`, async ({ page }, testInfo) => {
      await page.addInitScript(value => localStorage.setItem("jitm-appearance", value), theme);
      await page.goto(route);
      await expect(page.locator("#sample")).toHaveAttribute("aria-busy", "false");
      await page.evaluate(() => document.fonts.ready);
      const sizes = testInfo.project.name === "desktop-chromium"
        ? [...widths.map(width => [width, width === 375 ? 667 : 900]), [844, 390], [1280, 600]]
        : [[320, 568], [375, 667], [390, 844], [844, 390]];
      const artifact = `.artifacts/uxa06/screenshots/${testInfo.project.name}-${theme}-${route.replaceAll("/", "_")}`;
      if (process.env.UXA06_CAPTURE) await mkdir(artifact, { recursive: true });
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        const measured = await geometry(page);
        expect(measured.overflow, `${width} overflow`).toBe(false);
        expect(measured.headingSize).toBeLessThanOrEqual(60);
        await expect(page.locator(".hero-note a")).toHaveText(shortNote);
        await expect(page.locator(".hero-note a")).toHaveAttribute("href", "/faq#demo");
        if (width === 375) expect(measured.demo.y, "demo peeks into the first screen").toBeLessThan(667);
        if (width === 1440) {
          expect(measured.chips.y - measured.copy.bottom, "chips sit directly under the copy").toBeLessThanOrEqual(32);
          expect(measured.chips.y - measured.actions.bottom, "no dead band below buttons").toBeLessThan(160);
        }
        if ([375, 768, 1440].includes(width)) await noShift(page);
        if (process.env.UXA06_CAPTURE) {
          await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
          await page.screenshot({ path: `${artifact}/${width}x${height}.png`, scale: "css" });
          await appendFile(".artifacts/uxa06/geometry.jsonl", JSON.stringify({ route, theme, project: testInfo.project.name, width, height, ...measured }) + "\n");
        }
      }
      await page.setViewportSize({ width: 375, height: 667 });
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      expect((await geometry(page)).overflow).toBe(false);
      await noShift(page);
      const note = page.locator(".hero-note a");
      await note.focus();
      await expect(note).toBeFocused();
      expect(await note.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
      if (process.env.UXA06_CAPTURE) {
        await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
        await page.screenshot({ path: `${artifact}/375-200percent.png`, fullPage: true, scale: "css" });
      }
    });
  }

  test(`short CTA notes reach the verbatim FAQ answer: ${theme}`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem("jitm-appearance", value), theme);
    for (const route of ["/", "/follow-up-templates", "/follow-up-templates/estimate-follow-up", "/follow-up-templates/proposal-follow-up", "/features/follow-up-reminders"]) {
      await page.goto(route);
      const link = page.getByRole("link", { name: shortNote, exact: true });
      await expect(link).toHaveCount(1);
      await link.focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/faq#demo$/);
      await expect(page.locator("#demo p")).toHaveText(fullNote);
      await expect(page.locator("#demo")).toBeInViewport();
    }
  });

  test(`heading remains continuous at the stack boundary: ${theme}`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem("jitm-appearance", value), theme);
    await page.goto("/");
    let previous = 0;
    for (const width of [999, 1000, 1001]) {
      await page.setViewportSize({ width, height: 900 });
      const current = (await geometry(page)).headingSize;
      if (previous) expect(Math.abs(current - previous)).toBeLessThan(1);
      previous = current;
    }
  });

  test(`recorded and editable Beats keep the same space offline: ${theme}`, async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.addInitScript(value => {
      localStorage.setItem("jitm-appearance", value);
      window.addEventListener("click", event => {
        if (event.target instanceof Element && event.target.closest("a[data-demo-native]")) event.preventDefault();
      });
    }, theme);
    await page.goto("/");
    const demo = page.locator("#sample");
    await expect(demo).toHaveAttribute("aria-busy", "false");
    await context.setOffline(true);
    await demo.locator('[data-demo-beat="email"]').click();
    await demo.getByRole("link", { name: "Open email", exact: true }).click();
    await demo.getByRole("button", { name: "Sent", exact: true }).click();
    await expect(demo.getByRole("status")).toContainText("Nothing was sent by this demo.");
    const before = await geometry(page);
    for (const channel of ["phone", "text", "email"]) {
      await demo.locator(`[data-demo-beat="${channel}"]`).click();
      const after = await geometry(page);
      for (const key of ["chips", "next", "demo"] as const) expect(after[key]).toEqual(before[key]);
    }
    await context.setOffline(false);
  });
}
