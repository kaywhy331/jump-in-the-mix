import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { initialJourneySetup } from "../src/lib/journey-preferences";
import { installMegaMix } from "../src/lib/mega-mix-service";
import { axeInPage } from "./axe-in-page";
const out = ".artifacts/onboarding-journey-20260922";
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires disposable local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block", actionTimeout: 15000 });
test.setTimeout(180000);
let userId: string, workspaceId: string, sharedId: string | undefined;
const errors: string[] = [];
test.beforeEach(async ({ page, context }) => {
  errors.length = 0; sharedId = undefined; page.on("pageerror", error => errors.push(error.message));
  userId = (await prisma.user.create({ data: { name: "Casey", email: `setup-${randomUUID()}@example.invalid`, emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Casey", slug: randomUUID(), members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: false } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  const token = randomUUID(); await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000) } });
  await context.addCookies([{ name: "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, sameSite: "Strict" }]);
  await mkdir(out, { recursive: true });
});
test.afterEach(async () => { await prisma.workspace.deleteMany({ where: { id: workspaceId } }); await prisma.user.deleteMany({ where: { id: userId } }); if (sharedId) { await prisma.sharedMixMetadata.deleteMany({ where: { sharedMixId: sharedId } }); await prisma.sharedMix.deleteMany({ where: { id: sharedId } }); } expect(errors).toEqual([]); });

test("recommended onboarding validates, previews and atomically installs a tailored journey", async ({ page }) => {
  await page.goto("/onboarding");
  await expect(page.getByRole("radio", { name: /A complete mega-mix/ })).toBeChecked();
  await page.getByLabel("Preferred communication", { exact: true }).selectOption("EMAIL");
  await page.getByLabel("Space between follow-ups", { exact: true }).selectOption("RELAXED");
  await page.getByLabel("Close at", { exact: true }).fill("08:00");
  await page.getByRole("button", { name: "Review my setup", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "closing hours" })).toContainText("closing hours");
  await page.getByLabel("Close at", { exact: true }).fill("17:00");
  await page.getByLabel("Preferred follow-up time", { exact: true }).fill("10:30");
  await page.getByRole("button", { name: "Review my setup", exact: true }).click();
  await page.getByText("Preview the Contractor journey", { exact: true }).click();
  const details = page.getByRole("list", { name: "Included mixes and connections" });
  await details.locator("summary").first().click();
  await expect(details).toContainText("Email · 10:30");
  await page.getByRole("checkbox", { name: "I’ve reviewed my journey and preferences." }).check();
  await page.getByRole("button", { name: "Add Contractor mega-mix", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your journey is connected" })).toBeVisible();
  expect(await prisma.workspacePreference.findUnique({ where: { workspaceId } })).toMatchObject({ defaultFollowUpMinutes: 630, journeyPreferences: { communication: "EMAIL", pace: "RELAXED", avoidAppointments: true } });
  expect(await prisma.mix.count({ where: { workspaceId } })).toBe(13);
  expect(await prisma.contact.count({ where: { workspaceId } })).toBe(0);
  expect(await prisma.automatedDelivery.count({ where: { workspaceId } })).toBe(0);
  await page.goto("/templates/journeys?journey=photographer");
  if (page.viewportSize()!.width < 1200) await page.getByRole("button", { name: "Add journey", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your saved preferences" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review my setup", exact: true })).toBeHidden();
  await page.goto("/account/preferences");
  await expect(page.getByLabel("Preferred communication", { exact: true })).toHaveValue("EMAIL");
  await page.getByLabel("Open from", { exact: true }).fill("08:30");
  await page.getByRole("button", { name: "Save journey preferences", exact: true }).click();
  await expect(page.getByText(/Journey preferences saved\./)).toBeVisible();
  expect(await prisma.workspacePreference.findUnique({ where: { workspaceId } })).toMatchObject({ journeyPreferences: { workStart: 510 } });
});

test("individual mix setup adds a selected library Mix without requiring a person", async ({ page }) => {
  sharedId = `setup-library-${randomUUID()}`;
  await prisma.sharedMix.create({ data: { id: sharedId, title: "My first check-in", description: "A simple conversation to start with.", category: "Current clients", industry: "Other", durationDays: 7, status: "APPROVED", steps: [{ name: "Check in", channel: "EMAIL", dayOffset: 0, sendTimeMinutes: 600, subject: "Checking in", body: "Hi {{First Name}}, how are things going?", script: null, longSms: false, includeOptOut: false }] } });
  await prisma.sharedMixMetadata.create({ data: { sharedMixId: sharedId, version: 1, triggerMode: "MANUAL_START", publishedAt: new Date() } });
  await page.goto("/onboarding");
  await page.getByRole("radio", { name: /Choose individual mixes/ }).check();
  await page.getByLabel("Preferred communication", { exact: true }).selectOption("SMS");
  await page.getByRole("button", { name: "Review my setup", exact: true }).click();
  await page.getByRole("button", { name: "Choose individual mixes", exact: true }).click();
  await expect(page).toHaveURL(/templates\?setup=individual/);
  await expect(page.getByText(/Your preferences are saved\. Choose a Mix below/)).toBeVisible();
  expect(await prisma.workspaceProfile.findUnique({ where: { workspaceId } })).toMatchObject({ onboardingDone: true });
  expect(await prisma.mix.count({ where: { workspaceId } })).toBe(0);
  await page.getByRole("navigation", { name: "Ready-made mixes", exact: true }).getByRole("link", { name: /My first check-in/ }).click();
  await expect(page.getByRole("region", { name: "Selected ready-made Mix", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Use this mix", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Set up your mix" })).toBeVisible();
  await page.getByLabel("Mix name").fill("My chosen check-in");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/mixes\?mix=[^&]+&view=edit&imported=1/);
  expect(await prisma.mix.findFirst({ where: { workspaceId, name: "My chosen check-in" } })).toMatchObject({ status: "DRAFT" });
  expect(await prisma.contact.count({ where: { workspaceId } })).toBe(0);
});

test("onboarding reflows in both themes and supports keyboard and enlarged text", async ({ page }) => {
  await page.goto("/onboarding");
  for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => { localStorage.setItem("jitm-appearance", theme); document.documentElement.dataset.theme = theme; }, theme);
    for (const width of [320, 390, 599, 600, 601, 767, 768, 834, 900, 901, 1099, 1100, 1194, 1199, 1200, 1279, 1280, 1440, 1699, 1700, 1920, 2560, 3440, 3840]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
      if ([320, 390, 834, 1440, 1920].includes(width)) {
        expect((await axeInPage(page).analyze()).violations).toEqual([]);
        await page.screenshot({ path: `${out}/onboarding-${width}-${theme}.png`, fullPage: true });
      }
    }
  }
  await page.getByRole("button", { name: "Review my setup", exact: true }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Ready when you are" })).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addStyleTag({ content: "html { font-size: 200% !important }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  await page.screenshot({ path: `${out}/onboarding-review-text-200.png`, fullPage: true });
});

test("Mix selection preserves scroll and zoom while revealing incoming and outgoing lines", async ({ page }) => {
  await installMegaMix({ workspaceId, actorUserId: userId, blueprintId: "contractor", expectedVersion: 1, setup: initialJourneySetup(null, "UTC") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/journey");
  const canvas = page.getByRole("region", { name: /Scrollable journey diagram/ });
  await expect(canvas).toBeVisible();
  const first = page.locator('[data-workflow-node]').first().getByRole("button").first();
  await first.scrollIntoViewIfNeeded();
  const position = () => canvas.evaluate(el => ({ x: el.scrollLeft, y: el.scrollTop, page: window.scrollY, transform: el.querySelector<HTMLElement>('[data-overview]')!.style.transform }));
  const before = await position(); await first.click();
  await expect.poll(position).toEqual(before);
  await expect(page.locator('[data-workflow-path][data-direction="outgoing"]').first()).toBeVisible();
  // Select a central node with paths in both directions. Keyboard focus must not trigger a jump either.
  const central = page.locator('[data-workflow-node] button[class*="nodeHeading"]').filter({ hasText: "Estimate follow-up" });
  await central.scrollIntoViewIfNeeded(); await central.focus(); const centralBefore = await position(); await page.keyboard.press("Enter");
  await expect.poll(position).toEqual(centralBefore);
  const incoming = page.locator('[data-workflow-path][data-direction="incoming"] path:not([class*="edgeHit"])').first();
  const outgoing = page.locator('[data-workflow-path][data-direction="outgoing"] path:not([class*="edgeHit"])').first();
  expect(await incoming.evaluate(el => getComputedStyle(el).stroke)).not.toBe(await outgoing.evaluate(el => getComputedStyle(el).stroke));
  await expect(page.getByRole("region", { name: "Connections for Estimate follow-up" })).toBeVisible();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    await page.screenshot({ path: `${out}/journey-selected-${theme}.png`, fullPage: true });
    expect((await axeInPage(page).analyze()).violations).toEqual([]);
    expect((await axeInPage(page).withRules(["target-size"]).analyze()).violations).toEqual([]);
  }
  for (const size of [1440, 390]) {
    await page.setViewportSize({ width: size, height: 1000 });
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    await expect(page.getByRole("button", { name: "Reset zoom to 100%", exact: true })).toHaveText("15%");
    expect((await axeInPage(page).withRules(["target-size"]).analyze()).violations).toEqual([]);
    const overlaps = await page.locator('[data-workflow-node]').evaluateAll(nodes => {
      const rects = nodes.map(node => node.getBoundingClientRect());
      return rects.some((a, i) => rects.slice(0, i).some(b => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top));
    });
    expect(overlaps).toBe(false);
    await page.screenshot({ path: `${out}/journey-minimum-zoom-${size}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Reset zoom to 100%", exact: true }).click();
  await central.scrollIntoViewIfNeeded(); await central.click();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    await canvas.screenshot({ path: `${out}/journey-labels-${theme}.png` });
  }
  const collisions = await page.locator('[data-workflow-edge-label]').evaluateAll(labels => {
    const nodes = [...document.querySelectorAll('[data-workflow-node]')].map(node => node.getBoundingClientRect());
    const rects = labels.map(label => label.getBoundingClientRect());
    const overlap = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    return rects.flatMap((rect, i) => { const node = nodes.find(node => overlap(rect, node)); const j = rects.slice(0, i).findIndex(other => overlap(rect, other)); return node || j >= 0 ? [{ label: labels[i].textContent, rect: rect.toJSON(), node: node?.toJSON(), other: j >= 0 ? { label: labels[j].textContent, rect: rects[j].toJSON() } : undefined }] : []; });
  });
  expect(collisions).toHaveLength(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await central.scrollIntoViewIfNeeded(); const mobileBefore = await position(); await central.click();
  await expect.poll(position).toEqual(mobileBefore);
  await expect(canvas).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  await page.screenshot({ path: `${out}/journey-mobile-selection.png`, fullPage: true });

});
