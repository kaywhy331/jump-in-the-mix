import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const userEmail = process.env.E2E_USER_EMAIL ?? "demo@jumpinthemix.local";
const userPassword = process.env.E2E_USER_PASSWORD ?? "JumpInTheMix123!";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(userEmail);
  await page.getByLabel("Password").fill(userPassword);
  await Promise.all([
    page.waitForURL(/\/(jumps|onboarding)(\?|$)/),
    page.getByRole("button", { name: "Sign in" }).click()
  ]);
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth
  }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function expectNoClippedControls(page: Page) {
  const clipped = await page.locator("button:visible, a.button:visible, summary.button:visible").evaluateAll((elements) => elements.flatMap((element) => {
    if (element.getAttribute("aria-label") === "Open Next.js Dev Tools" || element.classList.contains("sr-only")) return [];
    const control = element as HTMLElement;
    const rect = control.getBoundingClientRect();
    const container = control.closest(".card, .jump-task-card, .contact-row, .mix-card") as HTMLElement | null;
    const containerRect = container?.getBoundingClientRect();
    const clippedByOwnBox = control.scrollWidth > control.clientWidth + 1 || control.scrollHeight > control.clientHeight + 1;
    const outsideContainer = Boolean(containerRect && (rect.left < containerRect.left - 1 || rect.right > containerRect.right + 1));
    return clippedByOwnBox || outsideContainer ? [{
      tag: control.tagName,
      className: control.className,
      ariaLabel: control.getAttribute("aria-label"),
      text: control.innerText.trim(),
      clippedByOwnBox,
      outsideContainer
    }] : [];
  }));
  expect(clipped).toEqual([]);
}

async function expectReadableMeaningfulText(page: Page) {
  const tooSmall = await page.locator("body *:visible").evaluateAll((elements) => elements.flatMap((element) => {
    if (!(element instanceof HTMLElement)) return [];
    if (element.closest(".sr-only, [aria-hidden='true']")) return [];
    const directText = [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent?.trim() ?? "")
      .filter(Boolean)
      .join(" ");
    const controlText = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? element.getAttribute("aria-label") || element.placeholder || element.value
      : element instanceof HTMLSelectElement
        ? element.getAttribute("aria-label") || element.name
        : "";
    const text = directText || controlText;
    if (!text) return [];
    const fontSize = Number.parseFloat(getComputedStyle(element).fontSize);
    if (!Number.isFinite(fontSize) || fontSize === 0 || fontSize >= 13) return [];
    return [{
      tag: element.tagName.toLowerCase(),
      className: element.className,
      text: text.slice(0, 100),
      fontSize
    }];
  }));
  expect(tooSmall).toEqual([]);
}

test("core design primitives match the visual baseline", async ({ page }, testInfo) => {
  test.skip(process.env.PLAYWRIGHT_CAPTURE === "off", "Visual comparison requires screenshot capture.");
  test.skip(testInfo.project.name !== "desktop-chromium", "The canonical visual baseline runs once.");
  const css = `${readFileSync("src/styles/base.css", "utf8")}\n${readFileSync("src/styles/components.css", "utf8")}`;
  await page.setViewportSize({ width: 720, height: 420 });
  await page.setContent(`<style>${css}</style><main id="design-fixture" style="width:680px;padding:28px;display:grid;gap:20px;background:var(--surface-soft)"><section class="card" style="margin:0;display:grid;grid-template-columns:1fr auto;gap:16px"><div style="height:18px;width:180px;border-radius:9px;background:var(--ink)"></div><span class="status-pill done" style="width:72px;height:28px"></span><div style="grid-column:1/-1;height:12px;width:72%;border-radius:6px;background:var(--line)"></div><div class="button primary" style="width:148px;height:46px"></div></section><section style="display:flex;gap:12px"><div class="button" style="width:112px;height:46px"></div><div class="button danger" style="width:112px;height:46px"></div><div class="icon-button" style="display:grid;place-items:center"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 6 12 12M18 6 6 18"/></svg></div></section></main>`);
  await expect(page.locator("#design-fixture")).toHaveScreenshot("core-design-primitives.png", { animations: "disabled", caret: "hide", maxDiffPixelRatio: 0.01 });
});

test("core pages preserve clean fitment without horizontal overflow", async ({ page }) => {
  await signIn(page);
  for (const route of ["/jumps", "/contacts", "/mixes", "/settings", "/account"]) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test("desktop personal account and settings cards share a common top edge", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop alignment is checked once.");
  await signIn(page);

  await page.goto("/account");
  const accountCards = page.locator(".account-grid > .card");
  const firstAccount = await accountCards.nth(0).boundingBox();
  const secondAccount = await accountCards.nth(1).boundingBox();
  expect(firstAccount).not.toBeNull();
  expect(secondAccount).not.toBeNull();
  expect(Math.abs(firstAccount!.y - secondAccount!.y)).toBeLessThanOrEqual(1);

  await page.goto("/settings");
  const settingsCards = page.locator(".settings-hub-grid > .settings-hub-card");
  const firstSetting = await settingsCards.nth(0).boundingBox();
  const secondSetting = await settingsCards.nth(1).boundingBox();
  expect(firstSetting).not.toBeNull();
  expect(secondSetting).not.toBeNull();
  expect(Math.abs(firstSetting!.y - secondSetting!.y)).toBeLessThanOrEqual(1);
});

test("mobile navigation fills the footer with five evenly spaced controls", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile geometry is checked once.");
  await signIn(page);
  await page.goto("/jumps");

  for (const width of [320, 390, 430, 767, 768, 844, 900]) {
    const height = width === 844 ? 390 : 844;
    await page.setViewportSize({ width, height });
    const footer = page.locator(".mobile-nav");
    const controls = footer.locator("a.nav-link:visible, button.nav-quick-add:visible");
    await expect(controls).toHaveCount(5);
    const footerBox = (await footer.boundingBox())!;
    expect(Math.abs(footerBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(footerBox.width - width)).toBeLessThanOrEqual(1);
    expect(Math.abs(footerBox.y + footerBox.height - height)).toBeLessThanOrEqual(1);
    for (let index = 0; index < 5; index += 1) {
      const box = (await controls.nth(index).boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(Math.abs(box.x + box.width / 2 - width * (index + 0.5) / 5)).toBeLessThanOrEqual(1);
      expect(box.y).toBeGreaterThanOrEqual(footerBox.y);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
    }
    await expectNoHorizontalOverflow(page);
  }
  const cdp = await page.context().newCDPSession(page);
  try {
    for (const { width, height, side, bottom } of [
      { width: 390, height: 844, side: 0, bottom: 34 },
      { width: 844, height: 390, side: 44, bottom: 21 }
    ]) {
      await page.setViewportSize({ width, height });
      await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { left: side, right: side, bottom } });
      const footer = (await page.locator(".mobile-nav").boundingBox())!;
      expect(footer.height).toBe(67 + bottom);
      const controls = page.locator(".mobile-nav a.nav-link, .mobile-nav button.nav-quick-add");
      for (let index = 0; index < 5; index += 1) {
        const box = (await controls.nth(index).boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(side);
        expect(box.x + box.width).toBeLessThanOrEqual(width - side);
        expect(box.y + box.height).toBeLessThanOrEqual(height - bottom);
        expect(Math.abs(box.x + box.width / 2 - (side + (width - side * 2) * (index + 0.5) / 5))).toBeLessThanOrEqual(1);
      }
    }
  } finally {
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: {} });
    await cdp.detach();
  }
  await page.locator(".mobile-nav .nav-quick-add").click();
  await expect(page.getByRole("dialog", { name: "Quick Add", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".mobile-nav .nav-quick-add")).toBeFocused();

  await page.setViewportSize({ width: 901, height: 900 });
  await expect(page.locator(".mobile-nav")).toBeHidden();
  await expect(page.locator(".sidebar")).toBeVisible();
});

test("meaningful text remains readable on phone-sized screens", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  test.skip(testInfo.project.name !== "mobile-chromium", "Phone typography is checked once.");
  await signIn(page);
  for (const route of [
    "/jumps",
    "/contacts",
    "/contacts/new",
    "/contacts/import",
    "/contacts/custom-fields",
    "/mixes",
    "/templates",
    "/settings",
    "/settings/business",
    "/settings/jump-date-types",
    "/settings/notifications",
    "/account",
    "/help"
  ]) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    await expectReadableMeaningfulText(page);
  }
});

test("mobile text actions stay readable instead of collapsing into blank controls", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile header geometry is checked once.");
  await signIn(page);
  await page.goto("/templates");
  for (const label of ["My mixes", "Create a mix"]) {
    const action = page.getByRole("link", { name: label, exact: true });
    await expect(action).toBeVisible();
    const box = await action.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(60);
  }
  await expectNoHorizontalOverflow(page);
});

test("global Quick Add previews natural-language capture before continuing", async ({ page }) => {
  await signIn(page);
  await page.goto("/jumps");
  await page.getByRole("button", { name: "Quick Add", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Quick Add" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("What do you want to remember?").fill("Follow up with Jordan next Monday about the proposal");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog.getByText("Confirm this interpretation")).toBeVisible();
  await expect(dialog.getByText("Jordan", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Continue with Contact" })).toBeVisible();
  page.once("dialog", (confirmation) => confirmation.accept());
  await dialog.getByRole("button", { name: "Close Quick Add" }).click();
  await expect(dialog).toBeHidden();
});

test("settings hub opens focused personal scheduling controls", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings");
  const preferences = page.getByRole("link", { name: /Personal preferences/ });
  await expect(preferences).toBeVisible();
  await preferences.click();
  await expect(page).toHaveURL(/\/account\/preferences$/);
  await expect(page.getByRole("heading", { name: "Personal preferences" })).toBeVisible();
  await expect(page.getByLabel("Display name")).toBeVisible();
  const timezone = page.locator(".timezone-current").filter({ hasText: "Personal timezone" });
  await expect(timezone).toBeVisible();
  await timezone.getByRole("button", { name: "Change" }).click();
  const timezoneDialog = page.getByRole("dialog", { name: "Choose your city" });
  await expect(timezoneDialog.getByLabel("Search cities")).toBeVisible();
  await timezoneDialog.getByRole("button", { name: "Close timezone picker" }).click();
  await expect(page.getByLabel("Default follow-up time")).toBeVisible();
  await expect(page.getByLabel("Quiet hours begin")).toBeVisible();
  await expect(page.getByLabel("Quiet hours end")).toBeVisible();
  await expect(page.getByLabel("Weekend scheduling")).toBeVisible();
});

test("public single-user product story remains focused and responsive", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The public viewport matrix runs once.");
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Know who to follow up with. And what to say." })).toBeVisible();
    await expect(page.getByRole("list", { name: "Made for your relationships" })).toContainText("BusinessPersonalYour network");
    await expect(page.locator(".hero-actions").getByRole("link", { name: "Join the waitlist" })).toHaveAttribute("href", "/waitlist");
    await expect(page.locator("main")).not.toContainText(/\b(?:pricing|billing|subscription|upgrade|downgrade|team|organization|stripe|google contacts|ai provider)\b/i);
    await expectNoHorizontalOverflow(page);
  }
});

test("confirmation dialogs restore focus and accessibility preferences remain usable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Accessibility preference modes are covered once.");
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await signIn(page);
  await page.goto("/account?section=security");
  const trigger = page.getByRole("button", { name: "Sign out everywhere…" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Sign out everywhere?" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expectNoHorizontalOverflow(page);

  await page.goto("/contacts");
  const firstContact = page.locator(".contact-row").first();
  await firstContact.getByLabel(/More options for/).click();
  const archiveTrigger = firstContact.getByRole("button", { name: "Archive…" });
  await archiveTrigger.click();
  const archiveDialog = page.getByRole("dialog", { name: /Archive .+\?/ });
  await expect(archiveDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(archiveDialog).toBeHidden();
  await expect(archiveTrigger).toBeFocused();
});

test("Quick Add shortcuts continue into actionable contact journeys", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The stateful shortcut journeys run once.");
  await signIn(page);
  await page.goto("/jumps");
  await page.getByRole("button", { name: "Quick Add", exact: true }).first().click();
  await page.getByRole("dialog", { name: "Quick Add" }).getByRole("link", { name: /Add a person/ }).click();
  await expect(page).toHaveURL(/\/contacts\/new$/);
  await expect(page.getByRole("heading", { name: "Add a contact" })).toBeVisible();

  await page.goto("/jumps");
  await page.getByRole("button", { name: "Quick Add", exact: true }).first().click();
  await page.getByRole("dialog", { name: "Quick Add" }).getByRole("link", { name: /Log what happened/ }).click();
  await expect(page).toHaveURL(/\/contacts\?intent=log-note/);
  await expect(page.getByText("Then add what happened to their notes.")).toBeVisible();
  await page.getByRole("link", { name: "Add note" }).first().click();
  await expect(page).toHaveURL(/\/contacts\/[^#]+#add-note/);
  await expect(page.getByRole("textbox", { name: "Add a note" })).toBeVisible();
});

test("responsive controls remain complete and align to card width", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The explicit viewport matrix runs once.");
  await signIn(page);

  for (const width of [320, 375, 412, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/jumps", "/contacts", "/mixes", "/settings", "/account"]) {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectNoClippedControls(page);
    }

    if (width <= 900) {
      await page.goto("/jumps");
      const card = page.locator(".jump-task-card:visible").first();
      const primary = card.locator(".jump-channel-action");
      const actions = card.locator(".jump-primary-action");
      await expect(card).toBeVisible();
      const [cardBox, primaryBox, actionsBox] = await Promise.all([card.boundingBox(), primary.boundingBox(), actions.boundingBox()]);
      expect(cardBox).not.toBeNull();
      expect(primaryBox).not.toBeNull();
      expect(actionsBox).not.toBeNull();
      expect(actionsBox!.x).toBeGreaterThanOrEqual(cardBox!.x - 1);
      expect(actionsBox!.x + actionsBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1);
      expect(primaryBox!.width).toBeGreaterThanOrEqual(40);
      expect(primaryBox!.height).toBeGreaterThanOrEqual(40);
    }
  }
});

test("Jump overflow provides first-class snooze presets", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The stateful snooze journey runs once.");
  await signIn(page);
  await page.goto("/jumps");
  const pendingCard = page.locator(".jump-task-card").filter({ has: page.getByRole("button", { name: "Done", exact: true }) }).first();
  await expect(pendingCard).toBeVisible();
  await pendingCard.getByLabel(/More options for/).click();
  await pendingCard.getByRole("button", { name: "Tomorrow" }).click();
  await expect(page.getByText("Follow-up snoozed.")).toBeVisible();
});
