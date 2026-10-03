import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { DEMO_BEATS, demoSituations } from "../src/lib/demo-workspace";
import { MARKETING_SCENARIOS } from "../src/lib/marketing-scenarios";

type NativeClick = { href: string; prevented: boolean };

// Never let a test hand a real sms:, mailto: or tel: link to the operating system.
// The document listener runs after React's handlers, so it records whether the page itself
// prevented the default; the window listener then cancels the navigation.
async function guardNativeLinks(page: Page, options: { blockStorage?: boolean; blockClipboard?: boolean } = {}) {
  await page.addInitScript(({ blockStorage, blockClipboard }) => {
    const clicks: NativeClick[] = [];
    (window as unknown as { __demoNative: NativeClick[] }).__demoNative = clicks;
    const native = (event: Event) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      return link && /^(sms|mailto|tel):/i.test(link.getAttribute("href") ?? "") ? link : null;
    };
    document.addEventListener("click", event => { const link = native(event); if (link) clicks.push({ href: link.getAttribute("href")!, prevented: event.defaultPrevented }); });
    window.addEventListener("click", event => { if (native(event)) event.preventDefault(); });
    if (blockStorage) for (const name of ["localStorage", "sessionStorage"]) Object.defineProperty(window, name, { get() { throw new DOMException("Storage blocked", "SecurityError"); } });
    if (blockClipboard) Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("Clipboard blocked")) } });
  }, options);
}
const nativeClicks = (page: Page) => page.evaluate(() => (window as unknown as { __demoNative: NativeClick[] }).__demoNative);

test("Today demo supports editing, previews, truthful outcomes, Not yet and Undo", async ({ page }) => {
  const mutations: string[] = [];
  const errors: string[] = [];
  page.on("request", request => { if (!["GET", "HEAD"].includes(request.method())) mutations.push(request.url()); });
  page.on("pageerror", error => errors.push(error.message));
  await guardNativeLinks(page);
  await page.goto("/");
  await page.getByRole("link", { name: "Try the demo", exact: true }).click();
  const demo = page.locator("#sample");
  const message = demo.getByRole("textbox", { name: "Message to Alex Morgan" });
  await expect(message).toBeFocused();
  const schedule = demo.getByRole("list", { name: "Mix schedule" });
  await expect(schedule.getByRole("button")).toHaveText(["TextToday", "EmailTomorrow", "CallIn 1 week"]);
  await message.fill(" ");
  await expect(demo.getByRole("button", { name: "Preview SMS" })).toBeDisabled();
  await message.fill("Hi Alex, would next week work for a quick check-in?");
  await page.keyboard.press("Tab");
  await expect(demo.getByRole("button", { name: "Preview SMS" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(demo.getByRole("heading", { name: "SMS preview" })).toBeFocused();
  await expect(demo.locator("blockquote")).toContainText("would next week work");
  await expect(schedule).not.toContainText("Done in demo");
  await demo.getByRole("button", { name: "Not yet", exact: true }).click();
  await expect(message).toHaveValue("Hi Alex, would next week work for a quick check-in?");
  await demo.getByRole("button", { name: "Preview SMS" }).click();
  await demo.getByRole("button", { name: "Mark sent (demo)", exact: true }).click();
  await expect(demo.getByRole("status")).toContainText("Nothing was sent");
  await expect(demo.getByText("Today’s Beat done", { exact: true })).toBeVisible();
  await demo.getByRole("button", { name: "Undo recorded outcome" }).click();
  await expect(schedule).not.toContainText("Done in demo");
  await expect(message).toHaveValue("Hi Alex, would next week work for a quick check-in?");
  for (const beat of DEMO_BEATS) {
    await demo.locator(`[data-demo-beat="${beat.channel}"]`).click();
    await demo.getByRole("button", { name: beat.preview, exact: true }).click();
    await expect(demo.locator(`[data-demo-preview="${beat.channel}"]`)).toBeVisible();
    await demo.getByRole("button", { name: beat.channel === "phone" ? "Mark called (demo)" : "Mark sent (demo)", exact: true }).click();
  }
  await expect(demo.getByRole("link", { name: "Join the waitlist" })).toHaveAttribute("href", "/waitlist");
  await expect(schedule.getByRole("button")).toHaveText(["TextTodayDone in demo", "EmailTomorrowDone in demo", "CallIn 1 weekDone in demo"]);
  // Recording a simulated outcome never needs, or implies, a native handoff.
  await expect(demo.locator('a[href^="sms:"],a[href^="mailto:"],a[href^="tel:"]')).toHaveCount(0);
  expect(await nativeClicks(page)).toEqual([]);
  expect(mutations).toEqual([]);
  expect(errors).toEqual([]);
});

const MARKER = "[DEMO — preview]";
const open = async (page: Page, channel: string, preview: string) => {
  const demo = page.locator("#sample");
  await demo.locator(`[data-demo-beat="${channel}"]`).click();
  await demo.getByRole("button", { name: preview, exact: true }).click();
  return demo;
};

test("each Beat hands the exact edited text to its native link; repeats only request again", async ({ page }) => {
  const mutations: string[] = [];
  page.on("request", request => { if (!["GET", "HEAD"].includes(request.method())) mutations.push(request.url()); });
  await guardNativeLinks(page);
  await page.goto("/");
  const demo = page.locator("#sample");
  await demo.getByRole("textbox", { name: "Message to Alex Morgan" }).fill("Hi Alex & co, 100% ready?\nSecond line");
  await demo.getByRole("button", { name: "Preview SMS" }).click();
  const sms = demo.locator('a[data-demo-native="text"]');
  await expect(sms).toHaveAttribute("href", `sms:+12025550142?body=${encodeURIComponent(`${MARKER}\n\nHi Alex & co, 100% ready?\nSecond line`)}`);
  await sms.click();
  await sms.click();
  await expect(demo.getByRole("status")).toContainText("Handoff requested");
  await expect(demo.getByText("Today’s Beat done", { exact: true })).toHaveCount(0);
  const clicks = await nativeClicks(page);
  expect(clicks.map(click => click.href)).toEqual([await sms.getAttribute("href"), await sms.getAttribute("href")]);
  expect(clicks.every(click => !click.prevented)).toBe(true);
  expect(mutations).toEqual([]);
});

test("email and call links carry the marker, edited subject, CRLF body and number only", async ({ page }) => {
  await guardNativeLinks(page);
  await page.goto("/");
  let demo = await open(page, "email", "Preview email");
  await demo.getByRole("button", { name: "Back to edit" }).click();
  await demo.getByRole("textbox", { name: "Subject", exact: true }).fill("Plan & more  ?");
  await demo.getByRole("textbox", { name: "Message to Alex Morgan" }).fill("Line one\nLine two");
  await demo.getByRole("button", { name: "Preview email", exact: true }).click();
  const mail = demo.locator('a[data-demo-native="email"]');
  await expect(mail).toHaveAttribute("href", `mailto:alex.morgan@example.invalid?subject=${encodeURIComponent("[DEMO] Plan & more ?")}&body=${encodeURIComponent(`${MARKER}\r\n\r\nLine one\r\nLine two`)}`);
  await mail.click();
  demo = await open(page, "phone", "Preview call");
  const tel = demo.locator('a[data-demo-native="phone"]');
  await expect(tel).toHaveAttribute("href", "tel:+12025550142");
  await tel.click();
  const hrefs = (await nativeClicks(page)).map(click => click.href);
  expect(hrefs).toHaveLength(2);
  expect(hrefs[0]).toMatch(/^mailto:alex\.morgan@example\.invalid\?subject=%5BDEMO%5D%20Plan%20%26%20more%20%3F&body=/);
  expect(hrefs[1]).toBe("tel:+12025550142");
});

test("focus and visibility changes never prove a handoff; edited email Beat survives Not yet, Undo; Reset restores default", async ({ page }) => {
  const SUBJECT = "Unique subject Q7 for Alex";
  const BODY = "Unique body Z9 line one\nUnique body Z9 line two";
  await guardNativeLinks(page, { blockStorage: true });
  await page.goto("/");
  let demo = await open(page, "email", "Preview email");
  await demo.getByRole("button", { name: "Back to edit" }).click();
  await demo.getByRole("textbox", { name: "Subject", exact: true }).fill(SUBJECT);
  await demo.getByRole("textbox", { name: "Message to Alex Morgan" }).fill(BODY);
  await demo.getByRole("button", { name: "Preview email", exact: true }).click();
  await demo.locator('a[data-demo-native="email"]').click();
  await page.evaluate(() => { window.dispatchEvent(new Event("blur")); document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); });
  await expect(demo.getByRole("status")).toContainText("cannot tell whether anything opened or was sent");
  await expect(demo.getByText("Done in demo")).toHaveCount(0);
  const preview = demo.locator('[data-demo-preview="email"]');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText(SUBJECT);
  await expect(demo.locator("blockquote")).toContainText("Unique body Z9 line two");
  await demo.getByRole("button", { name: "Not yet", exact: true }).click();
  await expect(demo.getByRole("heading", { level: 3 })).toBeFocused();
  await expect(demo.getByRole("textbox", { name: "Subject", exact: true })).toHaveValue(SUBJECT);
  await expect(demo.getByRole("textbox", { name: "Message to Alex Morgan" })).toHaveValue(BODY);
  await demo.getByRole("button", { name: "Preview email", exact: true }).click();
  await demo.getByRole("button", { name: "Mark sent (demo)", exact: true }).click();
  await demo.getByRole("button", { name: "Undo recorded outcome" }).click();
  await expect(demo.locator('[data-demo-beat="email"]')).toBeVisible();
  await expect(demo.getByRole("textbox", { name: "Subject", exact: true })).toHaveValue(SUBJECT);
  await expect(demo.getByRole("textbox", { name: "Message to Alex Morgan" })).toHaveValue(BODY);
  expect((await nativeClicks(page)).map(click => click.href.split(":")[0])).toEqual(["mailto"]);
  await demo.getByRole("button", { name: "Reset example" }).click();
  await expect(demo.getByRole("textbox", { name: "Message to Alex Morgan" })).toBeFocused();
  await expect(demo.getByRole("textbox", { name: "Message to Alex Morgan" })).not.toHaveValue(BODY);
  await expect(demo.getByRole("textbox", { name: "Subject", exact: true })).toHaveCount(0);
});

test("denied copy falls back to a focused, marked manual field; unavailable handler claims no success", async ({ page }) => {
  await guardNativeLinks(page, { blockClipboard: true });
  await page.goto("/");
  let demo = await open(page, "email", "Preview email");
  await demo.getByRole("button", { name: "Copy draft" }).click();
  const manual = demo.getByRole("textbox", { name: "Draft text to copy by hand" });
  await expect(manual).toBeFocused();
  await expect(manual).toHaveValue(new RegExp(`^Subject: \\[DEMO\\] .+\\n\\n${MARKER.replace(/[[\]]/g, "\\$&")}\\n\\n`));
  await expect(demo.getByRole("status")).toContainText("Copying was blocked");
  demo = await open(page, "phone", "Preview call");
  await demo.locator('a[data-demo-native="phone"]').click();
  await expect(demo.getByRole("textbox", { name: "Draft text to copy by hand" })).toHaveValue(new RegExp(`^${MARKER.replace(/[[\]]/g, "\\$&")}\\n\\n`));
  await expect(demo.getByRole("status")).not.toContainText(/delivered|successfully|has opened/i);
  await expect(demo.getByText("Done in demo")).toHaveCount(0);
});

test("synthetic captures: handoff states in both themes at narrow and desktop widths", async ({ page }) => {
  await guardNativeLinks(page);
  for (const [name, width] of [["narrow", 390], ["desktop", 1280]] as const) {
    for (const colorScheme of ["light", "dark"] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      await page.goto("/");
      const demo = page.locator("#sample");
      await demo.screenshot({ path: `.artifacts/demo-handoff/captures/${name}-${colorScheme}-initial.png` });
      await open(page, "text", "Preview SMS");
      await demo.locator('a[data-demo-native="text"]').click();
      await expect(demo.getByRole("status")).toContainText("Handoff requested");
      await demo.screenshot({ path: `.artifacts/demo-handoff/captures/${name}-${colorScheme}-handoff.png` });
    }
  }
});

test("situations retain separate drafts, subjects and progress; reset affects only the current one", async ({ page }) => {
  await page.goto("/");
  const demo = page.locator("#sample");
  await demo.getByRole("textbox").fill("Keep this client wording");
  await demo.locator('[data-demo-beat="email"]').click();
  await demo.getByRole("textbox", { name: "Subject", exact: true }).fill("Keep my subject");
  await demo.getByRole("textbox", { name: "Message to Alex Morgan" }).fill("Keep my email body");
  await demo.getByRole("button", { name: "Preview email", exact: true }).click();
  await demo.getByRole("combobox", { name: "Situation" }).selectOption("personal");
  await demo.getByRole("textbox").fill("Keep this personal wording");
  await demo.getByRole("combobox", { name: "Situation" }).selectOption("client");
  await expect(demo.locator("blockquote")).toContainText("Keep my email body");
  await expect(demo.locator('[data-demo-preview="email"]')).toContainText("Keep my subject");
  await demo.getByRole("button", { name: "Back to edit" }).click();
  await demo.locator('[data-demo-beat="text"]').click();
  await expect(demo.getByRole("textbox")).toHaveValue("Keep this client wording");
  await demo.getByRole("button", { name: "Reset example" }).click();
  await expect(demo.getByRole("textbox")).not.toHaveValue("Keep this client wording");
  await demo.getByRole("combobox", { name: "Situation" }).selectOption("personal");
  await expect(demo.getByRole("textbox")).toHaveValue("Keep this personal wording");
});

test("every situation uses SMS today, email tomorrow and a call in seven days, with valid access context", async ({ page }) => {
  test.setTimeout(120_000);
  for (const persona of [undefined, ...MARKETING_SCENARIOS]) {
    await page.goto(persona ? `/for/${persona.slug}` : "/");
    const demo = page.locator("#sample");
    for (const situation of demoSituations(persona?.id)) {
      await demo.getByRole("combobox", { name: "Situation" }).selectOption(situation.id);
      await expect(demo.locator('[data-demo-beat="text"]')).toHaveAttribute("aria-current", "step");
      for (const beat of DEMO_BEATS) {
        const node = demo.locator(`[data-demo-beat="${beat.channel}"]`);
        await expect(node).toHaveAttribute("data-due-day", String(beat.day));
        await expect(node).toContainText(beat.due);
        await node.click();
        await expect(demo.getByRole("heading", { level: 3 })).toContainText(beat.due.toLowerCase());
        await demo.getByRole("button", { name: beat.preview, exact: true }).click();
        await expect(demo.locator(`[data-demo-preview="${beat.channel}"]`)).toContainText(situation.person);
        await demo.getByRole("button", { name: beat.channel === "phone" ? "Mark called (demo)" : "Mark sent (demo)", exact: true }).click();
      }
      if (persona) {
        const selection = `${persona.id}~${situation.id}`;
        await expect(demo).toHaveAttribute("data-marketing-scenario", selection);
        await expect(demo.getByRole("link", { name: "Join the waitlist" })).toHaveAttribute("href", `/waitlist?scenario=${encodeURIComponent(selection)}`);
        await expect(page.locator('input[name="scenario"]')).toHaveValue(selection);
      }
    }
  }
});

test("all channel editors and previews reflow accessibly in both themes", async ({ page }) => {
  test.setTimeout(180_000);
  for (const width of [320, 390, 834, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.goto("/");
      const demo = page.locator("#sample");
      for (const beat of DEMO_BEATS) {
        await demo.locator(`[data-demo-beat="${beat.channel}"]`).click();
        for (const view of ["edit", "preview"]) {
          if (view === "preview") await demo.getByRole("button", { name: beat.preview, exact: true }).click();
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          // Scan all six states at the narrowest width; wider layouts still check fit.
          if (width === 320) {
            const scan = await new AxeBuilder({ page }).include("#sample").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
            expect(scan.violations.map(v => v.id)).toEqual([]);
          }
        }
      }
    }
  }
});

test("native previews stay inside the viewport at 200% text in both themes", async ({ page }) => {
  test.setTimeout(150_000);
  await guardNativeLinks(page);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      for (const beat of DEMO_BEATS) {
        await page.goto("/");
        const demo = await open(page, beat.channel, beat.preview);
        const link = demo.locator(`a[data-demo-native="${beat.channel}"]`);
        await link.click();
        await expect(demo.getByRole("status")).toContainText("cannot tell whether anything opened or was sent");
        // Snapshot every size first, then assign the doubled values, so nothing compounds.
        await page.evaluate(() => {
          const nodes = [...document.querySelectorAll<HTMLElement>("#sample *")];
          const sizes = nodes.map(node => parseFloat(getComputedStyle(node).fontSize));
          nodes.forEach((node, index) => { node.style.fontSize = `${sizes[index] * 2}px`; });
        });
        const fit = await page.evaluate(() => {
          const limit = document.documentElement.clientWidth + 0.5;
          const controls = [...document.querySelectorAll<HTMLElement>("#sample a[data-demo-native], #sample button, #sample textarea")]
            .filter(node => node.getClientRects().length > 0)
            .map(node => node.getBoundingClientRect());
          return { page: document.documentElement.scrollWidth <= innerWidth, controls: controls.length > 0 && controls.every(box => box.left >= -0.5 && box.right <= limit) };
        });
        expect(fit, `${beat.channel} ${width} ${colorScheme}`).toEqual({ page: true, controls: true });
        await expect(link).toBeVisible();
        await expect(demo.getByRole("button", { name: beat.channel === "phone" ? "Mark called (demo)" : "Mark sent (demo)", exact: true })).toBeVisible();
        // Truth survives the larger text: the draft stays here and nothing is recorded as done.
        await expect(demo.getByText("Today’s Beat done", { exact: true })).toHaveCount(0);
        expect((await nativeClicks(page)).map(click => click.href)).toEqual([await link.getAttribute("href")]);
      }
    }
  }
});

test("without JavaScript, the fictional schedule and access link remain readable", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(baseURL ?? "http://127.0.0.1:3000");
  expect(await page.locator("#sample noscript").textContent()).toContain("text today, email tomorrow, and a call in one week");
  await expect(page.locator("#sample").getByRole("list", { name: "Mix schedule" })).toContainText("Tomorrow");
  await expect(page.locator("#sample noscript a")).toHaveAttribute("href", "/waitlist");
  await context.close();
});
