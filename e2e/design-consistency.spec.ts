import { createHash, randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";

// Design-consistency audit (2026-09-23): one disclosure pattern and one confirmation dialog.
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off" });
test.setTimeout(120_000);
let workspaceId: string, userId: string, contactId: string;
const token = randomUUID();
test.beforeAll(async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { email: `consistency-${suffix}@example.com`, name: "Consistency owner", passwordHash: "fixture-only", emailVerifiedAt: new Date() } }); userId = user.id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: user.id, slug: `consistency-${suffix}`, name: "Consistency fixture", members: { create: { userId } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  contactId = (await prisma.contact.create({ data: { workspaceId, displayName: "Consistency person", phones: { create: { phone: "+15550102001", normalized: "+15550102001", isPrimary: true } } } })).id;
});
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, sameSite: "Strict" }]);
});
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});

async function disclosureRows(page: Page) {
  return page.locator("details > summary").evaluateAll(rows => rows.filter(row => row.getClientRects().length).map(row => {
    const after = getComputedStyle(row, "::after");
    const icon = row.querySelector(':scope > svg[data-icon="chevronDown"], :scope > svg[data-icon="more"]');
    return {
      text: row.textContent?.trim().slice(0, 40), height: row.getBoundingClientRect().height,
      marker: getComputedStyle(row).listStyleType,
      indicator: Boolean(icon) || (after.content !== "none" && after.maskImage !== "none"),
      clearOfText: Boolean(icon) || parseFloat(getComputedStyle(row).paddingRight) >= 24
    };
  }));
}

test("expandable sections share one indicator, 44px target and no native marker", async ({ page }) => {
  for (const route of ["/jumps", `/contacts/${contactId}`, "/contacts/new", "/calendar", "/settings/connections", "/help"]) {
    await test.step(route, async () => {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      for (const row of await disclosureRows(page)) {
        expect(row.indicator, `${route} ${row.text} indicator`).toBe(true);
        expect(row.clearOfText, `${route} ${row.text} chevron spacing`).toBe(true);
        expect(row.marker, `${route} ${row.text} marker`).toBe("none");
        expect(row.height, `${route} ${row.text} height`).toBeGreaterThanOrEqual(43.5);
      }
    });
  }
});

test("Quick Add discard uses the app confirmation with Cancel first and focused", async ({ page }) => {
  await page.goto("/jumps");
  await page.getByRole("button", { name: /Quick Add/ }).locator("visible=true").first().click();
  const quickAdd = page.getByRole("dialog", { name: "Quick Add" });
  await quickAdd.getByRole("textbox").first().fill("Call Jordan tomorrow at 9");
  await page.keyboard.press("Escape");
  const discard = page.getByRole("dialog", { name: "Discard this Quick Add draft?" });
  await expect(discard).toBeVisible();
  await expect(discard.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await expect(discard.getByRole("button", { name: "Close confirmation" })).toBeVisible();
  // Escape closes only the confirmation; the draft stays.
  await page.keyboard.press("Escape");
  await expect(discard).toBeHidden();
  await expect(quickAdd).toBeVisible();
  await expect(quickAdd.getByRole("textbox").first()).toHaveValue("Call Jordan tomorrow at 9");
  await quickAdd.getByRole("button", { name: "Close Quick Add" }).click();
  await discard.getByRole("button", { name: "Discard draft", exact: true }).click();
  await expect(quickAdd).toBeHidden();
});

test("Do not contact asks in the app dialog and Cancel leaves it off", async ({ page }) => {
  await page.goto(`/contacts/${contactId}`);
  const more = page.locator("#dates-and-mixes");
  await more.locator("> summary").click();
  await expect(more).toHaveAttribute("open", "");
  const toggle = page.getByRole("checkbox", { name: /Do not contact/ });
  await toggle.click({ force: true }); // stays unchecked until the dialog confirms
  const prompt = page.getByRole("dialog", { name: /^Stop 0 pending follow-ups for this person\?/ });
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(toggle).not.toBeChecked();
});

test("Profile sheet uses flat destination rows", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-chromium", "The Profile sheet is on the desktop rail.");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/jumps");
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Profile and settings" });
  for (const name of ["My Account", "Settings", "Ready-made mixes", "Help"]) {
    const row = sheet.getByRole("link", { name, exact: true });
    await expect(row).toBeVisible();
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  }
  const signOut = sheet.getByRole("button", { name: "Sign out", exact: true });
  expect(await signOut.evaluate(button => getComputedStyle(button).fontSize)).toBe(await sheet.getByRole("link", { name: "Help", exact: true }).evaluate(link => getComputedStyle(link).fontSize));
});
