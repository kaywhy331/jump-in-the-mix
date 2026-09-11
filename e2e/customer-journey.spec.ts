import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { axeInPage } from "./axe-in-page";
import { test, expect, type BrowserContext, type Page, type Locator } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { decryptIntegrationCredentials } from "../src/lib/integration-crypto";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off" });
test.setTimeout(180_000);
test.describe.configure({ mode: "serial" });
let workspaceId: string, userId: string, contactId: string, hostedId: string;
let cookies: Awaited<ReturnType<BrowserContext["cookies"]>>;
const password = "JourneyFixture123!";
async function submit(page: Page, button: Locator) { await Promise.all([page.waitForResponse(response => response.request().method() === "POST"), button.click()]); }
async function openDetails(summary: Locator) { if (!await summary.evaluate(element => element.parentElement?.hasAttribute("open"))) await summary.click(); }
test.beforeAll(async ({ browser }) => {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { email: `browser-journey-${suffix}@example.com`, name: "Journey owner", passwordHash: await bcrypt.hash(password,4), emailVerifiedAt: new Date() } }); userId = user.id;
  const workspace = await prisma.workspace.create({ data: { name: "Sample Journey Business", slug: `browser-journey-${suffix}`, ownerId: user.id, members: { create: { userId: user.id } }, profile: { create: { onboardingDone: true } } } }); workspaceId = workspace.id;
  await prisma.userPreference.create({ data: { userId, timezone: "America/Los_Angeles" } });
  contactId = (await prisma.contact.create({ data: { workspaceId, displayName: "Jordan Sample", emails: { create: { email: "jordan@example.com", normalized: "jordan@example.com", isPrimary: true } } } })).id;
  const page = await browser.newPage(); page.setDefaultTimeout(90_000);
  await page.goto("/login"); await page.getByLabel("Email",{ exact: true }).fill(user.email); await page.getByLabel("Password",{ exact: true }).fill(password);
  await Promise.all([page.waitForURL(/\/jumps/),page.getByRole("button",{ name: "Sign in", exact: true }).click()]); cookies = await page.context().cookies(); await page.close();
});
test.beforeEach(async ({ context, page }) => { await context.addCookies(cookies); page.setDefaultTimeout(25_000); page.setDefaultNavigationTimeout(90_000); });
test.afterAll(async () => { if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } }); if (userId) await prisma.user.deleteMany({ where: { id: userId } }); });

test("owners configure stages, custom triggers, order and individual pauses", async ({ page }) => {
  await page.goto("/settings/journey"); await submit(page, page.getByRole("button",{ name: "Use this starting journey" }));
  await expect(page.getByRole("heading",{ name: "Automatic transitions are on" })).toBeVisible();
  await page.getByText("Add another stage",{ exact: true }).click();
  const add = page.locator("details").filter({ has: page.locator('input[placeholder="For example, Proposal or Past customer"]') });
  await add.getByLabel("Stage name").fill("Proposal"); await submit(page, add.getByRole("button",{ name: "Add stage", exact: true }));
  const proposal = page.locator(".journey-stage-settings").filter({ has: page.locator("summary strong",{ hasText: /^Proposal$/ }) });
  await proposal.locator("summary").first().click(); await submit(page, proposal.getByRole("button",{ name: "Move earlier" }));
  const ordered = await prisma.journeyStage.findMany({ where: { workspaceId }, orderBy: { position: "asc" } }); expect(ordered.map(stage => stage.name)).toEqual(["Lead","Prospect","Client","Proposal","Retention"]);
  await page.goto(`/contacts/${contactId}`); await openDetails(page.getByText("Stage and automation",{ exact: true }));
  const lead = ordered.find(stage => stage.name === "Lead")!; await page.getByLabel("Move to stage").selectOption(lead.id); await submit(page, page.getByRole("button",{ name: "Move stage", exact: true }));
  await expect(page.locator(".journey-current")).toContainText("Lead");
  await openDetails(page.getByText("Stage and automation",{ exact: true })); await submit(page, page.getByRole("button",{ name: "Pause transitions for this person" }));
  await expect(page.locator(".contact-journey-panel")).toContainText("Automatic transitions are paused"); await expect(page.getByRole("button",{ name: "Record a sale", exact: true })).toHaveCount(0);
  await openDetails(page.getByText("Stage and automation",{ exact: true })); await submit(page, page.getByRole("button",{ name: "Resume transitions for this person" }));
  await page.goto("/journey"); await expect(page.getByRole("link",{ name: /Jordan Sample/ })).toBeVisible();
});

test("meeting booking advances the journey, retains invalid form input and exports a calendar", async ({ page }) => {
  await page.goto(`/calendar?contact=${contactId}&date=2026-09-10`);
  const form = page.locator("#schedule-event form").filter({ has: page.locator('input[name="title"]') });
  const pickStart = async (time: string) => { await form.locator(".when-trigger.time").click(); const sheet = page.getByRole("dialog", { name: "Starts", exact: true }); await sheet.getByRole("button", { name: time, exact: true }).click(); await expect(sheet).toBeHidden(); };
  await form.getByLabel("Title",{ exact: true }).fill("Discovery with Jordan"); await pickStart("9:00 AM"); await form.getByRole("button", { name: "30 min", exact: true }).click();
  await expect(form.locator('input[name="startsAt"]')).toHaveValue("2026-09-10T09:00"); await expect(form.locator('input[name="endsAt"]')).toHaveValue("2026-09-10T09:30");
  await submit(page, form.getByRole("button",{ name: "Save event", exact: true })); await expect(page.getByText("Calendar updated.",{ exact: true })).toBeVisible();
  await expect(page.locator(".calendar-event")).toContainText("Discovery with Jordan");
  expect((await prisma.contactJourney.findUniqueOrThrow({ where: { contactId }, include: { stage: true } })).stage.name).toBe("Prospect");
  await form.getByLabel("Title",{ exact: true }).fill("Conflicting block"); await form.getByLabel("Event type").selectOption("BLOCK"); await submit(page, form.getByRole("button",{ name: "Save event", exact: true }));
  await expect(form.getByRole("alert")).toContainText("overlaps"); await expect(form.getByLabel("Title",{ exact: true })).toHaveValue("Conflicting block");
  await form.locator(".when-trigger.time").click(); await expect(page.getByRole("dialog", { name: "Starts", exact: true }).getByRole("button", { name: /^9:00 AM, taken by Discovery with Jordan/ })).toBeDisabled(); await page.getByRole("dialog", { name: "Starts", exact: true }).getByRole("button", { name: "9:30 AM", exact: true }).click();
  await expect(form.locator('input[name="endsAt"]')).toHaveValue("2026-09-10T10:00"); await submit(page, form.getByRole("button",{ name: "Save event", exact: true }));
  await expect(page.locator(".calendar-event")).toHaveCount(2);
  // Exercise the browser's authenticated download. Its loopback secure-cookie
  // behavior differs from Playwright's separate API client when CI uses HTTP.
  const downloaded = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download calendar", exact: true }).click();
  const download = await downloaded; expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.ics$/);
  const calendar = await readFile((await download.path())!, "utf8");
  expect(calendar).toContain("BEGIN:VCALENDAR"); expect(calendar).toContain("Discovery with Jordan");
  await openDetails(page.getByText("Show Jump in the Mix in another calendar",{ exact: true })); await submit(page, page.getByRole("button",{ name: "Create private subscription link" }));
  await openDetails(page.getByText("Show Jump in the Mix in another calendar",{ exact: true })); const url = await page.getByLabel("Subscription URL",{ exact: true }).inputValue();
  expect((await page.request.get(url)).status()).toBe(200); await submit(page, page.getByRole("button",{ name: "Disable subscription", exact: true })); expect((await page.request.get(url)).status()).toBe(404);
});

test("connection setup supports authenticated retries, ambiguous review, rotation and pause", async ({ page }) => {
  await page.goto("/settings/connections"); await page.getByLabel("Connection name",{ exact: true }).fill("Sample CRM"); await page.getByRole("combobox",{ name: "Source", exact: true }).selectOption("CRM"); await submit(page, page.getByRole("button",{ name: "Create connection", exact: true }));
  const setup = page.locator(".connection-setup[open]"); await expect(setup).toContainText("Sample CRM");
  const endpoint = await setup.getByLabel("Endpoint",{ exact: true }).inputValue(); const key = await setup.getByLabel("Private key",{ exact: true }).inputValue();
  const data = { eventId: "browser-inquiry", externalId: "jordan-crm", email: "jordan@example.com", eventType: "SALE_CONFIRMED" };
  const send = (token: string, payload = data) => page.request.post(endpoint,{ headers: { "X-JITM-Key": token }, data: payload });
  expect((await send("invalid")).status()).toBe(401); expect((await send(key)).status()).toBe(201); const duplicate = await send(key); expect(duplicate.status()).toBe(200); expect((await duplicate.json()).duplicate).toBe(true);
  expect((await prisma.contactJourney.findUniqueOrThrow({ where: { contactId }, include: { stage: true } })).stage.name).toBe("Client");
  await setup.getByRole("button",{ name: "Replace private key…" }).click(); await submit(page, page.getByRole("dialog").getByRole("button",{ name: "Replace key", exact: true }));
  expect((await send(key)).status()).toBe(401); await expect(page.getByLabel("Private key",{ exact: true })).not.toHaveValue(key); const newKey = await page.getByLabel("Private key",{ exact: true }).inputValue();
  await expect(page.locator(".confirm-dialog[open]")).toHaveCount(0);
  const other = await prisma.contact.create({ data: { workspaceId, displayName: "Other sample", emails: { create: { email: "ambiguous@example.com", normalized: "ambiguous@example.com" } } } });
  const ambiguous = { ...data, eventId: "browser-ambiguous", email: "ambiguous@example.com" }; expect((await send(newKey,ambiguous)).status()).toBe(202);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");
  // Exercise the browser's reload rather than relying on a protocol-level
  // navigation completion signal. The new receipt proves a fresh document.
  await page.evaluate(() => window.location.reload());
  await expect(page.locator("#needs-review")).toContainText("Needs a person’s eye · 1");
  await page.waitForFunction(() => document.readyState === "complete");
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");
  await page.getByRole("combobox",{ name: "Matching contact", exact: true }).selectOption(other.id); await submit(page, page.getByRole("button",{ name: "Link to selected person", exact: true })); await expect(page.locator("#needs-review")).toContainText("No inquiries waiting");
  await page.locator(".connection-setup > summary").first().click(); await submit(page, page.getByRole("button",{ name: "Pause this connection", exact: true })); expect((await send(newKey)).status()).toBe(401);
});

test("a public form accepts a request without exposing contact matches or signing in", async ({ page, browser }) => {
  await page.goto("/settings/connections"); await page.getByLabel("Connection name",{ exact: true }).fill("Website form"); await submit(page, page.getByRole("button",{ name: "Create connection", exact: true }));
  const url = await page.getByLabel("Form link",{ exact: true }).inputValue(); hostedId = new URL(url).pathname.split("/").at(-1)!;
  const publicPage = await browser.newPage(); await publicPage.goto(url); await expect(publicPage.getByRole("heading",{ name: "Let’s get in touch" })).toBeVisible();
  await publicPage.getByLabel("Your name",{ exact: true }).fill("Public sample"); await publicPage.getByLabel("Email",{ exact: true }).fill("public-sample@example.com"); await publicPage.getByLabel("How can we help?",{ exact: true }).fill("This is an isolated test inquiry."); await publicPage.getByRole("checkbox").check();
  await submit(publicPage, publicPage.getByRole("button",{ name: "Send request", exact: true })); await expect(publicPage.getByRole("heading",{ name: "Thanks for reaching out." })).toBeVisible();
  expect(new URL(publicPage.url()).pathname).toBe(`/lead/${hostedId}`);
  const source = await prisma.intakeConnection.findUniqueOrThrow({ where: { id: hostedId } }); expect(decryptIntegrationCredentials<string>(source.tokenEncrypted)).toHaveLength(43);
  expect(await prisma.intakeReceipt.count({ where: { connectionId: hostedId, status: "ACCEPTED" } })).toBe(1);
  await publicPage.close();
});

test("journey, calendar and connection views are accessible in both themes and narrow layouts", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror",error => errors.push(error.message));
  for (const route of ["/journey","/settings/journey","/calendar?date=2026-09-10","/settings/connections",`/lead/${hostedId}`]) {
    const response = await page.goto(route); expect(response?.status()).toBe(200); expect(page.url()).not.toContain("/login");
    if (!route.startsWith("/lead/")) await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "", { timeout: 60_000 });
    if (route === "/settings/journey") await page.locator(".journey-stage-settings > summary").first().click();
    if (route === "/settings/connections") await page.locator(".connection-setup > summary").last().click();
    for (const theme of ["light","dark"] as const) for (const width of [390,1440]) {
      await test.step(`${route} ${theme} at ${width}px`, async () => {
        await page.emulateMedia({ colorScheme: theme }); await page.setViewportSize({ width, height: 900 });
        // Finish visible-link prefetches before evaluating a settled layout or
        // leaving this document; WebKit reports canceled prefetches as errors.
        await page.waitForLoadState("networkidle");
        await page.evaluate(async () => {
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          const transitions = document.getAnimations().filter(animation => "transitionProperty" in animation && animation.playState === "running");
          await Promise.all(transitions.map(animation => Promise.race([animation.finished.catch(() => undefined), new Promise<void>(resolve => setTimeout(resolve, 500))])));
        });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1),`${theme} ${width} ${route} overflow`).toBe(true);
        const result = await axeInPage(page).withTags(["wcag2a","wcag2aa","wcag21aa","wcag22aa"]).analyze();
        expect(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })),`${theme} ${width} ${route}`).toEqual([]);
      });
    }
    await page.waitForLoadState("networkidle");
  }
  expect(errors).toEqual([]);
});
