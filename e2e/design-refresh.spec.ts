import { randomUUID } from "node:crypto";
import { axeInPage } from "./axe-in-page";
import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { createPendingJumpFixture, removePendingJumpFixture } from "./pending-jump-fixture";

// These regressions mutate only synthetic records in a loopback database.
const localDatabase = /^postgres(?:ql)?:\/\/[^@]+@(127\.0\.0\.1|localhost)(:|\/)/.test(process.env.DATABASE_URL ?? "");
test.skip(!localDatabase, "Design fixtures require an isolated local database.");
test.use({ screenshot: "off", video: "off", trace: "off" });
test.setTimeout(120_000);
const suffix = randomUUID();
const templateId = `design-template-${suffix}`;
const framework = `Design acceptance ${suffix}`;
let cookies: Awaited<ReturnType<BrowserContext["cookies"]>>;
let contactId: string;
let jumpId: string;
let userId: string;
let addressId: string;
let supportConversationCount: number;

async function hitTarget(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  expect(await locator.evaluate(element => {
    const r = element.getBoundingClientRect();
    return [[r.left + 8, r.top + 8], [r.right - 8, r.top + 8], [r.left + 8, r.bottom - 8], [r.right - 8, r.bottom - 8], [r.x + r.width / 2, r.y + r.height / 2]].every(([x, y]) => element.contains(document.elementFromPoint(x, y)));
  })).toBe(true);
}

// The ready-made page streams in after the app shell is ready, and each new selection or page resets the phone
// pane on its first render; a tap before React attaches to the pane button is replayed and then undone by that
// reset. Choose a pane only once its button is hydrated and a frame has passed for its effects.
async function choosePane(page: Page, name: "Mixes" | "Details") {
  if ((page.viewportSize()?.width ?? 1200) >= 1200) return; // From 1200 px every pane is shown side by side.
  const button = page.getByRole("navigation", { name: "Mix workspace panels", exact: true }).getByRole("button", { name, exact: true });
  await expect.poll(() => button.evaluate(element => Object.keys(element).some(key => key.startsWith("__reactProps")))).toBe(true);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

async function checkModal(page: Page, trigger: Locator, confirmation: string) {
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (let n = 0; n < 8; n++) {
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press(n < 4 ? "Tab" : "Shift+Tab");
  }
  await hitTarget(dialog.getByRole("button", { name: confirmation, exact: true }));
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
}

test.beforeAll(async ({ browser }) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: process.env.E2E_USER_EMAIL ?? "demo@jumpinthemix.local" } });
  userId = user.id;
  const contact = await prisma.contact.create({ data: {
    workspaceId: "demo_workspace", firstName: "Design", lastName: "Fixture", displayName: "Design Fixture",
    publicNotes: "Keep this customer note", privateNotes: "Keep this private note",
    addresses: { create: { label: "Office", street1: "42 Sample Street", city: "Sample City", country: "US", postalCode: "90210", isPrimary: true } },
    phones: { create: { phone: "+15555550123", normalized: "+15555550123", label: "Mobile", isPrimary: true } }
  }, include: { addresses: true } });
  contactId = contact.id;
  addressId = contact.addresses[0].id;
  for (const [index, category] of ["New clients", "New customers"].entries()) await prisma.sharedMix.create({ data: {
    id: `${templateId}-${index}`, title: `Design sample ${index}`, description: "A synthetic plan for checking setup and goal aliases.", category, industry: index ? "Home services" : "Any business", framework, status: "APPROVED", durationDays: 7,
    steps: [{ name: "Check in", channel: "SMS", dayOffset: 0, sendTimeMinutes: 600, body: "Hi {{First Name}}, how can we help?", subject: null, script: null, longSms: false, includeOptOut: false }]
  } });
  supportConversationCount = 16 + await prisma.supportTicket.count({ where: { workspaceId: "demo_workspace", requesterUserId: userId } });
  await prisma.supportTicket.createMany({ data: Array.from({ length: 18 }, (_, index) => ({
    id: `design-ticket-${suffix}-${index}`, reference: `DS-${suffix}-${index}`, workspaceId: index === 16 ? "other-design-workspace" : "demo_workspace", requesterUserId: index === 17 ? "other-design-requester" : userId,
    title: index >= 16 ? "Hidden foreign conversation" : `Design conversation ${index}`, category: "GENERAL" as const, lastActivityAt: new Date(Date.now() + index * 1000)
  })) });
  jumpId = await createPendingJumpFixture("Design hydration acceptance");
  const page = await browser.newPage();
  page.setDefaultTimeout(90_000);
  await page.goto(`${process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000"}/login`);
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_USER_PASSWORD ?? "JumpInTheMix123!");
  await Promise.all([page.waitForURL(/\/(jumps|onboarding)/), page.getByRole("button", { name: "Sign in", exact: true }).click()]);
  cookies = await page.context().cookies();
  await page.close();
});

test.beforeEach(async ({ context }) => { await context.addCookies(cookies); });
test.afterAll(async () => {
  if (jumpId) await removePendingJumpFixture(jumpId);
  if (contactId) await prisma.contact.deleteMany({ where: { id: contactId, workspaceId: "demo_workspace" } });
  await prisma.sharedMix.deleteMany({ where: { id: { in: [`${templateId}-0`, `${templateId}-1`] } } });
  await prisma.supportTicket.deleteMany({ where: { id: { startsWith: `design-ticket-${suffix}-` } } });
});

test("activation reviews contain focus, restore it, and keep confirmation reachable", async ({ page }) => {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/mixes/new?custom=1");
    await page.getByLabel("Mix name", { exact: true }).fill("Review only");
    await page.getByLabel("When should it start?").selectOption("MANUAL_START");
    await page.getByLabel("After saving").selectOption("ACTIVE");
    await page.getByLabel("Everyone").check();
    await page.getByLabel("Message", { exact: true }).fill("A synthetic review message.");
    await checkModal(page, page.getByRole("button", { name: "Review and start" }), "Start the Mix");
    await page.goto(`/templates/${templateId}-0/use`);
    await expect(page.getByLabel("After setup")).toHaveValue("DRAFT");
    await page.getByLabel("After setup").selectOption("ACTIVE");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Everyone").check();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await checkModal(page, page.getByRole("button", { name: "Review and start" }), "Start the Mix");
  }
});

test("library selection preserves filters and keyboard tools stay accessible", async ({ page }) => {
  await page.goto("/templates");
  await expect(page.locator(".mix-library-row")).toHaveCount(20);
  await page.getByRole("link", { name: "Next ready-made Mixes", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator(".mix-library-row")).toHaveCount(20);
  await page.goto(`/templates?category=New+customers&industry=Home+services&framework=${encodeURIComponent(framework)}`);
  await expect(page.locator(".mix-library-row")).toHaveCount(2);
  await page.locator(".mix-library-item").filter({ hasText: "Design sample 0" }).click();
  await expect(page.getByRole("region", { name: "Selected ready-made Mix" })).toContainText("Check in");
  await expect(page).toHaveURL(/category=New\+customers/);
  await expect(page).toHaveURL(new RegExp(`mix=${templateId}-0`));
  // On a phone, choosing a Mix shows its Beats pane; the library tools are under the Mixes pane.
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");
  await choosePane(page, "Mixes");
  const filter = page.getByRole("button", { name: "Filter ready-made Mixes", exact: true });
  await filter.focus(); await page.keyboard.press("Enter");
  const goals = await page.getByLabel("Filter by goal").locator("option").allTextContents();
  expect(goals).toContain("New customers"); expect(goals).not.toContain("New clients");
  await page.keyboard.press("Escape"); await expect(filter).toBeFocused();
  await page.getByRole("link", { name: "Clear filters", exact: true }).click();
  await expect(page).toHaveURL(/\/templates$/, { timeout: 60_000 });
  await filter.click();
  await expect(page.getByLabel("Filter by goal")).toHaveValue("");
  await expect(page.getByLabel("Filter by business type")).toHaveValue("");
  await expect(page.getByLabel("Filter by approach")).toHaveValue("");
  await page.keyboard.press("Escape");
  await page.getByRole("searchbox", { name: "Search ready-made Mixes" }).fill("Question-led discovery");
  await page.getByRole("button", { name: "Search ready-made Mixes", exact: true }).click();
  await expect(page).toHaveURL(/q=Question-led\+discovery|q=Question-led%20discovery/, { timeout: 60_000 });
  // The search loads a new page, which opens on the library pane; a phone shows the chosen Mix's details under Details.
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");
  await choosePane(page, "Details");
  await expect(page.getByRole("complementary", { name: "Ready-made Mix details" })).toContainText("Question-led discovery");
});

test("collapsed contact details retain address identity and notes on save", async ({ page }) => {
  await page.goto(`/contacts/${contactId}/edit`);
  const disclosure = page.locator(".contact-more-details");
  await expect(disclosure).not.toHaveAttribute("open", "");
  await page.getByLabel("First name", { exact: true }).fill("Updated");
  await page.getByRole("button", { name: "Update contact" }).click();
  await page.waitForURL(new RegExp(`/contacts/${contactId}(\\?|$)`));
  const saved = await prisma.contact.findUniqueOrThrow({ where: { id: contactId }, include: { addresses: true } });
  expect(saved.firstName).toBe("Updated");
  expect(saved.publicNotes).toBe("Keep this customer note");
  expect(saved.privateNotes).toBe("Keep this private note");
  expect(saved.addresses).toHaveLength(1);
  expect(saved.addresses[0]).toMatchObject({ id: addressId, street1: "42 Sample Street", city: "Sample City", isPrimary: true });
  await page.goto(`/contacts/${contactId}/edit`);
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");
  // Keep the click point visible while the disclosure's lower edge overlaps
  // Save. Focus must not scroll the target away between pointerdown and click.
  const edge = await disclosure.locator("summary").evaluate(element => {
    const footer = element.closest("form")!.querySelector(".sticky-form-actions")!;
    window.scrollBy({ top: element.getBoundingClientRect().bottom - footer.getBoundingClientRect().top - 2, behavior: "instant" });
    const bounds = element.getBoundingClientRect();
    return { bottom: bounds.bottom, footerTop: footer.getBoundingClientRect().top,
      reachable: element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)) };
  });
  expect(edge.bottom).toBeGreaterThan(edge.footerTop);
  expect(edge.reachable).toBe(true);
  await disclosure.locator("summary").first().click();
  await expect(disclosure).toHaveAttribute("open", "");
  await expect(page.getByLabel("Street", { exact: true })).toHaveValue("42 Sample Street");
  await page.locator(`label[for="addressCity-0"]`).click();
  await expect(page.getByLabel("City", { exact: true })).toBeFocused();
  const axe = await axeInPage(page).withRules(["label", "label-title-only"]).analyze();
  expect(axe.violations).toEqual([]);
});

test("support pagination scopes both workspace and requester and links return correctly", async ({ page }) => {
  await page.goto("/account?section=support");
  await expect(page).toHaveURL(/\/account\/tickets$/);
  await expect(page.locator(".support-ticket-row")).toHaveCount(15);
  await expect(page.getByText("Hidden foreign conversation")).toHaveCount(0);
  await page.getByRole("link", { name: "Next", exact: true }).click();
  await expect(page.locator(".support-ticket-row")).toHaveCount(Math.min(15, supportConversationCount - 15));
  await expect(page.getByText("Hidden foreign conversation")).toHaveCount(0);
  await page.locator(".support-ticket-row").first().click();
  await page.getByRole("link", { name: "All tickets" }).click();
  await expect(page).toHaveURL(/\/account\/tickets$/);
  await page.goto("/account/tickets?page=9999");
  await expect(page.locator(".support-ticket-row")).toHaveCount(((supportConversationCount - 1) % 15) + 1);
});

test("responsive destinations stay reachable and hydration stays consistent", async ({ page }) => {
  const errors: string[] = [];
  const networkFailures: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("requestfailed", request => networkFailures.push(`${new URL(request.url()).pathname}: ${request.failure()?.errorText}`));
  const settle = async () => {
    await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");
    // Complete a pending preparation check before measuring this layout and
    // leaving it. Otherwise its first one-second timer can start a fetch after
    // WebKit begins the next document navigation, before pagehide is delivered.
    const check = page.getByRole("complementary", { name: "Follow-up preparation", exact: true })
      .getByRole("button", { name: /^(Check again|Checking…)$/ });
    if (await check.isVisible()) {
      await expect(check).toHaveText("Check again");
      await expect(check).not.toHaveAttribute("aria-disabled", "true");
      await Promise.all([
        page.waitForResponse(response => new URL(response.url()).pathname === "/api/follow-ups/preparation" && response.request().method() === "GET" && response.status() === 200),
        check.click()
      ]);
    }
    // Assess the loaded layout. WebKit reports aborted prefetches as script
    // errors if a full-document navigation interrupts their loading.
    await page.waitForLoadState("networkidle");
  };
  for (const width of [320, 390, 767, 768, 820, 900, 1024, 1440]) {
    await page.goto("/mixes");
    await page.setViewportSize({ width, height: 1000 });
    await settle();
    // The ready-made library is reached through the Marketplace collection tab (91e5aad replaced the Ready-made tab).
    const library = page.getByRole("navigation", { name: "Mix collection", exact: true }).getByRole("link", { name: "Marketplace", exact: true });
    const bounds = await library.boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    expect(await library.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(13);
    await hitTarget(library);
    for (const route of ["/contacts", "/jumps"]) {
      await page.goto(route);
      await settle();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
  }
  await page.goto("/account/preferences");
  await settle();
  // The phone tab bar marks More for these pages; the desktop sidebar hides More (2c029bc) and marks
  // the page itself among its Account and help links (7e37d73).
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [route, label] of [["/settings", "Settings"], ["/help", "Help"], ["/account/tickets", "My account"]] as const) {
      await page.goto(route);
      await settle();
      if (width < 1024) await expect(page.locator('.nav-link[aria-current="page"]:visible')).toContainText("More");
      else await expect(page.getByRole("navigation", { name: "Account and help", exact: true }).locator('a[aria-current="page"]:visible')).toHaveText(label);
    }
  }
  expect(errors, JSON.stringify([...new Set(networkFailures)].slice(0, 12))).toEqual([]);
});

test("tablet contact controls stay reachable and dark settings hover stays readable", async ({ page }) => {
  for (const width of [768, 820, 900]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/contacts/${contactId}/edit`);
    await hitTarget(page.getByRole("button", { name: "Update contact", exact: true }));
    for (const name of ["Email 1", "Phone 1"]) {
      const field = page.getByRole("textbox", { name, exact: true });
      await field.focus();
      expect(await field.evaluate(element => {
        const r = element.getBoundingClientRect();
        return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === element;
      })).toBe(true);
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    expect((await axeInPage(page).withRules(["target-size"]).analyze()).violations).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: "dark" });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/settings");
    await page.getByRole("link", { name: /Personal preferences/ }).hover();
    expect((await axeInPage(page).withRules(["color-contrast"]).analyze()).violations).toEqual([]);
  }
});
