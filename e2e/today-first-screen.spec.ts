import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";

// Today on a phone opens on the work, and Review answers a tap at once (JITM-UXA-02, audit P-01 and A-01).
const database = new URL(process.env.DATABASE_URL ?? "postgresql://localhost/unknown");
test.skip(!["localhost", "127.0.0.1"].includes(database.hostname) || !database.pathname.startsWith("/jitm_design_"), "Disposable local fixtures only");

const PHONE = { width: 375, height: 667 };
const DUE_CARDS = '[data-today-section="overdue"] article.jump-card, [data-today-section="today"] article.jump-card';
const REVIEW = ".sheet-trigger > [data-review-trigger]";

let cookies: Awaited<ReturnType<import("@playwright/test").BrowserContext["cookies"]>>;
let fixtureId: string;
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("demo@jumpinthemix.local");
  await page.getByLabel("Password", { exact: true }).fill("JumpInTheMix123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/jumps/);
  cookies = await context.cookies();
  await context.close();
  // The seeded follow-ups may have been worked by earlier suites; one more due today keeps a card to act on.
  fixtureId = `first-screen-${randomUUID()}`;
  const step = await prisma.mixStep.findFirstOrThrow({ where: { mix: { workspaceId: "demo_workspace", status: "ACTIVE" }, isActive: true, stepVersion: { stepTemplate: { channel: "SMS" } } } });
  await prisma.contact.create({ data: { id: fixtureId, workspaceId: "demo_workspace", firstName: "Screen", displayName: "Screen Fixture", phones: { create: { phone: "+14155550199", normalized: "14155550199", isPrimary: true } } } });
  await prisma.jump.create({ data: { id: fixtureId, workspaceId: "demo_workspace", contactId: fixtureId, mixId: step.mixId, mixStepId: step.id, stepVersionId: step.stepVersionId, scheduledAt: new Date(), status: "PENDING", reason: "Check in", uniquenessKey: fixtureId, templateSnapshot: { channel: "SMS", body: "Hi {{First Name}}, checking in." }, renderedSnapshot: { body: "Hi Screen, checking in." } } });
});
test.afterAll(async () => {
  if (!fixtureId) return;
  await prisma.jump.deleteMany({ where: { id: fixtureId } });
  await prisma.contact.deleteMany({ where: { id: fixtureId } });
});
test.beforeEach(async ({ context }) => { await context.addCookies(cookies); });

async function openToday(page: Page) {
  await page.goto("/jumps");
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "", { timeout: 60_000 });
  await expect(page.locator(DUE_CARDS).first()).toBeVisible();
}

/** The review trigger of the first due card, once its tap handler is attached. */
async function firstReview(page: Page) {
  const trigger = page.locator(DUE_CARDS).first().locator(REVIEW);
  await expect.poll(() => trigger.evaluate(element => Object.keys(element.parentElement!).some(key => key.startsWith("__reactProps")))).toBe(true);
  return trigger;
}

/** What sits above the work: Next only for work the list doesn't show, Needs review only with an inquiry waiting. */
async function firstScreenFacts(page: Page) {
  return page.evaluate(selector => {
    const listed = new Set([...document.querySelectorAll<HTMLElement>("[data-today-section] [data-jump-workflow]")].map(element => element.dataset.jumpWorkflow));
    const nextHref = document.querySelector<HTMLAnchorElement>('[data-next-action-state] .contact-next-description[data-next-action-kind="follow-up"] ~ a')?.getAttribute("href") ?? null;
    const nextJump = nextHref ? new URL(nextHref, location.href).searchParams.get("jump") : null;
    const card = document.querySelector(selector)!.getBoundingClientRect();
    return {
      cardTop: card.top, viewport: innerHeight,
      nextRepeatsACard: Boolean(nextJump && listed.has(nextJump)),
      emptyNeedsReview: [...document.querySelectorAll<HTMLElement>(".needs-review-entry")].some(element => element.dataset.reviewCount === "0"),
      sideways: document.documentElement.scrollWidth > innerWidth + 1
    };
  }, DUE_CARDS);
}

test("at 375x667 the first follow-up card starts on the first screen, with nothing above it repeated or empty", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await openToday(page);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const facts = await firstScreenFacts(page);
  expect(facts.cardTop).toBeGreaterThanOrEqual(0);
  expect(facts.cardTop).toBeLessThan(facts.viewport);
  expect(facts).toMatchObject({ nextRepeatsACard: false, emptyNeedsReview: false, sideways: false });
  // S4's headline and category line stay first (JITM-05 §4).
  await expect(page.locator(".today-page-header p").first()).toHaveText(/(follow-up|action)s? needs? your attention/);
  await expect(page.locator(".today-work-categories")).toBeVisible();
  // A bare "Review" means one thing on Today: open a follow-up's review. Other actions say what they do (JITM-10 §2.14).
  const bare = page.locator("a:visible, button:visible").filter({ hasText: /^\s*Review\s*$/ });
  for (const control of await bare.all()) {
    expect(await control.evaluate(element => element.matches("[data-review-trigger]") || /^\/jumps\?jump=/.test(element.getAttribute("href") ?? ""))).toBe(true);
  }
  for (const control of await page.locator(`${REVIEW}:visible`).all()) await expect(control).toHaveAccessibleName(/^Review (message|call) for /);
});

test("Review looks pressed at once and opens its review within 300 ms while every request is slow", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await openToday(page);
  const trigger = await firstReview(page);
  const resting = await trigger.evaluate(element => getComputedStyle(element).backgroundColor);
  // From here every request waits 3 seconds, so a review that needed the server could not open in time.
  let slowed = 0;
  await page.route("**/*", async route => { slowed++; await new Promise(resolve => setTimeout(resolve, 3_000)); await route.continue().catch(() => undefined); });
  try {
    const box = (await trigger.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    expect(await trigger.evaluate(element => element.matches(":active"))).toBe(true);
    expect(await trigger.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(resting);
    await page.evaluate(() => {
      const card = document.querySelector('[data-today-section="overdue"] article.jump-card, [data-today-section="today"] article.jump-card')!;
      (window as unknown as { reviewOpened: Promise<number> }).reviewOpened = new Promise(resolve => {
        document.addEventListener("click", () => {
          const tapped = performance.now();
          const check = () => card.querySelector(".follow-up-review-sheet[open]") ? resolve(performance.now() - tapped) : requestAnimationFrame(check);
          check();
        }, { capture: true, once: true });
      });
    });
    await page.mouse.up();
    const elapsed = await page.evaluate(() => (window as unknown as { reviewOpened: Promise<number> }).reviewOpened);
    test.info().annotations.push({ type: "review-open-ms", description: `${Math.round(elapsed)} ms; requests held meanwhile: ${slowed}` });
    expect(elapsed).toBeLessThan(300);
    await expect(page.locator(DUE_CARDS).first().locator(".follow-up-review-sheet[open]")).toBeVisible();
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
});

test("the No Mix line sits below the due list and names where it leads", async ({ page }) => {
  const id = `first-screen-no-mix-${randomUUID()}`;
  await prisma.contact.create({ data: { id, workspaceId: "demo_workspace", firstName: "Unplaced", displayName: "Unplaced Fixture" } });
  try {
    await page.setViewportSize(PHONE);
    await openToday(page);
    const line = page.locator(".today-no-mix-line");
    await expect(line.getByRole("link", { name: "Add to a Mix", exact: true })).toHaveAttribute("href", "/contacts?mix=no-mix");
    // After the due sections and before Next 7 days (JITM-09 §2.24).
    expect(await page.evaluate(() => {
      const due = [...document.querySelectorAll('[data-today-section="overdue"], [data-today-section="today"]')].at(-1)!;
      const line = document.querySelector(".today-no-mix-line")!, upcoming = document.querySelector('[data-today-section="upcoming"]')!;
      return [Boolean(due.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING), Boolean(line.compareDocumentPosition(upcoming) & Node.DOCUMENT_POSITION_FOLLOWING)];
    })).toEqual([true, true]);
  } finally {
    await prisma.contact.deleteMany({ where: { id } });
  }
});

test("at 320 px with 200% text the first follow-up stays reachable by touch and keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openToday(page);
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await page.evaluate(() => document.fonts.ready);
  const facts = await firstScreenFacts(page);
  expect(facts).toMatchObject({ nextRepeatsACard: false, emptyNeedsReview: false, sideways: false });
  const trigger = await firstReview(page);
  await trigger.scrollIntoViewIfNeeded();
  const box = (await trigger.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.x + box.width).toBeLessThanOrEqual(320 + 1);
  await trigger.focus();
  await page.keyboard.press("Enter");
  const sheet = page.locator(DUE_CARDS).first().locator(".follow-up-review-sheet[open]");
  await expect(sheet).toBeVisible();
  const panel = (await sheet.locator(".sheet-panel").boundingBox())!;
  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(320 + 1);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
