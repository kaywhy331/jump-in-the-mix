import { expect, test, type Page } from "@playwright/test";

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
    if (element.getAttribute("aria-label") === "Open Next.js Dev Tools") return [];
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

test("core pages preserve clean fitment without horizontal overflow", async ({ page }) => {
  await signIn(page);
  for (const route of ["/jumps", "/contacts", "/mixes", "/settings", "/account"]) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test("desktop card rows share a common top edge", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop alignment is checked once.");
  await signIn(page);

  await page.goto("/account?section=billing");
  const accountCards = page.locator(".account-grid > .card");
  const firstAccount = await accountCards.nth(0).boundingBox();
  const billingCard = page.locator(".account-billing-card");
  const billing = await billingCard.boundingBox();
  const accountGrid = await page.locator(".account-grid").boundingBox();
  expect(firstAccount).not.toBeNull();
  expect(billing).not.toBeNull();
  expect(accountGrid).not.toBeNull();
  expect(Math.abs(firstAccount!.x - accountGrid!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(billing!.x - accountGrid!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(billing!.width - accountGrid!.width)).toBeLessThanOrEqual(1);

  await page.goto("/settings");
  const settingsCards = page.locator(".settings-hub-grid > .settings-hub-card");
  const firstSetting = await settingsCards.nth(0).boundingBox();
  const secondSetting = await settingsCards.nth(1).boundingBox();
  expect(firstSetting).not.toBeNull();
  expect(secondSetting).not.toBeNull();
  expect(Math.abs(firstSetting!.y - secondSetting!.y)).toBeLessThanOrEqual(1);
});

test("mobile navigation and actions stay inside the viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile geometry is checked once.");
  await signIn(page);
  await page.goto("/jumps");

  const links = page.locator(".mobile-nav .nav-link:visible");
  await expect(links).toHaveCount(5);
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  for (let index = 0; index < await links.count(); index += 1) {
    const box = await links.nth(index).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
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
  await dialog.getByRole("button", { name: "Preview capture" }).click();
  await expect(dialog.getByText("Confirm this interpretation")).toBeVisible();
  await expect(dialog.getByText("Jordan", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Continue with Contact" })).toBeVisible();
  await dialog.getByRole("button", { name: "Close Quick Add" }).click();
  await expect(dialog).toBeHidden();
});

test("settings hub opens focused profile tools with global timezone and repeatable records", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings");
  await expect(page.getByRole("link", { name: /Profile/ })).toBeVisible();
  await expect(page.locator(".settings-profile-layout")).toHaveCount(0);

  await page.getByRole("link", { name: /Profile/ }).click();
  await expect(page).toHaveURL(/\/settings\?section=profile/);
  await expect(page.getByRole("heading", { name: "Workspace profile" })).toBeVisible();
  await expect(page.getByLabel("Timezone")).toBeVisible();
  await page.getByRole("button", { name: "Use detected" }).click();
  await expect(page.getByLabel("Timezone")).not.toHaveValue("");

  const products = page.locator(".repeatable-profile-records").filter({ hasText: "Products and services" });
  const initialCount = await products.getByPlaceholder("Name").count();
  await products.getByRole("button", { name: "Add record" }).click();
  await expect(products.getByPlaceholder("Name")).toHaveCount(initialCount + 1);
  await products.getByPlaceholder("Name").last().fill("Consultation link");
  await products.getByPlaceholder("Value").last().fill("https://example.com/book");
  await expect(products.locator('input[type="hidden"]')).toHaveValue(/Consultation link/);
});

test("public pricing preserves plan intent and remains responsive", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The public viewport matrix runs once.");
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/?billing=annual#pricing");
    await expect(page.getByText("Full plan comparison", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Choose Plus" })).toHaveAttribute("href", "/register?plan=plus&period=annual");
    await expectNoHorizontalOverflow(page);
  }
  await page.getByRole("link", { name: "Monthly" }).click();
  await expect(page.getByRole("link", { name: "Choose Pro" })).toHaveAttribute("href", "/register?plan=pro&period=monthly");
  await page.getByRole("link", { name: "Choose Pro" }).click();
  await expect(page).toHaveURL(/\/register\?plan=pro&period=monthly/);
  await expect(page.getByText("Your Pro · monthly selection is saved.")).toBeVisible();
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
      const card = page.locator(".jump-task-card").first();
      const primary = card.locator(".jump-channel-action");
      await expect(card).toBeVisible();
      const [cardBox, primaryBox] = await Promise.all([card.boundingBox(), primary.boundingBox()]);
      expect(cardBox).not.toBeNull();
      expect(primaryBox).not.toBeNull();
      expect(primaryBox!.x).toBeGreaterThanOrEqual(cardBox!.x - 1);
      expect(primaryBox!.x + primaryBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1);
      expect(primaryBox!.width).toBeGreaterThan(cardBox!.width * .85);
    }
  }
});

test("Jump overflow provides first-class snooze presets", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The stateful snooze journey runs once.");
  await signIn(page);
  await page.goto("/jumps");
  const pendingCard = page.locator(".jump-task-card").filter({ has: page.getByRole("button", { name: "Mark done" }) }).first();
  await expect(pendingCard).toBeVisible();
  await pendingCard.getByLabel(/More actions for/).click();
  await pendingCard.getByRole("button", { name: "Tomorrow" }).click();
  await expect(page.getByText("Jump snoozed. It will return to your queue at the new time.")).toBeVisible();
});
