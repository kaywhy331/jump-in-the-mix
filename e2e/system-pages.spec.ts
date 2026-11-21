import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";
import { applyRenderedTheme } from "./theme-fixture";

// Help, legal, auth and system pages (JITM-UXB-02; audit M-07, M-09, M-12, M-13, E-19, E-20): the FAQ opens
// the linked question, Contact carries no policy date, the demo email grows with its text, every auth and
// system card leads with the logo and a heading that names its state, and signed-in members are sent on.
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block" });
test.setTimeout(240_000);

/** JITM-07 §5 widths on both sides of the boundaries a centered card or the demo passes. */
const WIDTHS = [320, 390, 767, 768, 834, 900, 901, 1099, 1100, 1199, 1200, 1279, 1280, 1440, 1920, 2560, 3110] as const;
const THEMES = ["light", "dark"] as const;
const UNUSED = "a".repeat(43);
const COMPANY = "Synthetic Painting";

/** Every auth or system card, signed out, with the heading that names its state. */
const CARDS: Array<[string, string]> = [
  ["/offline", "You’re offline"],
  ["/account/deleted", "Your Jump in the Mix account has been deleted."],
  ["/staff/accept", "This invitation link is incomplete"],
  [`/staff/accept?token=${UNUSED}`, "This invitation isn’t available"],
  ["/reset-password", "This reset link is incomplete"],
  ["/waitlist/confirm", "This confirmation link is incomplete"],
  ["/waitlist/leave", "Leave the waitlist"],
  ["/auth/magic", "Open your sign-in link again"],
  ["/verify-email/pending", "Verify your email"],
  ["/register", "An invitation from someone you know"],
  ["/register?invite=invalid", "This invitation isn’t available"],
  ["/login", "Welcome back"],
  ["/forgot-password", "Reset your password"],
  ["/waitlist", "Join the waitlist"],
  ["/signed-out", "You’re signed out"]
];

let userId: string, workspaceId: string, contactId: string;
const session = randomBytes(32).toString("base64url");
const expiredToken = randomBytes(32).toString("base64url");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `system-pages-${randomUUID()}@example.invalid`, name: "System pages owner", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "System pages", slug: randomUUID(), members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true, company: COMPANY, website: "https://example.com/contact" } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: hash(session), expiresAt: new Date(Date.now() + 3_600_000) } });
  contactId = (await prisma.contact.create({ data: { workspaceId, displayName: "Expired link person" } })).id;
  await prisma.reviewRequest.create({ data: { workspaceId, contactId, tokenHash: hash(expiredToken), expiresAt: new Date(Date.now() - 60_000) } });
});
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});
async function signIn(page: Page) {
  await page.context().addCookies([{ name: "jitm_session", value: session, url: process.env.APP_URL!, httpOnly: true, sameSite: "Strict" }]);
}
async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function noSidewaysScroll(page: Page, label: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${label}: no sideways scroll`).toBeLessThanOrEqual(1);
}
/** The card leads with the logo, has one H1, and each row of actions starts on the heading's left edge. */
async function expectCard(page: Page, heading: string, label: string) {
  const card = page.locator(".auth-card");
  await expect(card, label).toHaveCount(1);
  await expect(card.locator(":scope > :first-child"), `${label}: logo first`).toHaveClass(/\blogo\b/);
  await expect(card.locator(":scope > .logo"), label).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 }), label).toHaveText(heading);
  const edges = await card.evaluate(element => {
    const h1 = element.querySelector("h1")!.getBoundingClientRect().left;
    const rows = new Map<number, number>();
    for (const action of element.querySelectorAll(":scope > .button, :scope > form > .button, :scope > form > button")) {
      const box = action.getBoundingClientRect();
      const top = Math.round(box.top);
      rows.set(top, Math.min(rows.get(top) ?? Infinity, box.left));
    }
    return [...rows.values()].map(left => Math.round(left - h1));
  });
  for (const offset of edges) expect(Math.abs(offset), `${label}: action on the heading's leading edge`).toBeLessThanOrEqual(1);
}
/** A textarea that shows all of its text: no inner scrolling. */
async function showsAllText(area: Locator, label: string) {
  expect(await area.evaluate(element => element.scrollHeight - element.clientHeight), `${label}: no inner scroll`).toBeLessThanOrEqual(1);
}

test.describe("signed out", () => {
  test("every auth and system card leads with the logo and a heading that names its state (E-19, E-20)", async ({ page }) => {
    for (const [path, heading] of CARDS) {
      await page.goto(path);
      await expectCard(page, heading, path);
    }
  });

  test("the expired feedback link names the business and offers a way to reach it (M-13)", async ({ page }) => {
    await page.goto(`/review/${expiredToken}`);
    await expectCard(page, "This feedback link has expired", "expired review");
    await expect(page.getByText(`If there is anything ${COMPANY} should know, contact them directly. You can close this page.`)).toBeVisible();
    await expect(page.getByRole("link", { name: `Contact ${COMPANY}` })).toHaveAttribute("href", "https://example.com/contact");
    await page.goto(`/review/${randomBytes(32).toString("base64url")}`);
    await expectCard(page, "This feedback link has expired", "unknown review");
    await expect(page.getByText("Please contact the business directly if there is anything they should know. You can close this page.")).toBeVisible();
    await expect(page.locator(".auth-card .button")).toHaveCount(0);
  });

  test("links without a token offer one usable next step and no dead confirm action (E-20)", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByRole("button", { name: "Reset password" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Request a new reset link" })).toHaveCount(1);
    await page.goto("/waitlist/confirm");
    await expect(page.getByRole("button", { name: "Confirm waitlist request" })).toHaveCount(0);
    await page.getByRole("link", { name: "Join the waitlist" }).click();
    await expect(page).toHaveURL(/\/waitlist$/);
    await page.goto("/staff/accept");
    await expect(page.locator(".auth-card form")).toHaveCount(0);
    await page.keyboard.press("Tab");
    await expect(page.locator(".auth-card .logo")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Sign in to an existing account" })).toBeFocused();
  });

  test("cards fit every width, both themes, a sideways phone, 110% zoom and 200% text", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport matrix.");
    for (const path of ["/account/deleted", "/staff/accept", "/reset-password", "/waitlist/confirm", "/offline", `/review/${expiredToken}`]) {
      await page.goto(path);
      const heading = (await page.getByRole("heading", { level: 1 }).textContent())!;
      for (const theme of THEMES) {
        await applyRenderedTheme(page, theme, { width: 390, height: 900 });
        expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations, `${path} ${theme}`).toEqual([]);
      }
      await applyRenderedTheme(page, "light");
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await settle(page);
        await expectCard(page, heading, `${path} ${width}`);
        await noSidewaysScroll(page, `${path} ${width}`);
        const box = (await page.locator(".auth-card").boundingBox())!;
        expect(box.x, `${path} ${width}: inside the screen`).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, `${path} ${width}: inside the screen`).toBeLessThanOrEqual(width + 1);
      }
      for (const [width, height] of [[844, 390], [1280, 600]] as const) {
        await page.setViewportSize({ width, height });
        await settle(page);
        await expectCard(page, heading, `${path} ${width}x${height}`);
        await noSidewaysScroll(page, `${path} ${width}x${height}`);
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.evaluate(() => { document.documentElement.style.zoom = "1.1"; });
      await settle(page);
      await expectCard(page, heading, `${path} 110% zoom`);
      await noSidewaysScroll(page, `${path} 110% zoom`);
      await page.evaluate(() => { document.documentElement.style.zoom = ""; });
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await settle(page);
        await expectCard(page, heading, `${path} ${width} at 200% text`);
        await noSidewaysScroll(page, `${path} ${width} at 200% text`);
      }
    }
  });

  test("the FAQ opens the linked question on arrival, from another page and on the same page (M-07)", async ({ page }) => {
    await page.goto("/faq#your-data");
    const item = page.locator("#your-data");
    await expect(item).toHaveAttribute("open", "");
    await expect(item.locator("p")).toBeVisible();
    // Questions are set at least as large as the answers, 16px or more, at phone and desktop widths.
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const [question, answer] = await item.evaluate(element => [element.querySelector("summary")!, element.querySelector("p")!].map(node => parseFloat(getComputedStyle(node).fontSize)));
      expect(question, `${width}: question size`).toBeGreaterThanOrEqual(16);
      expect(question, `${width}: question at least the answer`).toBeGreaterThanOrEqual(answer);
    }
    // "Back to home" repeated the header; the logo and the nav remain.
    await expect(page.locator("main").getByRole("link", { name: "Back to home" })).toHaveCount(0);
    await expect(page.locator(".public-header").getByRole("link", { name: "Jump in the Mix home" })).toBeVisible();
    // The footer link on the same page opens it again after it was closed.
    await item.locator("summary").click();
    await expect(item).not.toHaveAttribute("open", "");
    await page.locator(".public-footer").getByRole("link", { name: "Your data", exact: true }).click();
    await expect(page).toHaveURL(/\/faq#your-data$/);
    await expect(item).toHaveAttribute("open", "");
    // Following the footer link from another page opens it too.
    await page.goto("/pricing");
    await page.locator(".public-footer").getByRole("link", { name: "Your data", exact: true }).click();
    await expect(page).toHaveURL(/\/faq#your-data$/);
    await expect(page.locator("#your-data")).toHaveAttribute("open", "");
    // Other questions stay closed, and a question still toggles from the keyboard.
    await expect(page.locator(".public-faq details[open]")).toHaveCount(1);
    await page.locator("#replies summary").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#replies")).toHaveAttribute("open", "");
  });

  test("Contact has no policy date, the policies keep theirs, and the operator line is unchanged (M-09)", async ({ page }) => {
    await page.goto("/contact");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Contact & support");
    await expect(page.locator(".public-document-date")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("Effective");
    // The legal entity name is the owner's to supply (OWNER INPUT NEEDED); the sentence is not reworded here.
    await expect(page.locator("main")).toContainText(`Jump in the Mix is operated by ${process.env.PUBLIC_OPERATOR_NAME}.`);
    for (const path of ["/privacy", "/terms", "/security"]) {
      await page.goto(path);
      await expect(page.locator(".public-document-date"), path).toContainText("Effective");
    }
  });

  test("the demo email shows its whole draft and grows as you type (M-12)", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-demo-beat="email"]').click();
    // Inactive Beats are inert, so the one draft textbox is the email's.
    const draft = page.locator("#sample").getByRole("textbox", { name: /^Message to / });
    await expect(draft).toBeEnabled();
    await expect(draft).toHaveValue(/\S/);
    for (const width of [320, 390, 767, 768, 1100, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await settle(page);
      await showsAllText(draft, `email draft ${width}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const before = (await draft.boundingBox())!.height;
    await draft.focus();
    await page.keyboard.press("ControlOrMeta+End");
    for (let line = 0; line < 6; line++) await page.keyboard.press("Enter");
    await page.keyboard.type("A longer sign-off line.");
    await settle(page);
    expect((await draft.boundingBox())!.height, "the draft grew with its text").toBeGreaterThan(before);
    await showsAllText(draft, "email draft after typing");
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await settle(page);
      await showsAllText(draft, `email draft ${width} at 200% text`);
      await noSidewaysScroll(page, `home ${width} at 200% text`);
    }
  });
  test("without field-sizing support the script fits the demo email instead (M-12)", async ({ page }) => {
    // As in a browser without field-sizing: content: the CSS rule does nothing and CSS.supports says so.
    await page.addInitScript(() => {
      const supports = CSS.supports.bind(CSS);
      CSS.supports = ((...args: [string, string?]) => args[0] === "field-sizing" ? false : supports(...(args as [string]))) as typeof CSS.supports;
      document.addEventListener("DOMContentLoaded", () => document.head.append(Object.assign(document.createElement("style"), { textContent: "#sample textarea { field-sizing: fixed !important; }" })));
    });
    await page.goto("/");
    await page.locator('[data-demo-beat="email"]').click();
    const draft = page.locator("#sample").getByRole("textbox", { name: /^Message to / });
    await expect(draft).toBeEnabled();
    expect(await draft.evaluate(element => getComputedStyle(element).getPropertyValue("field-sizing"))).toBe("fixed");
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await settle(page);
      await showsAllText(draft, `fallback email draft ${width}`);
    }
    await draft.focus();
    await page.keyboard.press("ControlOrMeta+End");
    for (let line = 0; line < 6; line++) await page.keyboard.press("Enter");
    await settle(page);
    await showsAllText(draft, "fallback email draft after typing");
  });
});

test.describe("signed in", () => {
  test.beforeEach(async ({ page }) => signIn(page));

  test("sign-up, verification and deletion pages send a member to Today (M-13)", async ({ page }) => {
    for (const path of ["/register", `/register?invite=${UNUSED}`, "/verify-email/pending", "/verify-email/pending?email=member%40example.invalid", "/account/deleted"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/jumps(\?|$)/);
    }
  });

  test("token and system pages still name their state, and public pages offer Open Today", async ({ page }) => {
    for (const [path, heading] of [["/staff/accept", "This invitation link is incomplete"], ["/reset-password", "This reset link is incomplete"], ["/waitlist/confirm", "This confirmation link is incomplete"], ["/offline", "You’re offline"], [`/review/${expiredToken}`, "This feedback link has expired"]] as const) {
      await page.goto(path);
      await expectCard(page, heading, `${path} signed in`);
    }
    for (const path of ["/faq", "/contact", "/privacy"]) {
      await page.goto(path);
      // The header and the phone Explore menu each offer Open Today, and neither offers Sign in.
      await expect(page.locator('.public-header a[href="/jumps"]'), path).toHaveCount(2);
      await expect(page.locator('.public-header a[href="/login"]'), path).toHaveCount(0);
    }
  });
});
