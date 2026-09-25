import { createHash, randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off" });
test.setTimeout(120_000);
let workspaceId: string, userId: string;
const token = randomUUID();
test.beforeAll(async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { email: `sheet-${suffix}@example.com`, name: "Sheet fixture owner", passwordHash: "fixture-only", emailVerifiedAt: new Date() } }); userId = user.id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: user.id, slug: `sheet-${suffix}`, name: "Sheet fixture", members: { create: { userId } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Sheet follow-up", channel: "SMS" } });
  const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "A prepared estimate follow-up." } });
  const plan = await prisma.mix.create({ data: { workspaceId, name: "Sheet plan", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: { stepVersionId: version.id, dayOffset: 0, sortOrder: 1 } } }, include: { steps: true } });
  for (let index = 1; index <= 3; index++) {
    const contact = await prisma.contact.create({ data: { workspaceId, displayName: `Sheet person ${index}`, phones: { create: { phone: `+1555010100${index}`, normalized: `+1555010100${index}`, isPrimary: true } } } });
    await prisma.jump.create({ data: { workspaceId, contactId: contact.id, mixId: plan.id, mixStepId: plan.steps[0].id, stepVersionId: version.id, scheduledAt: new Date(Date.now() - (4 - index) * 60_000), reason: "Estimate follow-up", uniquenessKey: randomUUID(), templateSnapshot: {}, renderedSnapshot: { body: version.body } } });
  }
});
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
});
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});
async function ready(page: Page) { await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", ""); }
async function setTheme(page: Page, colorScheme: "light" | "dark") {
  await page.emulateMedia({ colorScheme });
  // Inspect the settled palette: WebKit can start axe while the button
  // background is still transitioning from the previous system theme.
  await page.evaluate(async () => {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await Promise.all(document.getAnimations().filter(animation => "transitionProperty" in animation).map(animation => animation.finished.catch(() => undefined)));
  });
}
async function closeSheet(page: Page) {
  await page.keyboard.press("Escape");
  // Native close queues trigger restoration. Let it finish before directing
  // the next keyboard action to another sheet or the profile control.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function audit(page: Page) { expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]); }

test("message drafts, snooze fields, nested confirmation and focus survive closing and reopening", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/jumps"); await ready(page);
  const review = page.getByRole("button", { name: "Review message for Sheet person 2", exact: true });
  await review.focus(); await page.keyboard.press("Enter");
  const message = page.getByRole("dialog", { name: "Follow up with Sheet person 2", exact: true });
  await expect(message).toBeVisible();
  // Opening announces the sheet's title or its message field, never the Close control.
  await expect.poll(() => message.evaluate(dialog => { const active = document.activeElement; return dialog.contains(active) && (active?.matches("h2, textarea") ?? false); })).toBe(true);
  const draft = message.getByRole("textbox", { name: "Your message", exact: true });
  await draft.fill("Keep this unsent estimate draft.");
  for (const colorScheme of ["light", "dark"] as const) { await setTheme(page, colorScheme); await audit(page); }
  await closeSheet(page); await expect(review).toBeFocused();
  await page.keyboard.press("Enter"); await expect(draft).toHaveValue("Keep this unsent estimate draft.");
  await closeSheet(page);

  const more = page.getByRole("button", { name: "More options for Sheet person 2", exact: true });
  await more.focus(); await page.keyboard.press("Enter");
  const options = page.getByRole("dialog", { name: "Follow up with Sheet person 2", exact: true });
  const date = options.getByRole("group", { name: "Choose a day", exact: true });
  const chosen = new Date(Date.now() + 7 * 86_400_000);
  const chosenLabel = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(chosen);
  await date.locator(".when-trigger.date").click();
  if (chosen.getUTCMonth() !== new Date().getUTCMonth()) await date.getByRole("button", { name: "Next month", exact: true }).click();
  await date.getByRole("button", { name: chosenLabel, exact: true }).click();
  await expect(date.locator(".when-trigger.date")).toContainText(new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(chosen));
  const stop = options.getByRole("button", { name: "Stop mix…", exact: true }); await stop.click();
  const confirmation = page.getByRole("dialog", { name: "Stop Sheet plan for Sheet person 2?", exact: true });
  await expect(confirmation).toBeVisible(); await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(stop).toBeFocused(); await expect(options).toBeVisible();
  await closeSheet(page); await expect(more).toBeFocused();
  await page.keyboard.press("Enter"); await expect(date.locator('input[name="customDate"]')).toHaveValue(chosen.toISOString().slice(0, 10)); await closeSheet(page);

  await page.setViewportSize({ width: 1440, height: 1000 });
  const profile = page.getByRole("button", { name: "Profile", exact: true }); await profile.focus(); await page.keyboard.press("Enter");
  const profileSheet = page.getByRole("dialog", { name: "Profile and settings", exact: true });
  await expect(profileSheet).toBeVisible(); await expect(profileSheet.getByRole("heading", { name: "Profile and settings", exact: true, level: 2 })).toBeFocused(); await audit(page);
  await closeSheet(page); await expect(profile).toBeFocused();
  expect(await prisma.jump.count({ where: { workspaceId, status: "PENDING" } })).toBe(3);
});

test("the contact message shortcut opens automatically and keeps an unscheduled draft", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/contacts?intent=one-time-jump"); await ready(page);
  await page.getByRole("checkbox", { name: "Select Sheet person 1", exact: true }).check();
  const dialog = page.getByRole("dialog", { name: "Message 1 person", exact: true }); await expect(dialog).toBeVisible();
  const message = dialog.getByRole("textbox", { name: "Message", exact: true }); await message.fill("An unscheduled personal message.");
  await audit(page); await closeSheet(page);
  const trigger = page.getByRole("button", { name: "Message", exact: true }); await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter"); await expect(message).toHaveValue("An unscheduled personal message.");
  await closeSheet(page);
  for (const width of [320, 390, 768, 900, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const actions = page.getByRole("complementary", { name: "Actions for selected contacts" });
    for (const name of ["Clear", "Select this page", "Tags", "Message", "Export CSV", "Archive 1…"]) {
      const action = actions.getByRole("button", { name, exact: true });
      await expect(action).toBeVisible();
      expect(await action.evaluate(element => {
        const r = element.getBoundingClientRect();
        return r.width >= 44 && r.height >= 44 && [[r.left + 4, r.top + 4], [r.right - 4, r.bottom - 4]].every(([x, y]) => element.contains(document.elementFromPoint(x, y)));
      }), `${name} must have a reachable 44-pixel target at ${width}px`).toBe(true);
    }
    for (const colorScheme of ["light", "dark"] as const) { await setTheme(page, colorScheme); await audit(page); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  }
  expect(await prisma.jump.count({ where: { workspaceId } })).toBe(3);
});

test("nested Snooze keeps its own popup layout and restores the review in both themes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/jumps"); await ready(page);
  const review = page.locator(".follow-up-review-sheet[open]");
  const wording = review.getByRole("textbox", { name: "Your message", exact: true });
  await wording.fill("Keep this wording while choosing a later day.");
  const heading = (await review.getByRole("heading", { level: 2 }).boundingBox())!;
  const snooze = (await review.getByRole("button", { name: "Snooze", exact: true }).boundingBox())!;
  const sent = (await review.getByRole("button", { name: /^Mark sent for/ }).boundingBox())!;
  expect(Math.abs(snooze.y - heading.y)).toBeLessThan(24);
  expect(sent.y).toBeGreaterThan(heading.y + heading.height);
  const trigger = review.getByRole("button", { name: "Snooze", exact: true });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 320, height: 568 }, { width: 834, height: 1194 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme); await trigger.click();
      const popup = page.getByRole("dialog", { name: "Snooze follow-up", exact: true });
      await expect(popup).toBeVisible();
      const bounds = (await popup.locator(":scope > .sheet-panel").boundingBox())!;
      expect(bounds.width).toBeLessThanOrEqual(620);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
      if (viewport.width >= 768) expect(Math.abs(bounds.x + bounds.width / 2 - viewport.width / 2)).toBeLessThan(2);
      await expect(popup.getByRole("heading")).toHaveCSS("font-size", "18px");
      await expect(popup.locator("button[type=submit]").first()).not.toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
      await audit(page); await closeSheet(page);
      await expect(trigger).toBeFocused();
      await expect(review).toBeVisible();
      await expect(wording).toHaveValue("Keep this wording while choosing a later day.");
    }
  }
});

test("timezone selection shows the current value, searches by keyboard and returns focus", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport); await page.goto("/account/preferences"); await ready(page);
    const trigger = page.getByRole("button", { name: "Change personal timezone", exact: true });
    await trigger.click();
    const popup = page.getByRole("dialog", { name: "Choose a timezone", exact: true });
    const search = popup.getByRole("searchbox", { name: "Search timezones", exact: true });
    await expect(search).toBeFocused();
    await expect(popup.locator(".timezone-city").first()).toHaveAttribute("aria-pressed", "true");
    await expect(popup.getByRole("button", { name: /Tokyo.*Asia\/Tokyo/ })).toBeAttached();
    await search.fill("no matching timezone");
    await expect(popup.getByRole("status")).toContainText("Try a nearby major city");
    await search.fill("London");
    for (const theme of ["light", "dark"] as const) { await setTheme(page, theme); await audit(page); }
    await page.keyboard.press("Tab"); await page.keyboard.press("Enter");
    await expect(popup).not.toBeVisible(); await expect(trigger).toBeFocused();
    await expect(page.locator('input[name="timezone"]')).toHaveValue("Europe/London");
    await trigger.click(); await expect(search).toHaveValue("");
    await expect(popup.locator(".timezone-city").first()).toContainText("London");
    await closeSheet(page); await expect(trigger).toBeFocused();
  }
});

test("phone contact tools use readable rows and saved views stay reachable for empty results", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 }); await page.goto("/contacts"); await ready(page);
  await page.getByRole("button", { name: "More contact tools", exact: true }).click();
  const tools = page.getByRole("dialog", { name: "Contact tools", exact: true });
  const links = tools.locator(".contact-tools-links > *");
  let previousBottom = 0;
  for (const link of await links.all()) {
    const bounds = (await link.boundingBox())!;
    expect(bounds.height).toBeGreaterThanOrEqual(44); expect(bounds.width).toBeGreaterThan(250);
    expect(bounds.y).toBeGreaterThanOrEqual(previousBottom); previousBottom = bounds.y + bounds.height;
  }
  await tools.getByRole("button", { name: "Select contacts", exact: true }).click();
  await expect(tools).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Done", exact: true })).toBeVisible();
  await page.goto("/contacts?q=NoSuchPersonInTheFixture"); await ready(page);
  await page.getByRole("button", { name: "Filter contacts", exact: true }).click();
  const filters = page.getByRole("dialog", { name: "Filter contacts", exact: true });
  const manage = filters.getByRole("button", { name: "Save or manage view", exact: true });
  await manage.click();
  const saved = page.getByRole("dialog", { name: "Saved contact views", exact: true });
  await saved.getByRole("textbox", { name: "View name", exact: true }).fill("An intentionally empty view");
  for (const theme of ["light", "dark"] as const) { await setTheme(page, theme); await audit(page); }
  await closeSheet(page); await expect(manage).toBeFocused();
  await manage.click(); await expect(saved.getByRole("textbox", { name: "View name", exact: true })).toHaveValue("An intentionally empty view");
  await saved.getByRole("button", { name: "Save current filters", exact: true }).click();
  await expect(page.getByText("View saved.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Filter contacts", exact: true }).click();
  await expect(page.getByRole("link", { name: "An intentionally empty view", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Filter contacts", exact: true }).getByLabel("Sort contacts")).toHaveValue("last-name");
});

test("short-screen Quick Add keeps every reviewed field reachable above its actions", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 }); await page.goto("/contacts"); await ready(page);
  await page.getByRole("button", { name: "Quick Add", exact: true }).click();
  const popup = page.getByRole("dialog", { name: "Quick Add", exact: true });
  await popup.locator("#quick-add-capture").fill("Meet Morgan Friday at 2pm, then text them Monday about the estimate");
  await popup.getByRole("button", { name: "Continue", exact: true }).click();
  await popup.locator("details").evaluateAll(elements => elements.forEach(element => { (element as HTMLDetailsElement).open = true; }));
  for (const control of await popup.locator('input:not([type=hidden]),textarea,select,summary,button').filter({ visible: true }).all()) {
    await control.focus();
    const reachable = await control.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return hit === element || element.contains(hit);
    });
    expect(reachable, await control.getAttribute("name") ?? await control.textContent() ?? "control").toBe(true);
  }
  for (const theme of ["light", "dark"] as const) { await setTheme(page, theme); await audit(page); }
});

test("an open Snooze stays above the review through phone and desktop transitions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto("/jumps"); await ready(page);
  const review = page.locator(".follow-up-review-sheet[open]");
  const draft = review.getByRole("textbox", { name: "Your message", exact: true });
  await draft.fill("Preserve this draft across viewport transitions.");
  const trigger = review.getByRole("button", { name: "Snooze", exact: true });
  await trigger.click();
  const popup = page.getByRole("dialog", { name: "Snooze follow-up", exact: true });
  for (const viewport of [{ width: 390, height: 844 }, { width: 834, height: 900 }, { width: 320, height: 568 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await expect(popup).toBeVisible();
    const close = popup.getByRole("button", { name: "Close Snooze follow-up", exact: true });
    await expect(popup.getByRole("heading", { name: "Snooze follow-up", exact: true, level: 2 })).toBeFocused();
    await close.click({ trial: true });
    await expect(popup.locator("button[type=submit]").first()).toBeVisible();
    await popup.locator("button[type=submit]").first().click({ trial: true });
  }
  await closeSheet(page);
  await expect(popup).not.toBeVisible(); await expect(review).toBeVisible();
  await expect(trigger).toBeFocused(); await expect(draft).toHaveValue("Preserve this draft across viewport transitions.");
});

test("Quick Add focuses a failed save and preserves edits and retry identity", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 }); await page.goto("/contacts"); await ready(page);
  const requests: Array<{ requestId: string; note: string; person: { name: string } }> = [];
  await page.route("**/api/quick-capture", async route => {
    if (route.request().method() !== "POST") return route.continue();
    requests.push(route.request().postDataJSON());
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Your capture could not be saved. Please try again." }) });
  });
  await page.getByRole("button", { name: "Quick Add", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Quick Add", exact: true });
  await dialog.getByLabel("What do you want to remember?").fill("Add Fictional Error Review. " + "Details to keep for our next conversation. ".repeat(30));
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog.getByLabel("Name or search for someone", { exact: true }).fill("Fictional retained name");
  const save = dialog.getByRole("button", { name: "Save all 2", exact: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    await save.click();
    const error = dialog.getByRole("alert"); await expect(error).toBeFocused();
    const box = (await error.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(568);
    await expect(dialog.getByLabel("Name or search for someone", { exact: true })).toHaveValue("Fictional retained name");
  }
  expect(requests).toHaveLength(2); expect(requests[0]).toEqual(requests[1]);
  expect(requests[0].note).toContain("Details to keep");
});

test("Calendar reveals invalid collapsed fields and focuses returned errors without losing edits", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 }); await page.goto("/calendar?new=1&date=2026-10-15"); await ready(page);
  const form = page.locator(".calendar-entry-form");
  await form.getByRole("textbox", { name: "Title", exact: true }).fill("Retained calendar draft");
  const details = form.locator(".calendar-extra-details");
  await details.locator("summary").click();
  const url = form.getByLabel("Link to join or find it (optional)"); await url.fill("invalid link");
  await details.locator("summary").click();
  await form.getByRole("button", { name: "Save event", exact: true }).click();
  await expect(details).toHaveAttribute("open", ""); await expect(url).toBeFocused();
  await url.fill("https://example.test/retained");
  await form.getByRole("button", { name: "Custom end", exact: true }).click();
  await form.getByLabel("Ends", { exact: true }).fill("2026-10-15T08:00");
  for (let attempt = 0; attempt < 2; attempt++) {
    await form.getByRole("button", { name: "Save event", exact: true }).click();
    const error = form.locator(".field.full").filter({ has: page.getByRole("alert") });
    await expect(error).toBeFocused();
    await expect(form.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("Retained calendar draft");
    await expect(url).toHaveValue("https://example.test/retained");
  }
  expect(await prisma.calendarEntry.count({ where: { workspaceId } })).toBe(0);
});

test("enlarged text keeps editor actions and public navigation reachable", async ({ page }) => {
  const mix = await prisma.mix.findFirstOrThrow({ where: { workspaceId } });
  for (const theme of ["light", "dark"] as const) {
    await page.setViewportSize({ width: 320, height: 568 }); await setTheme(page, theme);
    for (const route of [`/mixes/${mix.id}/edit`, "/account/preferences", "/calendar?new=1", "/", "/for/contractors"]) {
      await page.goto(route); if (route !== "/" && !route.startsWith("/for/")) await ready(page);
      await page.addStyleTag({ content: "html { font-size: 200% !important; scroll-behavior: auto !important; } * { scroll-behavior: auto !important; }" });
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route).toBe(true);
      const controls = page.locator(".sticky-form-actions .button, .form-actions .button, .public-header a, .public-header summary, .profession-grid a, .mobile-nav .nav-link").filter({ visible: true });
      for (const control of await controls.all()) {
        await control.scrollIntoViewIfNeeded();
        if (route !== "/" && !route.startsWith("/for/")) await ready(page);
        await control.evaluate(element => (element as HTMLElement).focus());
        await expect(control).toBeFocused();
        await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab");
        await expect(control).toBeFocused();
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        const position = await control.evaluate(element => {
          const r = element.getBoundingClientRect();
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return { reachable: r.x >= 0 && r.right <= innerWidth + 1 && Boolean(hit && element.contains(hit)), x: r.x, y: r.y, width: r.width, height: r.height, focusVisible: element.matches(":focus-visible"), coveredBy: hit?.className };
        });
        expect(position.reachable, `${route}: ${await control.innerText()} ${JSON.stringify(position)}`).toBe(true);
      }
    }
  }
});

test("long contact names keep the review close button and person actions usable", async ({ page }) => {
  const contact = await prisma.contact.findFirstOrThrow({ where: { workspaceId, displayName: "Sheet person 3" } });
  const name = "Alexandria-".repeat(19) + "Example";
  await prisma.contact.update({ where: { id: contact.id }, data: { displayName: name } });
  try {
    for (const viewport of [{ width: 320, height: 568 }, { width: 834, height: 900 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      for (const theme of ["light", "dark"] as const) {
        await setTheme(page, theme); await page.goto("/jumps?range=all"); await ready(page);
        await page.getByRole("button", { name: `Review message for ${name}`, exact: true }).click();
        const review = page.getByRole("dialog", { name: `Follow up with ${name}`, exact: true });
        const close = review.getByRole("button", { name: `Close Follow up with ${name}`, exact: true });
        await close.click({ trial: true });
        await expect(review.getByRole("textbox", { name: "Your message", exact: true })).toBeVisible();
        await close.click();
        await page.goto(`/contacts/${contact.id}`); await ready(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await audit(page);
      }
    }
  } finally { await prisma.contact.update({ where: { id: contact.id }, data: { displayName: "Sheet person 3" } }); }
});

test("Calendar directs focus to an ambiguous person choice and saves the reviewed selection", async ({ page }) => {
  await prisma.contact.create({ data: { workspaceId, displayName: "Choice phone match", phones: { create: { phone: "+15550101991", normalized: "+15550101991", isPrimary: true } } } });
  const selected = await prisma.contact.create({ data: { workspaceId, displayName: "Choice email match", emails: { create: { email: "choice@example.test", normalized: "choice@example.test", isPrimary: true } } } });
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/calendar?new=1&date=2026-10-15"); await ready(page);
  const form = page.locator(".calendar-entry-form");
  await form.getByRole("textbox", { name: "Title", exact: true }).fill("Visit with reviewed person");
  await form.getByText("Add a new person for this visit", { exact: true }).click();
  await form.getByLabel("Name", { exact: true }).fill("Keep this entered name");
  await form.getByLabel("Phone (optional)", { exact: true }).fill("+15550101991");
  await form.getByLabel("Email (optional)", { exact: true }).fill("choice@example.test");
  await form.getByRole("button", { name: "Save event", exact: true }).click();
  const choice = form.getByRole("group", { name: "Which saved person is this visit with?" });
  await expect(choice.locator("legend")).toBeFocused();
  await expect(form.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("Visit with reviewed person");
  expect(await prisma.calendarEntry.count({ where: { workspaceId, title: "Visit with reviewed person" } })).toBe(0);
  await choice.getByRole("radio", { name: /Choice email match/ }).check();
  await form.getByRole("button", { name: "Save event", exact: true }).click();
  await expect(page).toHaveURL(/saved=1/);
  expect((await prisma.calendarEntry.findFirstOrThrow({ where: { workspaceId, title: "Visit with reviewed person" } })).contactId).toBe(selected.id);
});
