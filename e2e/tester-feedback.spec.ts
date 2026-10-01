import { expect, test } from "@playwright/test";
import { axeInPage } from "./axe-in-page";
import { mkdir } from "node:fs/promises";
import { prisma } from "../src/lib/prisma";
import { createSupportFixture } from "../tests/helpers/support-fixture";

const enabled = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
test.skip(!enabled, "Requires a disposable loopback database.");
test.use({ screenshot: "off", trace: "off", video: "off" });
let fixture: Awaited<ReturnType<typeof createSupportFixture>>;
test.beforeEach(async ({ context }, info) => {
  fixture = await createSupportFixture();
  await context.addCookies([{ name: "jitm_session", value: fixture.customer.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
});
test.afterEach(async () => { if (fixture) await fixture.cleanup(); });

test("a tester reviews safe diagnostics, submits feedback, and finds the conversation", async ({ page }, info) => {
  await page.goto("/help");
  await page.getByRole("link", { name: "Share feedback", exact: true }).click();
  const form = page.locator("#contact-support form");
  await expect(form.locator('input[name="supportDiagnostics"]')).toHaveCount(0);
  await form.getByLabel("Short title").fill("A synthetic save problem");
  await form.getByLabel("What happened?").fill("Saving person@example.test at +1 (202) 555-0147 failed. I expected the contact to appear.");
  await expect(form.locator(".support-report-preview")).toContainText("[email removed]");
  await form.getByLabel("Include basic diagnostics (optional)").check();
  await form.getByLabel("Affected section").selectOption("Contacts");
  await expect(form.locator(".support-diagnostics-preview")).toContainText("Contacts;");
  await form.getByRole("button", { name: "Send feedback", exact: true }).click();
  await expect(page).toHaveURL(/\/account\/tickets\/[^/?]+\?created=1/);
  await expect(page.getByRole("heading", { name: "A synthetic save problem" })).toBeVisible();
  const ticket = await prisma.supportTicket.findFirstOrThrow({ where: { workspaceId: fixture.workspace.id, title: "A synthetic save problem" }, include: { messages: true } });
  expect(ticket.messages[0].body).toContain("Included context: Contacts;");
  expect(ticket.messages[0].body).not.toMatch(/person@|555-0147/);
  await page.goto("/account/tickets");
  await expect(page.getByRole("link").filter({ hasText: "A synthetic save problem" })).toBeVisible();
});

test("feedback fields reflow, remain keyboard accessible, and meet automated accessibility checks", async ({ page }, info) => {
  await page.goto("/help#contact-support");
  await page.getByLabel("Include basic diagnostics (optional)").check();
  await mkdir(".artifacts/tester-readiness/captures", { recursive: true });
  const widths = info.project.name === "mobile-chromium" ? [320, 390, 767, 768] : [900, 901, 1280, 1440];
  for (const theme of ["light", "dark"]) for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(value => document.documentElement.setAttribute("data-theme", value), theme);
    await page.locator("#contact-support").scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const controls = page.locator('#contact-support select, #contact-support input:not([type="hidden"]):not([type="checkbox"]), #contact-support button');
    for (const control of await controls.all()) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await axeInPage(page).include("#contact-support").analyze()).violations).toEqual([]);
    await page.locator(".support-contact-card").screenshot({ path: `.artifacts/tester-readiness/captures/feedback-${theme}-${width}.png` });
  }
  await page.getByLabel("Short title").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("What happened?")).toBeFocused();
  await page.evaluate(() => document.documentElement.style.fontSize = "200%");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await expect(page.getByRole("button", { name: "Send feedback", exact: true })).toBeVisible();
});

test("an empty Today offers a working first-person action", async ({ page }) => {
  await page.goto("/jumps");
  await expect(page.getByRole("heading", { name: "Nothing due right now" })).toBeVisible();
  await page.getByRole("link", { name: "Add a person", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Add a contact", exact: true })).toBeVisible();
});
