import { createHash, randomBytes, randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { MARKETING_SCENARIO_VERSION } from "../src/lib/marketing-scenarios";
import { formatDate, formatTime } from "../src/lib/format";
import { starterPlanForReason } from "../src/lib/journey-starts";
import { axeInPage } from "./axe-in-page";

// Onboarding starts with one person and one follow-up, on about two phone screens (D73); once that follow-up is ready,
// Today offers a complete Mega-Mix as the optional next step, suggested from the business type or the marketing example
// (JITM-09 §2.20, B-17).
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.setTimeout(120_000);
const users: string[] = [];
const errors: string[] = [];

async function account(page: Page, options: { scenario?: string; megaMix?: boolean } = {}) {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { name: "First Start Owner", email: `first-start-${suffix}@example.test`, emailVerifiedAt: new Date() } }); users.push(user.id);
  const workspace = await prisma.workspace.create({ data: { name: "First start fixture", slug: suffix, ownerId: user.id, members: { create: { userId: user.id } }, profile: { create: { onboardingDone: false } } } });
  await prisma.userPreference.create({ data: { userId: user.id, timezone: "UTC" } });
  if (options.scenario) await prisma.workspaceMarketingPreference.create({ data: { workspaceId: workspace.id, scenario: options.scenario, version: MARKETING_SCENARIO_VERSION } });
  if (options.megaMix) await prisma.megaMixPipeline.create({ data: { workspaceId: workspace.id, name: "Existing Mega-Mix" } });
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  await page.context().clearCookies();
  await page.context().addCookies([{ name: "jitm_session", value: token, url: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000", httpOnly: true, sameSite: "Strict" }]);
  await page.request.get("/api/auth/browser-context");
}

async function prepareFirstFollowUp(page: Page, choices: { businessType?: string; email?: boolean } = {}) {
  await page.goto("/onboarding");
  await expect(page.getByRole("button", { name: "Set up a whole pipeline instead", exact: true })).toBeVisible();
  if (choices.businessType) await page.getByLabel("Type of business").selectOption(choices.businessType);
  await page.getByLabel("Name", { exact: true }).fill("Riley Example");
  await page.getByLabel("Mobile phone").fill("+1 (555) 010-0142");
  if (choices.email) await page.getByRole("textbox", { name: "Email optional" }).fill("riley@example.test");
  await Promise.all([page.waitForURL(/\/jumps\?.*welcome=1/), page.getByRole("button", { name: "Start Riley’s follow-up" }).click()]);
  await expect(page.getByText("Your first follow-up for Riley Example is ready.")).toBeVisible();
}

test.beforeAll(async () => {
  await prisma.dateType.upsert({ where: { scopeKey_slug: { scopeKey: "system", slug: "follow-up" } }, create: { scopeKey: "system", slug: "follow-up", name: "Follow-up", isSystem: true }, update: {} });
});
test.beforeEach(({ page }) => { errors.length = 0; page.on("pageerror", error => errors.push(error.message)); });
test.afterEach(async () => {
  await prisma.contactActivity.deleteMany({ where: { actorUserId: { in: users } } });
  await prisma.workspace.deleteMany({ where: { ownerId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } }); users.length = 0;
  expect(errors).toEqual([]);
});

test("a real estate start offers the Real estate Mega-Mix as the optional next step", async ({ page }) => {
  await account(page);
  await prepareFirstFollowUp(page, { businessType: "Real estate" });
  const next = page.getByRole("link", { name: "Set up the Real estate Mega-Mix", exact: true });
  await expect(next).toHaveAttribute("href", "/templates/journeys?journey=real-estate");
  const accessibility = await axeInPage(page).include(".notice").analyze();
  expect(accessibility.violations).toEqual([]);
  await next.click();
  await expect(page.getByRole("heading", { name: "Real estate Mega-Mix" })).toBeVisible();
});

test("a realtor's first follow-up comes from the Real estate journey, starting with a new buyer lead", async ({ page }) => {
  await account(page);
  await page.goto("/onboarding");
  await page.getByLabel("Type of business").selectOption("Real estate");
  const reason = page.getByLabel("What’s it about?");
  await expect(reason).toHaveValue("Reply to a new buyer lead");
  await expect(reason.locator("option")).toHaveText(["Reply to a new buyer lead", "Reply to a new seller lead", "Follow up after a showing or open house", "Check back when they asked you to",
    "Update a client who is under contract", "Check in after closing", "Keep in touch with a past client"]);
  const preview = page.getByRole("region", { name: "Preview of the first follow-up" });
  await expect(preview.getByRole("heading", { name: "New buyer lead", exact: true })).toBeVisible();
  await expect(preview).toContainText("thanks for reaching out about buying a home");
  // Real dates on the 12-hour clock, the first on the chosen day (D73, D79).
  await expect(preview.locator(".onboarding-preview-when")).toHaveText(/^(Text|Email|Call) · \w{3}, \w{3} \d{1,2} · \d{1,2}:\d{2}\s(AM|PM)$/);
  await expect(preview.locator(".onboarding-preview-later li").first()).toHaveText(/^Then (text|email|call): .+ · \w{3}, \w{3} \d{1,2} · \d{1,2}:\d{2}\s(AM|PM)$/);
  await expect(preview).not.toContainText(/estimate/i);
  await reason.selectOption("Follow up after a showing or open house");
  await expect(preview.getByRole("heading", { name: "After a showing or open house", exact: true })).toBeVisible();
  await reason.selectOption("Reply to a new buyer lead");
  await page.getByLabel("Name", { exact: true }).fill("Riley Example");
  await page.getByLabel("Mobile phone").fill("+1 (555) 010-0142");
  await Promise.all([page.waitForURL(/\/jumps\?.*welcome=1/), page.getByRole("button", { name: "Start Riley’s follow-up" }).click()]);
  await expect(page.getByText("Your first follow-up for Riley Example is ready.")).toBeVisible();
  const workspace = await prisma.workspace.findFirstOrThrow({ where: { ownerId: users.at(-1)! } });
  const first = await prisma.jump.findFirstOrThrow({ where: { workspaceId: workspace.id }, orderBy: { scheduledAt: "asc" } });
  expect(JSON.stringify(first.renderedSnapshot)).toContain("thanks for reaching out about buying a home");
  expect(JSON.stringify(first.renderedSnapshot)).not.toMatch(/estimate|my business/i);
});

test("the marketing example names its Mega-Mix even when several share the business type", async ({ page }) => {
  await account(page, { scenario: "photography" });
  await prepareFirstFollowUp(page, { email: true });
  await expect(page.getByRole("link", { name: "Set up the Photographer Mega-Mix", exact: true })).toHaveAttribute("href", "/templates/journeys?journey=photographer");
});

test("a business type that several Mega-Mixes share opens the list to choose from", async ({ page }) => {
  await account(page);
  await prepareFirstFollowUp(page, { businessType: "Professional services" });
  await expect(page.getByRole("link", { name: "Choose a complete Mega-Mix", exact: true })).toHaveAttribute("href", "/templates/journeys");
});

test("no Mega-Mix is suggested when the account already has one", async ({ page }) => {
  await account(page, { megaMix: true });
  await prepareFirstFollowUp(page, { businessType: "Real estate" });
  await expect(page.getByRole("link", { name: /Mega-Mix/ })).toHaveCount(0);
});

test("the preview dates each Beat by the saved rules, as the started follow-up has them", async ({ page }) => {
  await account(page);
  const workspace = await prisma.workspace.findFirstOrThrow({ where: { ownerId: users.at(-1)! } });
  // Weekends move to Monday, and quiet hours last until 11:00 (PRV-01).
  await prisma.workspacePreference.create({ data: { workspaceId: workspace.id, weekendScheduling: "NEXT_MONDAY", quietHoursEnd: 11 * 60 } });
  const day = new Date(Date.now() + 2 * 86_400_000);
  while (day.getUTCDay() !== 6) day.setUTCDate(day.getUTCDate() + 1);
  await page.goto("/onboarding");
  await page.getByLabel("Follow up on", { exact: true }).fill(day.toISOString().slice(0, 10));
  const preview = page.getByRole("region", { name: "Preview of the first follow-up" });
  await expect(preview.locator(".onboarding-preview-when")).toHaveText(/^Text · Mon, \w{3} \d{1,2} · 11:00\sAM$/);
  const shown = [await preview.locator(".onboarding-preview-when").innerText(), ...await preview.locator(".onboarding-preview-later li").allInnerTexts()];
  await page.getByLabel("Name", { exact: true }).fill("Riley Example");
  await page.getByLabel("Mobile phone").fill("+1 (555) 010-0142");
  await Promise.all([page.waitForURL(/\/jumps\?.*welcome=1/), page.getByRole("button", { name: "Start Riley’s follow-up" }).click()]);
  const [jumpDate, jumps] = await Promise.all([prisma.jumpDate.findFirstOrThrow({ where: { workspaceId: workspace.id } }), prisma.jump.findMany({ where: { workspaceId: workspace.id }, orderBy: { scheduledAt: "asc" } })]);
  const preferences = { locale: "en-US", timeZone: jumpDate.timezone };
  const plain = (text: string) => text.replace(/\s+/g, " ");
  expect(shown.map(text => plain(text.split(" · ").slice(-2).join(" · ")))).toEqual(jumps.map(jump => plain(`${formatDate(jump.scheduledAt, preferences, { weekday: "short", year: undefined })} · ${formatTime(jump.scheduledAt, preferences)}`)));
});

test("a starter Mix the owner already has under that name is what the preview shows and the follow-up uses", async ({ page }) => {
  await account(page);
  const workspace = await prisma.workspace.findFirstOrThrow({ where: { ownerId: users.at(-1)! } });
  const plan = starterPlanForReason("Home services", "Follow up about an estimate or quote")!;
  const followUp = await prisma.dateType.findFirstOrThrow({ where: { scopeKey: "system", slug: "follow-up" } });
  // An earlier setup made this starter and the owner edited it; setup reuses it (ensureStarterMix).
  const template = await prisma.stepTemplate.create({ data: { workspaceId: workspace.id, name: `${plan.title} — Quote check-in`, channel: "SMS" } });
  const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Hi {{First Name}}, it’s Sam. Any questions about the quote?" } });
  await prisma.mix.create({ data: { workspaceId: workspace.id, name: plan.title, source: "STARTER", status: "ACTIVE", triggerMode: "DATE_TRIGGERED", dateTypeId: followUp.id, steps: { create: [{ stepVersionId: version.id, dayOffset: 0, sendTimeMinutes: 600, sortOrder: 1 }] } } });
  await page.goto("/onboarding");
  const preview = page.getByRole("region", { name: "Preview of the first follow-up" });
  await expect(preview.getByRole("heading", { name: plan.title, exact: true })).toBeVisible();
  await expect(preview.locator(".onboarding-preview-message")).toHaveText("Hi there, it’s Sam. Any questions about the quote?");
  await expect(preview.locator(".onboarding-preview-later")).toHaveCount(0);
  await page.getByLabel("Name", { exact: true }).fill("Riley Example");
  await page.getByLabel("Mobile phone").fill("+1 (555) 010-0142");
  await expect(preview.locator(".onboarding-preview-message")).toHaveText("Hi Riley, it’s Sam. Any questions about the quote?");
  await Promise.all([page.waitForURL(/\/jumps\?.*welcome=1/), page.getByRole("button", { name: "Start Riley’s follow-up" }).click()]);
  const jump = await prisma.jump.findFirstOrThrow({ where: { workspaceId: workspace.id } });
  expect(JSON.stringify(jump.renderedSnapshot)).toContain("Hi Riley, it’s Sam. Any questions about the quote?");
});

test("a saved person is previewed with their stored names, as the message will use them", async ({ page }) => {
  await account(page);
  const workspace = await prisma.workspace.findFirstOrThrow({ where: { ownerId: users.at(-1)! } });
  // An import row named by its company has no first name, and a title stays out of the greeting.
  await prisma.contact.createMany({ data: [{ workspaceId: workspace.id, displayName: "Acme Supply" }, { workspaceId: workspace.id, displayName: "Dr. Jane Smith", firstName: "Jane", lastName: "Smith" }] });
  await page.goto("/onboarding");
  const preview = page.getByRole("region", { name: "Preview of the first follow-up" });
  await page.getByLabel("Choose a saved person").selectOption({ label: "Dr. Jane Smith" });
  await expect(preview.getByRole("heading", { level: 2 })).toHaveText("Jane’s first follow-up");
  await expect(preview.locator(".onboarding-preview-message")).toContainText("Hi Jane,");
  await expect(page.getByRole("button", { name: "Start Jane’s follow-up", exact: true })).toBeVisible();
  await page.getByLabel("Choose a saved person").selectOption({ label: "Acme Supply" });
  await expect(preview.getByRole("heading", { level: 2 })).toHaveText("Their first follow-up");
  await expect(preview.locator(".onboarding-preview-message mark").first()).toHaveText("there");
  await expect(page.getByRole("button", { name: "Start the follow-up", exact: true })).toBeVisible();
});

test("a failed refresh of the dates disables Start until the preview is back, and the edited signature is the one saved", async ({ page }) => {
  await account(page);
  await page.goto("/onboarding");
  const start = page.getByRole("button", { name: /^Start .*follow-up$/ });
  await expect(start).toBeEnabled();
  await page.getByRole("button", { name: "Change how you sign texts", exact: true }).click();
  await page.getByLabel("Sign texts as").fill("Sam at Lee Plumbing");
  // The next request for the preview fails (STA-01).
  await page.route("**/api/onboarding/preview**", route => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  await page.getByLabel("Follow up on", { exact: true }).fill(new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10));
  await expect(page.getByRole("alert").filter({ hasText: "The preview is unavailable." })).toBeVisible();
  await expect(start).toBeDisabled();
  await expect(start).toHaveAttribute("aria-describedby", "starter-preview-status");
  await page.unroute("**/api/onboarding/preview**");
  await page.getByRole("button", { name: "Retry preview", exact: true }).click();
  await expect(start).toBeEnabled();
  await page.getByLabel("Name", { exact: true }).fill("Riley Example");
  await Promise.all([page.waitForURL(/\/jumps\?.*welcome=1/), page.getByRole("button", { name: "Start Riley’s follow-up", exact: true }).click()]);
  const profile = await prisma.workspaceProfile.findFirstOrThrow({ where: { workspace: { ownerId: users.at(-1)! } } });
  expect(profile.smsSignature).toBe("Sam at Lee Plumbing");
});

test("Start waits while new dates load, and Enter in the signature then stays put", async ({ page }) => {
  await account(page);
  await page.goto("/onboarding");
  const start = page.getByRole("button", { name: /^Start .*follow-up$/ });
  await expect(start).toBeEnabled();
  await page.getByRole("button", { name: "Change how you sign texts", exact: true }).click();
  // The next preview answers slowly (TST-03).
  let release = () => {};
  await page.route("**/api/onboarding/preview**", async route => { await new Promise<void>(resolve => { release = resolve; }); await route.continue(); });
  await page.getByLabel("Follow up on", { exact: true }).fill(new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10));
  await expect(page.getByText("Updating the dates…")).toBeVisible();
  await expect(start).toBeDisabled();
  await expect(start).toHaveAttribute("aria-describedby", "starter-preview-status");
  // Enter in the signature doesn't skip past the disabled Start to "Skip for now" (INT-03).
  const signature = page.getByLabel("Sign texts as");
  await signature.focus();
  await signature.press("Enter");
  await expect(signature).toBeFocused();
  release();
  await expect(start).toBeEnabled();
  await expect(page.getByText("Updating the dates…")).toHaveCount(0);
});

test("Enter in a field moves to the next one and never starts the follow-up", async ({ page }) => {
  await account(page);
  await page.goto("/onboarding");
  await expect(page.getByRole("button", { name: "Start the follow-up", exact: true })).toBeEnabled();
  const name = page.getByLabel("Name", { exact: true });
  await name.fill("Riley Example");
  await name.press("Enter");
  await expect(page.getByLabel("Mobile phone")).toBeFocused();
  const business = page.getByRole("textbox", { name: "Business name optional", exact: true });
  await business.fill("Lee Plumbing");
  await business.press("Enter");
  await expect(page.getByLabel("What’s it about?")).toBeFocused();
  await page.getByLabel("Follow up on", { exact: true }).press("Enter");
  await page.waitForLoadState("networkidle");
  expect(new URL(page.url()).pathname).toBe("/onboarding");
  const workspace = await prisma.workspace.findFirstOrThrow({ where: { ownerId: users.at(-1)! } });
  expect(await prisma.mixAssignment.count({ where: { workspaceId: workspace.id } })).toBe(0);
});

test("switching to the pipeline and back focuses each view's heading in view, with the way back at the top", async ({ page }) => {
  await account(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/onboarding");
  await expect(page.getByRole("button", { name: "Start the follow-up", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Set up a whole pipeline instead", exact: true }).click();
  const pipeline = page.getByRole("heading", { level: 1, name: "Set up a whole pipeline", exact: true });
  await expect(pipeline).toBeFocused();
  await expect(pipeline).toBeInViewport();
  const back = page.getByRole("button", { name: "Start with one person and one follow-up instead", exact: true });
  await expect(back).toBeInViewport();
  await back.click();
  const onePerson = page.getByRole("heading", { level: 1, name: "Set up your first follow-up", exact: true });
  await expect(onePerson).toBeFocused();
  await expect(onePerson).toBeInViewport();
});

test("setup's text buttons are 44px targets, 8px or more apart, on phones", async ({ page }) => {
  await account(page);
  // The preview's error state shows Retry.
  await page.route("**/api/onboarding/preview**", route => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  const box = async (name: string) => (await page.getByRole("button", { name, exact: true }).boundingBox())!;
  const apart = (a: { x: number; y: number; width: number; height: number }, b: typeof a) => Math.max(b.x - a.x - a.width, a.x - b.x - b.width, b.y - a.y - a.height, a.y - b.y - b.height);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/onboarding");
    await expect(page.getByRole("button", { name: "Retry preview", exact: true })).toBeVisible();
    const [retry, skip, pipeline] = [await box("Retry preview"), await box("Skip for now"), await box("Set up a whole pipeline instead")];
    expect([width, retry.height, skip.height, pipeline.height].map(Math.round)).toEqual([width, 44, 44, 44]);
    expect(apart(skip, pipeline), `${width}: Skip and the pipeline link`).toBeGreaterThanOrEqual(8);
    await page.getByRole("button", { name: "Set up a whole pipeline instead", exact: true }).click();
    expect(Math.round((await box("Start with one person and one follow-up instead")).height)).toBeGreaterThanOrEqual(44);
    expect(Math.round((await box("Save answers and finish later")).height)).toBeGreaterThanOrEqual(44);
  }
});

test.describe("on a device whose timezone differs from the account's", () => {
  test.use({ timezoneId: "America/Chicago" });

  test("the one-person form fits about two phone screens, and its controls stay whole at 320px and 200% text", async ({ page }) => {
    await account(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/onboarding");
    await expect(page.getByRole("button", { name: "Start the follow-up", exact: true })).toBeEnabled();
    // D73: the person's name on the first screen; the start button within about 2.3 phone screens and the whole page,
    // Skip and the pipeline link included, within 2.5. A new account starts in UTC, so the form also shows the device's
    // timezone note, as here.
    const layout = await page.evaluate(() => ({ name: document.querySelector("#contactName")!.getBoundingClientRect().top + scrollY, start: [...document.querySelectorAll("button")].find(button => button.textContent === "Start the follow-up")!.getBoundingClientRect().bottom + scrollY, height: document.documentElement.scrollHeight }));
    expect(layout.name).toBeLessThan(844 - 120);
    expect(layout.start).toBeLessThanOrEqual(1_950);
    expect(layout.height).toBeLessThanOrEqual(2_100);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addStyleTag({ content: "html { font-size: 200% !important }" });
    // Against the layout's width: on the phone project innerWidth grows to fit wider content.
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);
    // The pipeline choices keep their radios whole beside long text.
    await page.getByRole("button", { name: "Set up a whole pipeline instead", exact: true }).click();
    const whole = await page.locator(".first-win-onboarding .checkbox-card > input:visible").evaluateAll(inputs => inputs.map(input => { const box = input.getBoundingClientRect(); return box.width >= box.height; }));
    expect(whole.length).toBeGreaterThanOrEqual(2);
    expect(whole).not.toContain(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);
  });

  test("an untouched form reports no unsaved changes and leaves without asking", async ({ page }) => {
    await account(page);
    await page.goto("/onboarding");
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: /^Start .*follow-up$/ }) });
    // The page fills in the device timezone, today's date there and the starter preview; none of that is the person's change.
    await expect(form.getByText("Detected from this device for follow-up times.", { exact: false })).toBeVisible();
    await expect(form.getByRole("button", { name: /^Start .*follow-up$/ })).toBeEnabled();
    const unsaved = form.getByRole("status").filter({ hasText: "Unsaved changes" });
    await expect(unsaved).toHaveCount(0);
    const prompts: string[] = [];
    page.on("dialog", dialog => { prompts.push(dialog.message()); void dialog.dismiss(); });
    expect(await page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(false);
    // What the person types is still protected, and undoing it clears the warning.
    const name = page.getByLabel("Name", { exact: true });
    await name.fill("Riley Example");
    await expect(unsaved).toHaveCount(1);
    await name.fill("");
    await expect(unsaved).toHaveCount(0);
    await Promise.all([page.waitForURL(url => url.pathname === "/"), page.getByRole("link", { name: "Jump in the Mix home" }).click()]);
    expect(prompts).toEqual([]);
  });
});
