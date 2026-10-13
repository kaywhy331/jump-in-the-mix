import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";

// Placing people in Mixes in bulk is visible on the Contacts list (JITM-09 §2.81, D76): a Select control beside the
// list's tools, a strip on the No Mix filter with "Add these 3 to a Mix" (the count of the page's people, D89) and "Mark No Mix needed", and Add to a Mix
// as the main bulk action.
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Disposable local database only");
test.use({ screenshot: "off", video: "off", trace: "off" });
test.setTimeout(120_000);
let workspaceId: string, userId: string, mixId: string;
const token = randomUUID(), suffix = randomUUID();
const names = ["Avery Ames", "Blake Brook", "Casey Cole"];
test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `bulk-placement-${suffix}@example.com`, name: "Bulk owner", passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: `bulk-placement-${suffix}`, name: "Bulk placement fixture", members: { create: { userId } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  const text = await prisma.stepVersion.create({ data: { stepTemplate: { create: { workspaceId, name: "Check in", channel: "SMS" } }, version: 1, body: "Hi {{First Name}}, checking in." } });
  // Two Mixes, so an unchosen Mix can't pass for the alphabetically first one.
  mixId = (await prisma.mix.create({ data: { workspaceId, name: "Estimate follow-up", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: [{ stepVersionId: text.id, dayOffset: 0, sortOrder: 1 }] } } })).id;
  await prisma.mix.create({ data: { workspaceId, name: "After the job", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: [{ stepVersionId: text.id, dayOffset: 0, sortOrder: 1 }] } } });
  for (const [index, name] of names.entries()) await prisma.contact.create({ data: { workspaceId, displayName: name, firstName: name.split(" ")[0], phones: { create: { phone: `+1555010${4700 + index}`, normalized: `+1555010${4700 + index}`, isPrimary: true } } } });
});
test.beforeEach(async ({ context }) => {
  await prisma.mixAssignment.deleteMany({ where: { workspaceId } });
  await prisma.jump.deleteMany({ where: { workspaceId } });
  await prisma.contactRelationshipState.deleteMany({ where: { workspaceId } });
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
});
test.afterAll(async () => {
  if (workspaceId) { await prisma.job.deleteMany({ where: { workspaceId } }); await prisma.workspace.deleteMany({ where: { id: workspaceId } }); }
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});
async function ready(page: Page) { await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "", { timeout: 60_000 }); }
const bar = (page: Page) => page.getByRole("complementary", { name: "Actions for selected contacts" });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Add 3 people to a Mix" });

test("Select beside the list's tools enters selection, and Done leaves it", async ({ page }) => {
  await page.goto("/contacts"); await ready(page);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Select Avery Ames", exact: true })).toBeVisible();
  // While selecting, the name is no link: a tap on it or anywhere else on the row ticks the person, and Space on the
  // checkbox does too (D90).
  await expect(page.getByRole("link", { name: "Avery Ames", exact: true })).toHaveCount(0);
  // Scoped to the list: the profile docked beside it shows the same name as its heading.
  await page.getByLabel("Contact directory").getByText("Avery Ames", { exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Deselect Avery Ames", exact: true })).toBeChecked();
  await page.locator(".contact-select-row").filter({ hasText: "Avery Ames" }).locator(".avatar").click();
  await expect(page.getByRole("checkbox", { name: "Select Avery Ames", exact: true })).not.toBeChecked();
  await page.getByRole("checkbox", { name: "Select Avery Ames", exact: true }).press("Space");
  await expect(page.getByRole("checkbox", { name: "Deselect Avery Ames", exact: true })).toBeChecked();
  expect(new URL(page.url()).pathname).toBe("/contacts");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /Select Avery Ames/ })).toBeHidden();
  await expect(page.getByRole("link", { name: "Avery Ames", exact: true })).toBeVisible();
  await expect(bar(page)).toHaveCount(0);
});

test("the No Mix strip selects this page and opens Add to a Mix, with no Mix chosen for the owner", async ({ page }) => {
  await page.goto("/contacts?mix=no-mix"); await ready(page);
  const strip = page.getByRole("group", { name: "3 people have No Mix." });
  await expect(strip).toBeVisible();
  await strip.getByRole("button", { name: "Add these 3 to a Mix", exact: true }).click();
  await expect(sheet(page)).toBeVisible();
  const choose = sheet(page).getByRole("combobox", { name: "Choose a Mix", exact: true });
  await expect(choose).toHaveValue("");
  for (const name of names) await expect(page.getByRole("checkbox", { name: `Deselect ${name}`, exact: true })).toBeChecked();
  await choose.selectOption(mixId);
  await sheet(page).getByRole("button", { name: "Add to the Mix", exact: true }).click();
  await expect.poll(() => prisma.mixAssignment.count({ where: { workspaceId, mixId, isActive: true } })).toBe(3);
});

test("the strip names one person as one, and stays away while choosing people, so a tick never moves the list", async ({ page }) => {
  await page.goto("/contacts?mix=no-mix&q=Avery"); await ready(page);
  await expect(page.getByRole("group", { name: "1 person has No Mix." }).getByRole("button", { name: "Add this person to a Mix", exact: true })).toBeVisible();
  await expect(page.locator(".contact-list-summary > span").first()).toHaveText("1 person");
  await page.goto("/contacts?mix=no-mix"); await ready(page);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await expect(page.getByRole("group", { name: /have No Mix/ })).toHaveCount(0);
  const row = page.getByRole("checkbox", { name: "Select Blake Brook", exact: true });
  const before = (await row.boundingBox())!.y;
  await page.getByRole("checkbox", { name: "Select Avery Ames", exact: true }).check();
  expect((await page.getByRole("checkbox", { name: "Select Blake Brook", exact: true }).boundingBox())!.y).toBe(before);
});

test("lists for choosing one person, for a note or a date, offer no Select and no strip", async ({ page }) => {
  for (const intent of ["log-note", "important-date"]) {
    await page.goto(`/contacts?intent=${intent}&mix=no-mix`); await ready(page);
    await expect(page.getByRole("link", { name: "Avery Ames", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Select", exact: true }), intent).toHaveCount(0);
    await expect(page.getByRole("group", { name: /have No Mix/ }), intent).toHaveCount(0);
    await page.getByRole("button", { name: "More contact tools", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Contact tools", exact: true }).getByRole("button", { name: "Select contacts", exact: true }), intent).toHaveCount(0);
  }
});

test("Mark No Mix needed from the strip lands on that choice in the sheet", async ({ page }) => {
  await page.goto("/contacts?mix=no-mix"); await ready(page);
  await page.getByRole("button", { name: "Mark No Mix needed", exact: true }).click();
  // The sheet opens on its heading, as every sheet does, with Mark No Mix needed in view (D91, JITM-08 §2.12).
  await expect(sheet(page).getByRole("heading", { name: "Add 3 people to a Mix" })).toBeFocused();
  const confirm = sheet(page).getByRole("button", { name: "Mark No Mix needed", exact: true });
  await expect(confirm).toBeInViewport();
  await Promise.all([page.waitForURL(/noMixNeeded=3/), confirm.click()]);
  await expect(page.getByRole("group", { name: /have No Mix/ })).toHaveCount(0);
});

/** The bar's actions: names, sizes, gaps to the next one on the same row, whether each label fits its button, how far
 * anything reaches past the layout's width, and any height the actions take beyond their buttons. */
async function barReading(page: Page) {
  return bar(page).evaluate(element => {
    const buttons = [...element.querySelectorAll<HTMLElement>(".bulk-actions > :not(dialog)")].map(item => item.matches("button") ? item : item.querySelector<HTMLElement>("button")!).filter(Boolean);
    const boxes = buttons.map(button => button.getBoundingClientRect());
    const gaps = boxes.slice(1).map((box, index) => Math.abs(box.top - boxes[index].top) < 1 ? box.left - boxes[index].right : 99);
    const misfit = [...buttons.filter(button => { const label = button.querySelector<HTMLElement>(".bulk-action-label"); return !label || !label.getBoundingClientRect().width || label.scrollWidth > button.clientWidth + 0.5; }).map(button => button.getAttribute("aria-label")),
      ...[...element.querySelectorAll<HTMLElement>(".bulk-selection-count .text-button")].filter(button => button.scrollWidth > button.clientWidth + 0.5).map(button => button.textContent)];
    const reach = Math.max(...[...element.querySelectorAll<HTMLElement>("button, strong")].filter(item => item.getClientRects().length).map(item => item.getBoundingClientRect().right)) - document.documentElement.clientWidth;
    const slack = element.querySelector(".bulk-actions")!.getBoundingClientRect().height - (Math.max(...boxes.map(box => box.bottom)) - Math.min(...boxes.map(box => box.top)));
    return { first: buttons[0]?.getAttribute("aria-label"), primary: buttons[0]?.classList.contains("primary"), misfit, smallest: Math.min(...boxes.map(box => Math.min(box.width, box.height))), gap: Math.min(...gaps), reach: Math.round(reach), slack: Math.round(slack) };
  });
}

test("Add to a Mix comes first in the bar, labeled and spaced at every width and at 200% text, and the page buttons stay clear of it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Widths are set directly.");
  await page.goto("/contacts"); await ready(page);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  for (const name of names) await page.getByRole("checkbox", { name: `Select ${name}`, exact: true }).check();
  const problems: string[] = [];
  for (const text of ["100%", "200%"]) {
    if (text === "200%") await page.addStyleTag({ content: "html { font-size: 200% !important }" });
    for (const width of text === "100%" ? [320, 390, 768, 900, 901, 1024, 1280, 1440] : [320, 390]) {
      await page.setViewportSize({ width, height: text === "100%" ? 600 : 800 });
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const reading = await barReading(page);
      if (reading.first !== "Add to a Mix" || !reading.primary || reading.misfit.length || reading.smallest < 44 || (width <= 900 && reading.gap < 8) || reading.reach > 0 || reading.slack > 1) problems.push(`${width} ${text}: ${JSON.stringify(reading)}`);
      // Scrolled to the end, the last person and the page buttons sit above the bar. The page scrolls smoothly, so jump there at once.
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
      const edges = await page.evaluate(() => { const rows = document.querySelectorAll(".contact-row"); return { last: Math.round(rows[rows.length - 1]!.getBoundingClientRect().bottom), pages: Math.round(document.querySelector(".pagination-bar")!.getBoundingClientRect().bottom), bar: Math.round(document.querySelector(".bulk-contact-bar")!.getBoundingClientRect().top) }; });
      if (edges.last > edges.bar || edges.pages > edges.bar) problems.push(`${width} ${text}: the bar covers the list ${JSON.stringify(edges)}`);
    }
  }
  expect(problems).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addStyleTag({ content: "html { font-size: 100% !important }" });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    const audit = await axeInPage(page).include(".bulk-contact-bar").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(audit.violations.map(item => item.id), theme).toEqual([]);
  }
});

test("the list's summary keeps its controls 44px tall and 8px apart on narrow phones", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Widths are set directly.");
  await page.goto("/contacts"); await ready(page);
  for (const width of [320, 360, 375, 390]) {
    await page.setViewportSize({ width, height: 700 });
    const reading = await page.locator(".contact-list-summary").evaluate(element => {
      const items = [...element.querySelectorAll<HTMLElement>("a[href], button, select")].filter(item => item.getClientRects().length).map(item => item.getBoundingClientRect());
      const apart = (a: DOMRect, b: DOMRect) => Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom);
      return { count: items.length, smallest: Math.min(...items.map(box => box.height)), nearest: Math.min(...items.flatMap((a, i) => items.slice(i + 1).map(b => apart(a, b)))) };
    });
    expect(reading.count, `${width}`).toBe(3);
    expect(reading.smallest, `${width}`).toBeGreaterThanOrEqual(44);
    expect(reading.nearest, `${width}`).toBeGreaterThanOrEqual(8);
  }
});
