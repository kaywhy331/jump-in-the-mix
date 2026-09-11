import { expect, test, type Page } from "@playwright/test";
import { axeInPage } from "./axe-in-page";
import { DEMO_SCENARIOS } from "../src/lib/product-demo";

test.use({ screenshot: "off", video: "off", trace: "off" });
const STAMP = /[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2}/;
const hydrated = (page: Page) => expect(page.getByRole("radio", { name: DEMO_SCENARIOS[0].label, exact: true })).toBeEnabled();
const openBeat = (page: Page) => page.locator(".demo-beat.open");

test("the rhythm lists every beat, opens one at a time, and hands off only to the fictional contact", async ({ page }) => {
  const mutations: string[] = [];
  page.on("request", request => { if (!["GET", "HEAD"].includes(request.method())) mutations.push(request.url()); });
  await page.goto("/");
  await hydrated(page);
  for (const scenario of DEMO_SCENARIOS) {
    await page.getByRole("radio", { name: scenario.label, exact: true }).check();
    const beats = page.locator(".demo-beat");
    await expect(beats).toHaveCount(scenario.steps.length);
    await expect(page.locator(".demo-rhythm h3")).toContainText(`${scenario.steps.length} beats`);
    for (const [index, step] of scenario.steps.entries()) {
      const beat = beats.nth(index);
      const toggle = beat.getByRole("button", { name: new RegExp(`Beat ${index + 1}`) });
      if (index > 0) await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(openBeat(page)).toHaveCount(1);
      await expect(toggle).toContainText(step.title);
      await expect(toggle).toContainText(step.planned ? "Planned" : step.timing);
      const link = beat.locator(".demo-actions a.button.primary");
      await expect(link).toHaveAttribute("href", new RegExp(`^${step.channel === "text" ? "sms:" : step.channel === "email" ? "mailto:" : "tel:"}`));
      const href = await link.getAttribute("href");
      expect(href).toMatch(/5555555555|example\.invalid/);
    }
  }
  expect(mutations).toEqual([]);
});

test("a message is edited in place and the prepared version can be restored", async ({ page }) => {
  await page.goto("/");
  await hydrated(page);
  const editor = openBeat(page).getByLabel("Message", { exact: true });
  await expect(editor).toHaveValue(/Hi Alex/);
  await editor.fill("Edited in the bubble");
  await expect(openBeat(page).locator(".demo-actions a.button.primary")).toHaveAttribute("href", /Edited%20in%20the%20bubble/);
  await page.getByRole("button", { name: "Use prepared message" }).click();
  await expect(editor).toHaveValue(/Hi Alex/);
  await expect(page.locator(".demo-notes-editor, .demo-plan-overview")).toHaveCount(0);
  await expect(page.getByText("Fine-tune this message")).toHaveCount(0);
  await expect(page.getByText("Make it sound like you")).toHaveCount(0);
  await expect(openBeat(page).locator(".demo-notes-bubble textarea")).toBeVisible();
  await expect(openBeat(page).locator(".speech-bubble--compose")).toHaveCount(0);
});

test("marking a beat completed turns the check green and stamps the beat", async ({ page }) => {
  await page.goto("/");
  await hydrated(page);
  const beat = page.locator(".demo-beat").first();
  const check = beat.locator(".demo-check");
  await expect(check).toHaveAccessibleName("Mark completed");
  await expect(check).toHaveAttribute("aria-pressed", "false");
  await check.click();
  await expect(check).toHaveClass(/done/);
  await expect(check).toHaveAttribute("aria-pressed", "true");
  await expect(beat).toHaveClass(/done/);
  const stamp = beat.locator(".demo-beat-stamp");
  await expect(stamp).toHaveText(STAMP);
  // The stamp sits before the beat number and title.
  const headerText = (await beat.locator(".demo-beat-toggle").innerText()).replace(/\s+/g, " ").trim();
  expect(headerText.search(STAMP)).toBeLessThan(headerText.indexOf("Beat 1"));
  // It survives switching mixes and back.
  await page.getByRole("radio", { name: DEMO_SCENARIOS[1].label, exact: true }).check();
  await expect(page.locator(".demo-beat-stamp")).toHaveCount(0);
  await page.getByRole("radio", { name: DEMO_SCENARIOS[0].label, exact: true }).check();
  await expect(page.locator(".demo-beat").first().locator(".demo-beat-stamp")).toHaveText(STAMP);
  await page.locator(".demo-beat").first().getByRole("button", { name: /undo/ }).click();
  await expect(page.locator(".demo-beat-stamp")).toHaveCount(0);
});

test("a beat can be skipped, and a recorded time can be changed by clicking it", async ({ page }) => {
  await page.goto("/");
  await hydrated(page);
  const beat = page.locator(".demo-beat").first();
  await beat.locator(".demo-skip").click();
  await expect(beat).toHaveClass(/skipped/);
  await expect(beat.locator(".demo-beat-stamp")).toHaveClass(/skipped/);
  await beat.locator(".demo-beat-stamp").click();
  const picker = beat.getByLabel("Skipped time");
  await expect(picker).toBeVisible();
  await picker.fill("2026-09-03T09:15");
  await picker.press("Enter");
  await expect(beat.locator(".demo-beat-stamp")).toHaveText(/Sep 3, 9:15/);
  await beat.locator(".demo-skip").click();
  await expect(page.locator(".demo-beat-stamp")).toHaveCount(0);
});

test("the action row stays on one line and uses channel names", async ({ page }) => {
  await page.goto("/");
  await hydrated(page);
  const actions = openBeat(page).locator(".demo-actions");
  await expect(actions.locator("a.button.primary")).toHaveText("Text Message");
  const tops = await actions.locator("> *").evaluateAll(items => items.map(item => Math.round(item.getBoundingClientRect().top)));
  expect(new Set(tops).size, "all actions share one row").toBe(1);
  await page.getByRole("radio", { name: "Quote", exact: true }).check();
  await expect(openBeat(page).locator("a.button.primary")).toHaveText("E-Mail");
  await page.locator(".demo-beat").nth(4).getByRole("button", { name: /Beat 5/ }).click();
  await expect(openBeat(page).locator("a.button.primary")).toHaveText("Phone Call");
  await expect(openBeat(page).getByLabel("Planned date")).toBeVisible();
  await expect(openBeat(page).locator(".demo-beat-toggle")).toContainText("Planned");
});

test("the info tip explains the handoff on click, hover and focus, and the old help lines are gone", async ({ page }) => {
  await page.goto("/");
  await hydrated(page);
  const tip = openBeat(page).locator(".demo-info-tip");
  await expect(tip).toBeHidden();
  await openBeat(page).getByRole("button", { name: "How opening your app works" }).click();
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText("Opens your messaging with the contact ready. Review, edit, send.");
  await page.getByRole("heading", { name: "Try a demo mix" }).click();
  await expect(tip).toBeHidden();
  await openBeat(page).getByRole("button", { name: "How opening your app works" }).focus();
  await expect(tip).toBeVisible();
  await expect(page.getByText("Nothing sends or schedules automatically.")).toHaveCount(0);
  await expect(page.getByText(/Opens your own app using the contact above/)).toHaveCount(0);
});

test("a call beat edits its reminders in place and copies notes", async ({ page }) => {
  await page.goto("/");
  await hydrated(page);
  await page.getByRole("radio", { name: "Quote", exact: true }).check();
  await page.locator(".demo-beat").nth(4).getByRole("button", { name: /Beat 5/ }).click();
  const beat = openBeat(page);
  await expect(beat.locator("a.button.primary")).toHaveAttribute("href", /^tel:/);
  const notes = beat.getByLabel("Call reminders, one per line");
  await expect(notes).toHaveValue(/Confirm Alex/);
  await notes.fill("• One reminder");
  await expect(beat.getByRole("button", { name: "Use prepared reminders" })).toBeVisible();
  await expect(beat.getByRole("button", { name: "Copy notes" })).toBeEnabled();
});

test("beat headers work from the keyboard", async ({ page }) => {
  await page.goto("/");
  await hydrated(page);
  const second = page.locator(".demo-beat").nth(1).getByRole("button", { name: /Beat 2/ });
  await second.focus();
  await page.keyboard.press("Enter");
  await expect(second).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".demo-beat").first().getByRole("button", { name: /Beat 1/ })).toHaveAttribute("aria-expanded", "false");
  await expect(second).toBeFocused();
});

const LONG_DATE = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });
const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const daysFromNow = (days: number) => { const date = new Date(); date.setDate(date.getDate() + days); return date; };
// The Quote mix's fifth beat is the one planned for a chosen date and time.
const openPlannedBeat = async (page: Page) => {
  await page.getByRole("radio", { name: "Quote", exact: true }).check();
  await page.locator(".demo-beat").nth(4).getByRole("button", { name: /Beat 5/ }).click();
  return openBeat(page).getByRole("group", { name: "Planned date", exact: true });
};

test("the planned date picker works from the keyboard, keeps one tab stop, and announces each pick", async ({ page }) => {
  await page.goto("/");
  await hydrated(page);
  const picker = await openPlannedBeat(page);
  const dateTrigger = picker.locator(".when-trigger.date");
  const timeTrigger = picker.locator(".when-trigger.time");
  const status = picker.getByRole("status");
  const panel = picker.locator(".when-panel");
  const today = `${LONG_DATE.format(daysFromNow(0))}, today`;
  const tomorrow = LONG_DATE.format(daysFromNow(1));
  const dayAfter = LONG_DATE.format(daysFromNow(2));
  await expect(dateTrigger).toContainText("Tomorrow");
  await dateTrigger.focus();
  await page.keyboard.press("Enter");
  await expect(dateTrigger).toHaveAttribute("aria-expanded", "true");
  // Focus lands on the current choice, which is the only day in the tab order.
  await expect(panel.getByRole("button", { name: tomorrow, exact: true })).toBeFocused();
  await expect(panel.locator(".when-day[tabindex='0']")).toHaveCount(1);
  await page.keyboard.press("ArrowRight");
  await expect(panel.getByRole("button", { name: dayAfter, exact: true })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(panel.getByRole("button", { name: today, exact: true })).toBeFocused();
  // Yesterday cannot be picked, so focus stays on today instead of vanishing.
  await page.keyboard.press("ArrowLeft");
  await expect(panel.getByRole("button", { name: today, exact: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(status).toHaveText(`Date set to ${dayAfter}. Now choose a time.`);
  await expect(dateTrigger).toContainText(SHORT_DATE.format(daysFromNow(2)));
  await expect(timeTrigger).toHaveAttribute("aria-expanded", "true");
  await expect(panel.getByRole("button", { name: "10:00 AM", exact: true })).toBeFocused();
  await expect(panel.locator(".when-slot[tabindex='0']")).toHaveCount(1);
  await page.keyboard.press("ArrowRight");
  await expect(panel.getByRole("button", { name: "10:30 AM", exact: true })).toBeFocused();
  await page.keyboard.press("End");
  await expect(panel.getByRole("button", { name: "7:00 PM", exact: true })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(panel.getByRole("button", { name: "7:00 AM", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const belowFirst = await panel.locator(".when-slot").evaluateAll(slots => { const top = slots[0].getBoundingClientRect().top; return slots.filter(slot => slot.getBoundingClientRect().top === top).length; });
  await expect(panel.locator(".when-slot").nth(belowFirst)).toBeFocused();
  await panel.getByRole("button", { name: "10:30 AM", exact: true }).focus();
  await page.keyboard.press("Enter");
  // The panel closes, the trigger that now shows the time takes focus, and the pick is read out.
  await expect(panel).toHaveCount(0);
  await expect(timeTrigger).toBeFocused();
  await expect(timeTrigger).toContainText("10:30 AM");
  await expect(status).toHaveText(`Time set to 10:30 AM on ${dayAfter}.`);
  await expect(openBeat(page).locator(".demo-beat-toggle")).toContainText("10:30");
  // Escape closes without changing anything and returns focus to the trigger that opened it.
  await page.keyboard.press("Enter");
  await expect(panel.getByRole("button", { name: "10:30 AM", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(timeTrigger).toBeFocused();
  await expect(timeTrigger).toContainText("10:30 AM");
  // Switching views with the tabs leaves focus on the tab.
  await dateTrigger.click();
  await panel.getByRole("button", { name: "Time", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Time", exact: true })).toBeFocused();
  await expect(panel.locator(".when-slots")).toBeVisible();
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(dateTrigger).toBeFocused();
});

test("every picker control and the action row meet the 44px touch target on the phone layout", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Touch layout.");
  await page.goto("/");
  await hydrated(page);
  const undersized = async (scope: ReturnType<Page["locator"]>, label: string) => {
    const found = await scope.locator("a.button, button:not(:disabled)").evaluateAll(controls => controls.map(control => {
      const box = control.getBoundingClientRect();
      const day = control.classList.contains("when-day");
      return { name: control.getAttribute("aria-label") ?? control.textContent?.trim(), width: Math.round(box.width), height: Math.round(box.height), minWidth: day ? 24 : 44 };
    }).filter(control => control.height < 44 || control.width < control.minWidth));
    expect(found, label).toEqual([]);
  };
  // The handoff row keeps five 44px targets on one line, with the channel name still readable.
  const actions = openBeat(page).locator(".demo-actions");
  await undersized(actions, "action row");
  const primaryText = actions.locator("a.button.primary > span");
  expect(await primaryText.evaluate(span => { const box = span.getBoundingClientRect(); return box.width > 0 && box.height > 0; }), "channel name is visible").toBe(true);
  const picker = await openPlannedBeat(page);
  await undersized(picker, "closed");
  await picker.locator(".when-trigger.date").click();
  await expect(picker.locator(".when-grid")).toBeVisible();
  await undersized(picker, "date view");
  await picker.getByRole("button", { name: "Time", exact: true }).click();
  await expect(picker.locator(".when-slots")).toBeVisible();
  await undersized(picker, "time view");
});

test("the demo remains accessible and fits the release viewport matrix", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport matrix.");
  const tags = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await hydrated(page);
    const check = async (label: string) => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), `${width}px ${label} overflow`).toBe(false);
      expect((await axeInPage(page).include("#sample").withTags(tags).analyze()).violations, `${width}px ${label}`).toEqual([]);
    };
    await check("first beat");
    // The planned beat's open date and time views are part of the scanned surface.
    const picker = await openPlannedBeat(page);
    await picker.locator(".when-trigger.date").click();
    await expect(picker.locator(".when-grid")).toBeVisible();
    await check("date view");
    await picker.getByRole("button", { name: "Time", exact: true }).click();
    await expect(picker.locator(".when-slots")).toBeVisible();
    await check("time view");
  }
});
