import { expect, test, type Page } from "@playwright/test";
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

const fields = (page: Page) => page.locator("#contact-support form");
async function prepare(page: Page, title: string, body: string, diagnostics: boolean) {
  await page.goto("/help#contact-support");
  const form = fields(page);
  await form.getByLabel("Short title").fill(title);
  await form.getByLabel("What happened?").fill(body);
  if (diagnostics) {
    await form.getByLabel("Include basic diagnostics (optional)").check();
    await form.getByLabel("Affected section").selectOption("Contacts");
  }
  return form;
}
async function suffix(page: Page): Promise<string> {
  const input = fields(page).locator('input[name="supportDiagnostics"]');
  if (!await input.count()) return "";
  const d = JSON.parse(await input.inputValue());
  return `\n\nIncluded context: ${d.section}; ${d.layout} layout; ${d.browser}; ${d.theme} theme; ${d.connection}`;
}
async function submitAndRead(page: Page) {
  await fields(page).getByRole("button", { name: "Send feedback", exact: true }).click();
  await expect(page).toHaveURL(/\/account\/tickets\/[^/?]+\?created=1/);
  const id = new URL(page.url()).pathname.split("/").pop()!;
  return prisma.supportTicket.findUniqueOrThrow({ where: { id }, include: { messages: true } });
}

for (const diagnostics of [false, true]) {
  test(`support preview preserves exact expanded-text bounds with diagnostics ${diagnostics}`, async ({ page }) => {
    const rawTitle = "a@b.co ".repeat(20) + "TAIL";
    const rawBody = "a@b.co ".repeat(650) + "TAIL";
    const form = await prepare(page, rawTitle, rawBody, diagnostics);
    const attachment = await suffix(page);
    const expectedTitle = ("[email removed] ".repeat(20) + "TAIL").slice(0, 160);
    const expectedBody = ("[email removed] ".repeat(650) + "TAIL").slice(0, 5000 - attachment.length) + attachment;
    await expect(form.locator(".support-report-preview strong")).toHaveText(expectedTitle);
    expect(await form.locator(".support-report-preview p").textContent()).toBe(expectedBody);
    await expect(form.getByText("The title will be shortened.", { exact: false })).toBeVisible();
    await expect(form.getByText("5000/5000 characters will be saved.", { exact: false })).toBeVisible();
    await expect(form.getByLabel("Short title")).toHaveValue(rawTitle);
    await expect(form.getByLabel("What happened?")).toHaveValue(rawBody);
    const ticket = await submitAndRead(page);
    expect(ticket.title).toBe(expectedTitle);
    expect(ticket.messages[0].body).toBe(expectedBody);
    expect(ticket.title + ticket.messages[0].body).not.toContain("a@b.co");
  });

  test(`support preview counts serialized multiline text with diagnostics ${diagnostics}`, async ({ page }) => {
    const raw = "a\n".repeat(20) + "x".repeat(4946) + "TAIL";
    const form = await prepare(page, "Multiline synthetic report", raw, diagnostics);
    const attachment = await suffix(page);
    const expectedBody = "a\r\n".repeat(20) + "x".repeat(5000 - 60 - attachment.length) + attachment;
    await expect(form.getByText("5000/5000 characters will be saved.", { exact: false })).toBeVisible();
    await expect(form.getByText("The end of the report will not be saved.", { exact: false })).toBeVisible();
    expect((await form.locator(".support-report-preview p").textContent())!.replace(/\r\n/g, "\n")).toBe(expectedBody.replace(/\r\n/g, "\n"));
    await expect(form.getByLabel("What happened?")).toHaveValue(raw);
    const ticket = await submitAndRead(page);
    expect(ticket.messages[0].body).toBe(expectedBody);
    expect(ticket.messages[0].body).toHaveLength(5000);
    expect(ticket.messages[0].body).not.toContain("TAIL");
  });
}

test("support preview updates diagnostics and restores space after opt-out", async ({ page }) => {
  const raw = "x".repeat(5000);
  const form = await prepare(page, "Diagnostics boundary report", raw, true);
  for (const section of ["Contacts", "Help"]) {
    await form.getByLabel("Affected section").selectOption(section);
    const attachment = await suffix(page);
    expect(await form.locator(".support-report-preview p").textContent()).toBe("x".repeat(5000 - attachment.length) + attachment);
    await expect(form.locator('input[name="supportDiagnostics"]')).toHaveCount(1);
  }
  await form.getByLabel("Include basic diagnostics (optional)").uncheck();
  await expect(form.locator('input[name="supportDiagnostics"]')).toHaveCount(0);
  await expect(form.locator(".support-report-preview")).toHaveCount(0);
  await expect(form.getByText("The end of the report will not be saved.", { exact: false })).toHaveCount(0);
  const ticket = await submitAndRead(page);
  expect(ticket.messages[0].body).toBe(raw);
});

test("support keeps raw fields and diagnostics after two failed saves, then saves once", async ({ page }) => {
  const raw = "Synthetic person@example.test failed-save description.";
  const title = "Failed save synthetic report";
  const form = await prepare(page, title, raw, true);
  const intercept = async (route: import("@playwright/test").Route) => route.request().method() === "POST" ? route.abort("failed") : route.continue();
  await page.route("**/help", intercept);
  for (let i = 0; i < 2; i++) {
    await form.getByRole("button", { name: "Send feedback", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText("Your entries are kept");
    await expect(form.getByRole("alert")).toBeFocused();
    await expect(form.getByLabel("Short title")).toHaveValue(title);
    await expect(form.getByLabel("What happened?")).toHaveValue(raw);
    await expect(form.getByLabel("Include basic diagnostics (optional)")).toBeChecked();
    await expect(form.getByLabel("Affected section")).toHaveValue("Contacts");
  }
  expect(await prisma.supportTicket.count({ where: { workspaceId: fixture.workspace.id, title } })).toBe(0);
  await page.unroute("**/help", intercept);
  await submitAndRead(page);
  expect(await prisma.supportTicket.count({ where: { workspaceId: fixture.workspace.id, title } })).toBe(1);
});

test("standalone ticket reply diagnostics still work without a callback", async ({ page }) => {
  await page.goto(`/account/tickets/${fixture.ticket.id}`);
  const opt = page.getByLabel("Include basic diagnostics (optional)");
  await opt.check();
  await page.getByLabel("Affected section").selectOption("Help");
  await expect(page.locator(".support-diagnostics-preview")).toContainText("Help;");
  await expect(page.locator('input[name="supportDiagnostics"]')).toHaveCount(1);
  await opt.uncheck();
  await expect(page.locator('input[name="supportDiagnostics"]')).toHaveCount(0);
});
