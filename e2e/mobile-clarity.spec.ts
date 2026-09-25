import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { prisma } from "../src/lib/prisma";
import { DOCKED_REVIEW_MEDIA } from "../src/lib/sheet-layout";

const database = new URL(process.env.DATABASE_URL ?? "postgresql://localhost/unknown");
test.skip(!["localhost", "127.0.0.1"].includes(database.hostname) || !database.pathname.startsWith("/jitm_design_"), "Disposable local fixtures only");

let cookies: Awaited<ReturnType<import("@playwright/test").BrowserContext["cookies"]>>;
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
});
test.beforeEach(async ({ context }) => { await context.addCookies(cookies); });

test("review then handoff then outcome stays attached to the correct person", async ({ page }) => {
  const id = `clarity-${randomUUID()}`;
  const step = await prisma.mixStep.findFirstOrThrow({ where: { mix: { workspaceId: "demo_workspace", status: "ACTIVE" }, isActive: true, stepVersion: { stepTemplate: { channel: "SMS" } } } });
  await prisma.contact.create({ data: { id, workspaceId: "demo_workspace", firstName: "Clarity", displayName: "Clarity Person", phones: { create: { phone: "+14155550123", normalized: "14155550123", isPrimary: true } } } });
  await prisma.jump.create({ data: { id, workspaceId: "demo_workspace", contactId: id, mixId: step.mixId, mixStepId: step.id, stepVersionId: step.stepVersionId, scheduledAt: new Date(), status: "PENDING", reason: "Check in", uniquenessKey: id, templateSnapshot: { channel: "SMS", body: "Hi {{First Name}}, is Friday a good time?" }, renderedSnapshot: { body: "Hi Clarity, is Friday a good time?" } } });
  try {
    await page.goto("/jumps?range=all&q=Clarity%20Person");
    const card = page.locator(`[id="jump-${id}"]`);
    const review = card.getByRole("button", { name: "Review message for Clarity Person" });
    const more = card.getByRole("button", { name: "More options for Clarity Person" });
    // Wide screens dock the next follow-up's review open once the page is ready; the compact card is checked with it closed.
    await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "", { timeout: 60_000 });
    if (await page.evaluate(media => matchMedia(media).matches, DOCKED_REVIEW_MEDIA)) {
      await expect(card.locator(".follow-up-review-sheet[open]")).toHaveCount(1);
      await card.getByRole("button", { name: "Close Follow up with Clarity Person" }).click();
    }
    await expect(card.getByRole("textbox")).toHaveCount(0);
    await expect(card.getByRole("button")).toHaveCount(2);
    // The card's narrow action column stacks More under Review, within Review's width.
    const [a, b] = await Promise.all([review.boundingBox(), more.boundingBox()]);
    expect(b!.y).toBeGreaterThanOrEqual(a!.y + a!.height - 1);
    expect(b!.x).toBeGreaterThanOrEqual(a!.x - 1);
    expect(b!.x + b!.width).toBeLessThanOrEqual(a!.x + a!.width + 1);
    await review.click();
    const dialog = page.getByRole("dialog", { name: "Follow up with Clarity Person" });
    await dialog.getByLabel("Your message").fill("Hi Clarity, can we catch up next week?");
    await expect(dialog.locator("[data-draft-status]")).toHaveText("Saved");
    await dialog.getByRole("button", { name: "Close Follow up with Clarity Person" }).click();
    await review.click();
    await expect(dialog.getByLabel("Your message")).toHaveValue("Hi Clarity, can we catch up next week?");
    await page.evaluate(() => document.addEventListener("click", event => { if (event.target instanceof Element && event.target.closest('a[href^="sms:"]')) event.preventDefault(); }, true));
    await dialog.getByRole("link", { name: /Open text.*Clarity Person/ }).click();
    await expect(dialog).not.toBeVisible();
    expect((await prisma.jump.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
    const tray = page.getByRole("complementary", { name: "Finish follow-up with Clarity Person" });
    await expect(tray).toBeVisible();
    await tray.getByRole("button", { name: "Not sent", exact: true }).click();
    expect((await prisma.jump.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
    await review.click();
    await dialog.getByRole("link", { name: /Open text.*Clarity Person/ }).click();
    await tray.getByRole("button", { name: "Sent", exact: true }).click();
    await expect.poll(async () => (await prisma.jump.findUniqueOrThrow({ where: { id } })).status).toBe("DONE");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await prisma.jump.deleteMany({ where: { id } }); await prisma.contact.deleteMany({ where: { id } }); }
});

test("quick add separates capture and review and retains text when going back", async ({ page }) => {
  await page.goto("/jumps");
  await page.getByRole("button", { name: "Quick Add", exact: true }).last().click();
  const dialog = page.getByRole("dialog", { name: "Quick Add", exact: true });
  const capture = dialog.getByRole("textbox", { name: "What do you want to remember?" });
  await capture.fill("Text Maria Friday about the estimate");
  // Capture first: the only way forward is Continue, and the review heading appears after it.
  await expect(dialog.getByRole("button", { name: "Continue", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(capture).not.toBeVisible();
  await expect(dialog.getByText("Saving as", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Saving as", { exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "Edit capture" }).click();
  await expect(capture).toHaveValue("Text Maria Friday about the estimate");
  await expect(capture).toBeFocused();
});

test("profession examples are easy to find and show one concise message", async ({ page }) => {
  await page.goto("/templates");
  // The examples live in the ready-made library's tools, under "Ideas for your business".
  await page.getByRole("button", { name: "More ready-made Mix tools", exact: true }).click();
  const tools = page.getByRole("dialog", { name: "Ready-made Mix tools", exact: true });
  await tools.getByText("Ideas for your business", { exact: true }).click();
  await tools.getByLabel("See a quick example for your work").selectOption("consulting");
  const example = page.getByRole("region", { name: "Consulting example" });
  await expect(example.locator("blockquote")).toHaveCount(1);
  expect((await example.locator("blockquote").innerText()).length).toBeLessThan(300);
  await expect(example).toContainText("Nothing is sent");
  await example.getByRole("link", { name: "Find a follow-up plan" }).click();
  await expect(page).toHaveURL(/industry=Professional/);
  await expect(page.locator(".mix-library-row").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("install prompt is distinct in dark mode and explains the iPhone steps", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => { Object.defineProperty(navigator, "userAgent", { value: "iPhone Safari", configurable: true }); localStorage.setItem("jitm:first-follow-up-completed", "1"); localStorage.removeItem("jitm:install-dismissed"); });
  await page.goto("/jumps");
  const prompt = page.getByRole("complementary", { name: "Optional app installation" });
  await expect(prompt).toBeVisible();
  const colors = await prompt.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, body: getComputedStyle(document.body).backgroundColor, border: getComputedStyle(element).borderTopWidth }));
  expect(colors.background).not.toBe(colors.body); expect(parseFloat(colors.border)).toBeGreaterThanOrEqual(2);
  expect((await new AxeBuilder({ page }).include(".pwa-install-prompt").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.map(v => v.id)).toEqual([]);
  await prompt.getByRole("button", { name: "Show me how" }).click();
  await expect(prompt.getByRole("listitem")).toHaveCount(3);
  await prompt.getByRole("button", { name: "Got it" }).click();
  await expect(prompt).not.toBeVisible();
});

test("a ready-made plan guides setup and saves a draft without scheduling", async ({ page }) => {
  const metadata = await prisma.sharedMixMetadata.findMany({ where: { triggerMode: "MANUAL_START" }, select: { sharedMixId: true } });
  const template = await prisma.sharedMix.findFirstOrThrow({ where: { status: "APPROVED", id: { in: metadata.map(item => item.sharedMixId) } } });
  const name = `Guided draft ${randomUUID()}`;
  try {
    await page.goto(`/templates/${template.id}/use`);
    await expect(page.getByRole("heading", { name: "Name your plan" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Choose people" })).not.toBeVisible();
    await page.getByLabel("Mix name", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Choose people" })).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByLabel("Mix name", { exact: true })).toHaveValue(name);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Review your plan" })).toBeVisible();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect.poll(async () => prisma.mix.count({ where: { workspaceId: "demo_workspace", name, status: "DRAFT" } })).toBe(1);
    const mix = await prisma.mix.findFirstOrThrow({ where: { workspaceId: "demo_workspace", name } });
    expect(await prisma.jump.count({ where: { mixId: mix.id } })).toBe(0);
  } finally { await prisma.mix.deleteMany({ where: { workspaceId: "demo_workspace", name } }); }
});
