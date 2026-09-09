import { expect, test, type Page } from "@playwright/test";
import { axeInPage } from "./axe-in-page";

test.use({ screenshot: "off", video: "off", trace: "off" });

// Observe user-initiated protocol links without asking the test runner to call or send.
async function interceptHandoffs(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener("click", event => {
      const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
      if (!link || !/^(sms:|mailto:|tel:)/.test(link.href)) return;
      event.preventDefault();
      document.documentElement.dataset.lastHandoff = link.href;
    });
  });
}

const scenarios = [
  { name: "Lead", steps: [["Text", "Immediate"], ["Text", "Day 2"]] },
  { name: "Quote", steps: [["Email", "Immediate"], ["Text", "Immediate"], ["Text", "Day 2"], ["Text", "Day 3"], ["Phone", "Scheduled date"]] },
  { name: "Completion", steps: [["Phone", "Immediate"], ["Email", "Day 1"], ["Text", "Day 3"], ["Text", "Day 30"], ["Email", "3 months"], ["Email", "1 year / seasonal"]] }
];

test("all 13 campaign steps hand off only to the fictional contact without a server mutation", async ({ page }) => {
  await interceptHandoffs(page);
  const mutations: string[] = [];
  const errors: string[] = [];
  page.on("request", request => { if (!["GET", "HEAD"].includes(request.method())) mutations.push(request.url()); });
  page.on("pageerror", error => errors.push(error.message));
  const response = await page.goto("/");
  const policy = response!.headers()["content-security-policy"];
  const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
  expect(policy).toContain("'strict-dynamic'"); expect(nonce).toBeTruthy();
  expect(await response!.text()).toContain(`nonce="${nonce}"`);
  await expect(page.getByRole("radio", { name: "Lead", exact: true })).toBeEnabled();
  await expect(page.locator(".demo-contact")).toContainText("Fictional demo contact");
  await expect(page.locator(".demo-contact-details")).toContainText("1 (555) 555-5555");
  for (const scenario of scenarios) {
    await page.getByRole("radio", { name: scenario.name, exact: true }).check();
    await page.locator(".demo-plan-overview summary").click();
    const selector = page.getByLabel("Explore a beat");
    await expect(selector.locator("option")).toHaveCount(scenario.steps.length);
    await expect(selector).toHaveValue("0");
    for (const [index, [channel, timing]] of scenario.steps.entries()) {
      await selector.selectOption(String(index));
      await expect(page.locator(".demo-step-heading")).toContainText(`${channel} · ${timing}`);
      await expect(page.locator(".demo-step-navigation")).toContainText(`Beat ${index + 1} of ${scenario.steps.length}`);
      const action = page.getByRole("link", { name: `Open ${channel.toLowerCase()} app`, exact: true });
      const href = (await action.getAttribute("href"))!;
      const message = await page.locator(".demo-message").inputValue();
      expect(message).toContain("Alex");
      expect(message).not.toMatch(/\{\{|\}\}/);
      if (channel === "Phone") {
        expect(href).toBe("tel:+15555555555");
        await expect(page.locator(".demo-message")).toBeHidden();
        const reminders = page.getByRole("list", { name: "Call reminders", exact: true }).getByRole("listitem");
        await expect(reminders).toHaveCount(4);
        expect(await reminders.allTextContents()).toEqual(message.split("\n").map(line => line.replace(/^• /, "")));
      }
      else {
        expect(decodeURIComponent(href.split("body=")[1])).toBe(`[DEMO — preview]\n\n${message}`);
        if (channel === "Text") expect(href).toMatch(/^sms:\+15555555555\?body=/);
        else {
          const url = new URL(href);
          expect(url.pathname).toBe("alex@example.invalid");
          expect(url.searchParams.get("subject")).toBe(`[DEMO] ${await page.getByLabel("Sample subject").inputValue()}`);
        }
      }
      await action.click();
      // Browsers may encode apostrophes when resolving an external app link.
      await expect.poll(async () => decodeURIComponent(await page.locator("html").getAttribute("data-last-handoff") ?? "")).toBe(decodeURIComponent(href));
      await expect(page.locator(".demo-status")).toContainText("Your device handles opening the app");
      expect(new URL(page.url()).pathname).toBe("/");
    }
  }
  expect(mutations).toEqual([]);
  expect(errors).toEqual([]);
});

test("draft edits encode correctly and copy supports both success and clipboard denial", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { document.documentElement.dataset.copied = text; } } }));
  await page.goto("/");
  await page.getByRole("radio", { name: "Quote", exact: true }).check();
  await page.getByText("Fine-tune this message", { exact: true }).click();
  const subject = "Price & timing? #1 + follow-up";
  const body = "Hi Alex,\nA&B + 50%? #details\nCafé — thanks!\n&bcc=someone@example.com";
  await page.getByLabel("Sample subject").fill(subject);
  await page.getByLabel("Make it sound like you").fill(body);
  const email = new URL((await page.getByRole("link", { name: "Open email app", exact: true }).getAttribute("href"))!);
  expect(email.pathname).toBe("alex@example.invalid");
  expect([...email.searchParams.keys()]).toEqual(["subject", "body"]);
  expect(email.searchParams.get("subject")).toBe(`[DEMO] ${subject}`);
  expect(email.searchParams.get("body")).toBe(`[DEMO — preview]\n\n${body}`);
  await page.getByRole("button", { name: "Copy message", exact: true }).click();
  await expect(page.locator(".demo-status")).toContainText("Demo copied");
  await expect(page.locator("html")).toHaveAttribute("data-copied", `[DEMO — preview]\n\n${subject}\n\n${body}`);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { throw new DOMException("Clipboard denied", "NotAllowedError"); } } }));
  await page.getByRole("button", { name: "Copy message", exact: true }).click();
  await expect(page.locator(".demo-status")).toContainText("copy it manually");
  await expect(page.getByLabel("Make it sound like you")).toBeFocused();
  expect(await page.locator(".demo-message").evaluate((field: HTMLTextAreaElement) => field.value.slice(field.selectionStart, field.selectionEnd))).toBe(body);
  await page.getByRole("radio", { name: "Lead", exact: true }).check();
  await page.getByText("Fine-tune this message", { exact: true }).click();
  await page.getByLabel("Make it sound like you").fill(body);
  const sms = (await page.getByRole("link", { name: "Open text app", exact: true }).getAttribute("href"))!;
  expect(sms).toMatch(/^sms:\+15555555555\?body=/);
  expect(decodeURIComponent(sms.split("body=")[1])).toBe(`[DEMO — preview]\n\n${body}`);
  await page.getByRole("radio", { name: "Completion", exact: true }).check();
  await expect(page.getByLabel("One reminder per line")).toBeHidden();
  await page.getByRole("button", { name: "Copy notes", exact: true }).click();
  await expect(page.getByLabel("One reminder per line")).toBeFocused();
  await expect(page.locator(".demo-status")).toContainText("copy it manually");
  await page.getByLabel("One reminder per line").fill("• Confirm Alex is happy\n- Share my care tips");
  await page.locator(".demo-notes-editor summary").click();
  await expect(page.getByRole("list", { name: "Call reminders", exact: true }).getByRole("listitem")).toHaveText(["Confirm Alex is happy", "Share my care tips"]);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text: string) => { document.documentElement.dataset.copied = text; } } }));
  await page.getByRole("button", { name: "Copy notes", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-copied", "[DEMO — preview]\n\n• Confirm Alex is happy\n- Share my care tips");
});

test("keyboard navigation, step boundaries, and full plan controls stay in sync", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("radio", { name: "Lead", exact: true })).toBeEnabled();
  await page.getByRole("radio", { name: "Lead", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Quote", exact: true })).toBeChecked();
  await page.locator(".demo-plan-overview summary").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Previous", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Next", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Explore a beat")).toHaveValue("1");
  await expect(page.getByRole("link", { name: "Open text app", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(page.getByLabel("Explore a beat")).toHaveValue("0");
  await page.getByRole("button", { name: "Inspection day call Phone · Scheduled date", exact: true }).click();
  await expect(page.getByRole("group", { name: "Selected sample beat", exact: true })).toBeFocused();
  await expect(page.getByLabel("Explore a beat")).toHaveValue("4");
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Inspection day call Phone · Scheduled date", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("radio", { name: "Completion", exact: true }).check();
  await expect(page.getByLabel("Explore a beat")).toHaveValue("0");
  await expect(page.locator(".demo-plan-overview")).not.toHaveAttribute("open", "");
  await expect(page.getByRole("list", { name: "Call reminders", exact: true }).getByRole("listitem")).toHaveText(["Check Alex is happy", "Ask about any fixes", "Share care tips", "Thank Alex"]);
});

test("mobile, tablet, and desktop fit in light and dark with accessible controls", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport matrix covers both layouts.");
  test.setTimeout(120_000);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await page.locator(".demo-contact-editor > summary").click();
      for (const scenario of scenarios) {
        await page.getByRole("radio", { name: scenario.name, exact: true }).check();
        await page.locator(".demo-plan-overview summary").click();
        await page.getByLabel("Explore a beat").selectOption(String(scenario.steps.length - 1));
        const fit = await page.locator(".product-demo").evaluate(element => {
          const overflow = [...element.querySelectorAll('button, select, textarea, input:not([type="radio"]), .demo-scenarios label, .demo-actions a, summary')].filter(control => {
            if (!control.checkVisibility()) return false;
            const r = control.getBoundingClientRect();
            return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1 || r.height < 44 || r.width < 44);
          }).map(control => control.textContent?.slice(0, 100));
          const widths = [...element.querySelectorAll(".demo-scenarios label")].map(control => control.getBoundingClientRect().width);
          const singleLineLabels = [...element.querySelectorAll(".demo-scenarios span")].every(label => {
            const range = document.createRange(); range.selectNodeContents(label);
            return range.getBoundingClientRect().height <= parseFloat(getComputedStyle(label).lineHeight) + 1;
          });
          return { overflow, equalWidth: Math.max(...widths) - Math.min(...widths) < 1, singleLineLabels, pageOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
        });
        expect(fit, `${colorScheme} ${width} ${scenario.name}`).toEqual({ overflow: [], equalWidth: true, singleLineLabels: true, pageOverflow: false });
        expect((await axeInPage(page).include(".product-demo").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
      }
    }
  }
});

test("iPhone and desktop-mode iPad prepare Apple SMS links after hydration", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "User-agent coverage is independent of the default project.");
  for (const tablet of [false, true]) {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, httpCredentials: testInfo.project.use.httpCredentials, viewport: { width: tablet ? 1024 : 390, height: 844 }, userAgent: tablet ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15" : "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1" });
    if (tablet) await context.addInitScript(() => { Object.defineProperty(navigator, "platform", { value: "MacIntel" }); Object.defineProperty(navigator, "maxTouchPoints", { value: 5 }); });
    const page = await context.newPage();
    try {
      await interceptHandoffs(page);
      await page.goto("/");
      const link = page.getByRole("link", { name: "Open text app", exact: true });
      await expect(link).toHaveAttribute("href", /^sms:\+15555555555&body=/);
      await link.click();
      await expect(page.locator("html")).toHaveAttribute("data-last-handoff", /^sms:\+15555555555&body=/);
    } finally { await context.close(); }
  }
});

test("editable demo contact personalizes drafts and destinations with private notes and blank fallbacks", async ({ page }) => {
  await interceptHandoffs(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, "demoContactEvents", { value: [] });
    window.addEventListener("jitm:conversion", event => (window as unknown as {demoContactEvents: unknown[]}).demoContactEvents.push((event as CustomEvent).detail));
  });
  const mutations: string[] = [];
  page.on("request", request => { if (!["GET", "HEAD"].includes(request.method())) mutations.push(request.url()); });
  await page.goto("/");
  await page.locator(".demo-contact-editor > summary").click();
  const editor = page.locator(".demo-contact-editor");
  const name = editor.getByLabel("Contact name", { exact: true });
  const sender = editor.getByLabel("Your name", { exact: true });
  const phone = editor.getByLabel("Phone", { exact: true });
  const email = editor.getByLabel("Email", { exact: true });
  const notes = editor.getByLabel("Notes", { exact: true });
  await expect(name).toHaveValue("Alex Example");
  await expect(sender).toHaveValue("Jamie");
  await expect(phone).toHaveValue("1 (555) 555-5555");
  await expect(email).toHaveValue("alex@example.invalid");
  await expect(notes).toHaveValue(/Interested in a service visit/);
  await name.fill("Taylor Rivera"); await sender.fill("Casey Morgan");
  await phone.fill("1 (202) 555-0142"); await email.fill("taylor+demo@example.invalid");
  await notes.fill("Private note: text before calling. Do not include this in messages.");
  await expect(page.locator(".demo-person")).toContainText("Taylor Rivera");
  await expect(page.locator(".demo-message-preview")).toContainText("Hi Taylor, it's Casey Morgan");
  await expect(page.locator(".demo-message-preview")).not.toContainText("Private note");
  const textAction = page.getByRole("link", { name: "Open text app", exact: true });
  await expect(textAction).toHaveAttribute("href", /^sms:\+12025550142\?body=/);
  await textAction.click();
  await expect(page.locator("html")).toHaveAttribute("data-last-handoff", /^sms:\+12025550142\?body=/);
  await page.getByRole("radio", { name: "Quote", exact: true }).check();
  const emailAction = page.getByRole("link", { name: "Open email app", exact: true });
  const url = new URL((await emailAction.getAttribute("href"))!);
  expect(decodeURIComponent(url.pathname)).toBe("taylor+demo@example.invalid");
  expect(url.searchParams.get("subject")).toBe("[DEMO] Your quote from Casey Morgan");
  expect(url.searchParams.get("body")).toContain("Hi Taylor,");
  expect(url.searchParams.get("body")).not.toContain("Private note");
  await emailAction.click();
  await page.getByRole("radio", { name: "Completion", exact: true }).check();
  await expect(page.getByRole("list", { name: "Call reminders", exact: true })).toContainText("Check Taylor is happy");
  await page.locator(".demo-contact-note-preview > summary").click();
  await expect(page.locator(".demo-contact-note-preview")).toContainText("Private note: text before calling");
  await page.getByRole("link", { name: "Open phone app", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-last-handoff", "tel:+12025550142");
  await expect(notes).toHaveValue(/Private note/);
  for (const field of [name, sender, phone, email, notes]) await field.fill(" ");
  await expect(page.locator(".demo-contact-note-preview")).toContainText("Interested in a service visit");
  await expect(page.locator(".demo-person")).toContainText("Alex Example");
  await expect(page.getByRole("link", { name: "Open phone app", exact: true })).toHaveAttribute("href", "tel:+15555555555");
  await page.getByRole("radio", { name: "Lead", exact: true }).check();
  await expect(page.locator(".demo-message-preview")).toContainText("Hi Alex, it's Jamie");
  await phone.fill("123");
  await expect(page.locator(".demo-actions .primary")).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator(".demo-actions .primary")).not.toHaveAttribute("href");
  await expect(page.locator("#demo-contact-action-help")).toContainText("valid phone number");
  await editor.getByRole("button", { name: "Use sample contact", exact: true }).click();
  await expect(notes).toHaveValue(/Interested in a service visit/);
  await page.getByText("Fine-tune this message", { exact: true }).click();
  await page.getByLabel("Make it sound like you").fill("My custom wording stays here.");
  await name.fill("Riley Example"); await sender.fill("Morgan");
  await expect(page.locator(".demo-message-preview")).toHaveText("My custom wording stays here.");
  await page.getByRole("button", { name: "Use prepared message", exact: true }).click();
  await expect(page.locator(".demo-message-preview")).toContainText("Hi Riley, it's Morgan");
  await editor.getByRole("button", { name: "Done editing", exact: true }).click();
  await expect(editor).not.toHaveAttribute("open", "");
  await expect(editor.locator("summary")).toBeFocused();
  const events = await page.evaluate(() => (window as unknown as {demoContactEvents: unknown[]}).demoContactEvents);
  expect(JSON.stringify(events)).not.toMatch(/Taylor|Rivera|Casey|Private note|202|taylor\+demo|Riley|Morgan/);
  expect(mutations).toEqual([]);
  await page.reload();
  await expect(page.locator(".demo-person")).toContainText("Alex Example");
});

test("Try the demo focuses and glows the window repeatedly without resetting contact edits", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".product-demo")).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("heading", { name: "Try a demo mix", exact: true })).toBeVisible();
  await expect(page.getByText("Interactive sample", { exact: true })).toHaveCount(0);
  const trigger = page.getByRole("link", { name: "Try the demo", exact: true });
  await trigger.click();
  await expect(page).toHaveURL(/#sample$/);
  const demo = page.locator(".product-demo");
  await expect(demo).toBeFocused();
  await expect(demo).toHaveClass(/demo-highlighted/);
  expect(await demo.evaluate(element => getComputedStyle(element).boxShadow)).toContain("38px");
  await expect(demo).not.toHaveClass(/demo-highlighted/, { timeout: 5000 });
  await page.locator(".demo-contact-editor > summary").click();
  await page.getByLabel("Contact name", { exact: true }).fill("Glow Test");
  await trigger.click();
  await expect(demo).toHaveClass(/demo-highlighted/);
  await expect(demo).toBeFocused();
  await expect(page.getByLabel("Contact name", { exact: true })).toHaveValue("Glow Test");
  await expect(page.locator(".demo-message-preview")).toContainText("Hi Glow,");
});
