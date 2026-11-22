import { createHash, randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { applyRenderedTheme } from "./theme-fixture";

// Form and settings details (JITM-UXB-06; audit A-09, A-23, A-24): Add contact names its either-or group once,
// keeps "optional" beside every label and puts each "+ Add" under its fields; the Lead sources option cards line
// up and say what an integration does; Add from your phone leads with the contact card on iPhone.
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block" });
test.setTimeout(240_000);

/** JITM-07 §5 widths on both sides of each layout boundary, plus wide screens. */
const WIDTHS = [320, 390, 767, 768, 834, 900, 901, 1099, 1100, 1194, 1199, 1200, 1279, 1280, 1440, 1599, 1600, 1699, 1700, 1920, 2560, 3440] as const;
/** The screenshot review sizes. */
const REVIEW = [375, 1440] as const;
const THEMES = ["light", "dark"] as const;
/** "optional" follows its label's text by about a space: at most this share of the label's font size. */
const OPTIONAL_GAP_EM = 0.6;
/** Lead sources' cards sit side by side above this width (src/styles/product.css). */
const ONE_COLUMN_MAX = 720;
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const COMPUTER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const GROUP_RULE = "Add at least one: name, company, phone or email.";
const INTEGRATION = "An integration sends each new inquiry from a tool you already use, such as your website or another CRM, here automatically.";

let workspaceId: string, userId: string;
const token = randomUUID();
test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `form-details-${randomUUID()}@example.invalid`, name: "Form details owner", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Form details", slug: randomUUID(), members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true, onboardingStep: 5 } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
});
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});
async function signIn(page: Page) {
  await page.context().addCookies([{ name: "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, sameSite: "Strict" }]);
}
const ready = (page: Page) => expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");
async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function noSidewaysScroll(page: Page, label: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${label}: no sideways scroll`).toBeLessThanOrEqual(1);
}
async function axe(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations, `${label}: ${results.violations.map(violation => `${violation.id}: ${violation.help}`).join("\n")}`).toEqual([]);
}
/** Both themes at the review sizes, with a screenshot of each for the record. */
async function review(page: Page, testInfo: TestInfo, name: string, check: (label: string) => Promise<void>) {
  for (const theme of THEMES) for (const width of REVIEW) {
    await applyRenderedTheme(page, theme, { width, height: 900 });
    await check(`${name} ${theme} ${width}`);
    await page.screenshot({ path: testInfo.outputPath(`${name}-${theme}-${width}.png`), fullPage: true });
  }
  await applyRenderedTheme(page, "light", { width: 1440, height: 900 });
}
/** The JITM-07 §5 matrix: every width, a sideways phone, a short laptop, 110% zoom, and 200% text at a phone and a desktop width. */
async function atEveryWidth(page: Page, name: string, check: (label: string) => Promise<void>) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await settle(page);
    await check(`${name} ${width}`);
    await noSidewaysScroll(page, `${name} ${width}`);
  }
  for (const [width, height] of [[844, 390], [1280, 600]] as const) {
    await page.setViewportSize({ width, height });
    await settle(page);
    await check(`${name} ${width}x${height}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = "1.1"; });
  await settle(page);
  await check(`${name} 1440 at 110% zoom`);
  await page.evaluate(() => { document.documentElement.style.zoom = ""; });
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await settle(page);
    await check(`${name} ${width} at 200% text`);
    await noSidewaysScroll(page, `${name} ${width} at 200% text`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

/** Add contact's layout: "optional" beside its label's text, each "+ Add" under its own fields, Dictate under Message context. */
async function expectAddContactLayout(page: Page, label: string) {
  const layout = await page.evaluate(() => {
    const box = (element: Element) => element.getBoundingClientRect();
    const optional = [...document.querySelectorAll<HTMLElement>(".contact-editor label small, .contact-editor .field > span small")]
      .filter(small => /^optional/.test(small.textContent ?? "") && small.getClientRects().length)
      .map(small => {
        const owner = small.parentElement!;
        const text = [...owner.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent!.trim())!;
        const range = document.createRange(); range.selectNodeContents(text);
        const lines = [...range.getClientRects()], end = lines[lines.length - 1], start = small.getClientRects()[0];
        const sameLine = Math.abs(start.top - end.top) < end.height / 2;
        return { label: text.textContent!.trim(), sameLine, gapEm: (start.left - end.right) / parseFloat(getComputedStyle(owner).fontSize), wrappedLeft: start.left - box(owner).left };
      });
    const add = (kind: "phone" | "email") => {
      const inputs = [...document.querySelectorAll<HTMLInputElement>(`input[id^="quick-${kind}-"]`)], last = inputs[inputs.length - 1];
      const button = [...document.querySelectorAll("button")].find(item => item.textContent === `+ Add ${kind}`)!;
      return { count: inputs.length, below: box(button).top - box(last).bottom, left: box(button).left - box(last).left, sameCollection: button.parentElement === last.closest(".field")?.parentElement, bottom: box(button).bottom, column: box(last).left, top: box(last).top };
    };
    const notes = document.getElementById("publicNotes")!, field = notes.closest(".field")!, dictate = field.querySelector(".voice-note-control")!;
    const notesLabel = field.querySelector("label")!;
    const email = document.getElementById("quick-email-0")!.closest(".field")!;
    return {
      optional, phone: add("phone"), email: add("email"), emailTop: box(email).top, emailLeft: box(email).left,
      notesTop: box(notes).top, dictate: { below: box(dictate).top - box(notes).bottom, left: box(dictate).left - box(notes).left }, labelWidth: box(notesLabel).width - box(notes).width,
      groupOptional: [...document.querySelectorAll(".contact-identity small")].filter(small => /optional/.test(small.textContent ?? "")).length
    };
  });
  expect(layout.optional.length, `${label}: the optional fields are marked`).toBeGreaterThan(0);
  for (const item of layout.optional) {
    if (item.sameLine) expect(item.gapEm, `${label}: "optional" sits beside "${item.label}"`).toBeLessThanOrEqual(OPTIONAL_GAP_EM);
    else expect(Math.abs(item.wrappedLeft), `${label}: a wrapped "optional" starts under "${item.label}"`).toBeLessThanOrEqual(1);
  }
  expect(layout.groupOptional, `${label}: no field of the either-or group is marked optional`).toBe(0);
  for (const kind of ["phone", "email"] as const) {
    const add = layout[kind];
    expect(add.sameCollection, `${label}: "+ Add ${kind}" belongs to the ${kind} fields`).toBe(true);
    expect(add.below, `${label}: "+ Add ${kind}" is under the last ${kind} field`).toBeGreaterThanOrEqual(0);
    expect(Math.abs(add.left), `${label}: "+ Add ${kind}" starts at the ${kind} field's edge`).toBeLessThanOrEqual(1);
    expect(add.bottom, `${label}: "+ Add ${kind}" is above Message context`).toBeLessThan(layout.notesTop);
  }
  // In one column the email fields follow "+ Add phone"; in two they sit beside the phone fields.
  if (Math.abs(layout.emailLeft - layout.phone.column) <= 1) expect(layout.phone.bottom, `${label}: "+ Add phone" is above Email`).toBeLessThanOrEqual(layout.emailTop);
  else expect(Math.abs(layout.email.top - layout.phone.top), `${label}: Phone and Email share a row`).toBeLessThanOrEqual(1);
  expect(layout.dictate.below, `${label}: Dictate is under Message context`).toBeGreaterThanOrEqual(0);
  expect(Math.abs(layout.dictate.left), `${label}: Dictate starts at the field's edge`).toBeLessThanOrEqual(1);
  expect(layout.labelWidth, `${label}: Message context's label keeps the field's full width`).toBeGreaterThanOrEqual(-1);
}

test.describe("Add contact", () => {
  test("names its either-or group once, marks optional fields the same way, and keeps each + Add under its fields", async ({ page }, testInfo) => {
    await signIn(page);
    await page.goto("/contacts/new"); await ready(page);
    const group = page.getByRole("group", { name: GROUP_RULE, exact: true });
    await expect(group).toBeVisible();
    await expect(page.getByText("Everything is required unless marked optional.", { exact: true })).toHaveCount(0);
    for (const field of ["First name", "Last name", "Company", "Phone", "Email"]) await expect(group.getByLabel(field, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Add another/ })).toHaveCount(0);
    await review(page, testInfo, "add-contact", async label => { await expectAddContactLayout(page, label); await axe(page, label); });
    if (testInfo.project.name === "desktop-chromium") await atEveryWidth(page, "add-contact", label => expectAddContactLayout(page, label));

    // By keyboard: the group in reading order, each + Add right after its fields, and adding moves into the new field.
    await page.goto("/contacts/new"); await ready(page);
    await page.getByLabel("First name", { exact: true }).focus();
    const stops: string[] = [];
    for (let index = 0; index < 6; index++) {
      await page.keyboard.press("Tab");
      stops.push(await page.evaluate(() => { const active = document.activeElement as HTMLElement; return active.id || active.textContent || ""; }));
    }
    expect(stops).toEqual(["lastName", "company", "quick-phone-0", "+ Add phone", "quick-email-0", "+ Add email"]);
    await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("button", { name: "+ Add phone", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Phone 2", { exact: true })).toBeFocused();
    await page.getByRole("button", { name: "+ Add email", exact: true }).click();
    await expect(page.getByLabel("Email 2", { exact: true })).toBeFocused();
    await review(page, testInfo, "add-contact-extra-rows", label => expectAddContactLayout(page, label));
  });
});

/** Lead sources' two option cards: side by side they share a top edge, a height and their buttons' line; stacked, a width. */
async function expectLeadCardsAligned(page: Page, label: string) {
  const cards = await page.locator(".connection-paths > .card").evaluateAll(elements => elements.map(element => {
    const card = element.getBoundingClientRect(), button = element.querySelector(".button")!.getBoundingClientRect();
    return { top: card.top, bottom: card.bottom, left: card.left, width: card.width, height: card.height, button: button.bottom };
  }));
  expect(cards, `${label}: two option cards`).toHaveLength(2);
  const [form, source] = cards;
  const wide = await page.evaluate(max => window.matchMedia(`(min-width: ${max + 1}px)`).matches, ONE_COLUMN_MAX);
  if (wide) {
    expect(Math.abs(source.top - form.top), `${label}: cards share a top edge`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(source.height - form.height), `${label}: cards share a height`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(source.button - form.button), `${label}: buttons share a line`).toBeLessThanOrEqual(0.5);
  } else {
    expect(Math.abs(source.left - form.left), `${label}: stacked cards share a left edge`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(source.width - form.width), `${label}: stacked cards share a width`).toBeLessThanOrEqual(0.5);
    expect(source.top, `${label}: stacked cards don't overlap`).toBeGreaterThanOrEqual(form.bottom);
  }
}

test.describe("Lead sources", () => {
  test("lines up its option cards, says what an integration does, and leaves contact import to Contacts", async ({ page }, testInfo) => {
    await signIn(page);
    await page.goto("/settings/connections"); await ready(page);
    await expect(page.getByRole("heading", { level: 1, name: "Lead sources" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Import CSV or vCard" })).toHaveCount(0);
    await expect(page.locator(".page-header a, .page-header button")).toHaveCount(0);
    const source = page.locator(".connection-paths > .card", { has: page.getByRole("heading", { level: 2, name: "Connect an existing source" }) });
    await expect(source.getByText(INTEGRATION, { exact: false })).toBeVisible();
    // Importing a file stays one tap away, in context, from the source guide.
    await expect(page.locator("#source-guide a[href='/contacts/import']")).toHaveText("Import contacts");
    await review(page, testInfo, "lead-sources", async label => { await expectLeadCardsAligned(page, label); await axe(page, label); });
    if (testInfo.project.name === "desktop-chromium") await atEveryWidth(page, "lead-sources", label => expectLeadCardsAligned(page, label));
    // Contacts has its own Import.
    await page.goto("/contacts"); await ready(page);
    await expect(page.locator(".contacts-page-header a[href='/contacts/import']")).toHaveCount(1);
  });
});

/** The visible level-2 headings of Add from your phone, in reading order (a closed sheet's title is not one). */
const sections = (page: Page) => page.locator("main h2:visible").allInnerTexts();

test.describe("Add from your phone on iPhone", () => {
  test.use({ userAgent: IPHONE });
  test("leads with saving a contact card and keeps the Shortcut as the advanced way", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "The user agent decides the content; one layout is enough.");
    await signIn(page);
    await page.goto("/contacts/from-phone?setup=shortcut"); await ready(page);
    expect(await sections(page)).toEqual(["Save a contact card", "Advanced: add with a Shortcut"]);
    const card = page.getByRole("region", { name: "Save a contact card", exact: true });
    await expect(card.getByText("There's nothing to set up.", { exact: true })).toBeVisible();
    await expect(card.getByRole("link", { name: "Import contacts", exact: true })).toHaveAttribute("href", "/contacts/import");
    const shortcut = page.getByRole("region", { name: "Advanced: add with a Shortcut", exact: true });
    await expect(shortcut.getByRole("button", { name: "Make my key" })).toBeVisible();
    // The tips finish the simple way first, and name the Shortcut only as the alternative.
    await card.getByRole("button", { name: "Tips for adding on iPhone" }).click();
    const tips = page.getByRole("dialog", { name: "Tips for adding on iPhone" });
    await expect(tips.getByRole("listitem").filter({ hasText: "Save to Files" })).toHaveCount(2);
    await expect(tips.getByText("Added the Shortcut? Tap Add to Jump in the Mix instead of Save to Files.", { exact: false })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tips).toBeHidden();
    for (const theme of THEMES) {
      await applyRenderedTheme(page, theme, { width: 375, height: 844 });
      await axe(page, `from-phone iPhone ${theme}`);
      await noSidewaysScroll(page, `from-phone iPhone ${theme}`);
      await page.screenshot({ path: testInfo.outputPath(`from-phone-iphone-${theme}-375.png`), fullPage: true });
    }
    // Without the Shortcut the contact card is the whole page.
    await page.goto("/contacts/from-phone"); await ready(page);
    test.skip(Boolean(process.env.IPHONE_CONTACTS_SHORTCUT_URL), "A configured Shortcut link always offers it.");
    expect(await sections(page)).toEqual(["Save a contact card"]);
  });
});

test.describe("Add from your phone on a computer", () => {
  test.use({ userAgent: COMPUTER });
  test("shows Android first, then the iPhone contact card, then the advanced Shortcut", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "The user agent decides the content; one layout is enough.");
    await signIn(page);
    await page.goto("/contacts/from-phone?setup=shortcut"); await ready(page);
    expect(await sections(page)).toEqual(["On Android", "On iPhone: save a contact card", "On iPhone, advanced: add with a Shortcut"]);
    await expect(page.getByRole("region", { name: "On iPhone: save a contact card", exact: true }).getByRole("button", { name: "Tips for adding on iPhone" })).toBeVisible();
    for (const theme of THEMES) {
      await applyRenderedTheme(page, theme, { width: 1440, height: 900 });
      await axe(page, `from-phone computer ${theme}`);
      await page.screenshot({ path: testInfo.outputPath(`from-phone-computer-${theme}-1440.png`), fullPage: true });
    }
  });
});
