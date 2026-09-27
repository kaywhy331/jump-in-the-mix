import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { prisma } from "../src/lib/prisma";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Disposable local database only");
test.describe.configure({ mode: "serial" });

const EMAIL = "demo@jumpinthemix.local";
let issuedBefore = 0;

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill("JumpInTheMix123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/jumps/);
}

test.beforeAll(async () => {
  issuedBefore = (await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } })).referralInvitesIssued;
});
test.afterAll(async () => {
  await prisma.user.update({ where: { email: EMAIL }, data: { referralInvitesIssued: issuedBefore } });
});

test("members see how many invitations they have left wherever they work", async ({ page }, testInfo) => {
  await prisma.user.update({ where: { email: EMAIL }, data: { referralInvitesIssued: 1 } });
  await signIn(page);
  const phone = testInfo.project.name === "mobile-chromium";
  // Today carries the prompt at the top of the list.
  const strip = page.getByRole("region", { name: "Personal invitations" });
  await expect(strip).toContainText("You have 2 invitations to share.");
  // Desktop: the sidebar callout. Phone: a count on the More tab, which opens the invitation card.
  const shortcut = (phone ? page.getByRole("link", { name: "More: 2 invitations left" }) : page.getByRole("link", { name: "Invite people: 2 invitations left" })).filter({ visible: true });
  await expect(shortcut).toHaveCount(1);
  if (phone) await expect(shortcut.locator(".invite-count")).toHaveText("2");
  else await expect(shortcut).toContainText("2 invitations left");
  expect((await shortcut.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    const audit = await new AxeBuilder({ page }).include(".invite-strip").include(phone ? ".mobile-nav" : ".invite-callout").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(audit.violations.map(item => item.id), theme).toEqual([]);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await strip.getByRole("link", { name: "Invite people", exact: true }).click();
  await page.waitForURL(/\/mixes\/system/);
  await expect(page.getByRole("heading", { name: "2 of 3 invitations remaining" })).toBeVisible();

  await page.goto("/more");
  await expect(page.getByRole("link", { name: /Invite people · 2 invitations left/ })).toBeVisible();
});

test("the prompts disappear once every invitation is used", async ({ page }) => {
  await prisma.user.update({ where: { email: EMAIL }, data: { referralInvitesIssued: 3 } });
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Personal invitations" })).toHaveCount(0);
  await expect(page.locator(".invite-callout, .mobile-invite-link, .nav-badge")).toHaveCount(0);
  await page.goto("/more");
  await expect(page.locator(".invite-hub-card")).toHaveCount(0);
});
