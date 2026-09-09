import { createHash, randomBytes, randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { prisma } from "../src/lib/prisma";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
test("mix pages preserve filters, reach every result and keep small-screen navigation usable", async ({ page, context, baseURL }, testInfo) => {
  test.skip(!local, "Synthetic fixtures require the explicitly named loopback test database.");
  const key = `mix-page-${randomUUID()}`;
  const user = await prisma.user.create({ data: { email: `${key}@example.test`, name: "Page owner", emailVerifiedAt: new Date() } });
  const spaces: string[] = [];
  try {
    for (let index = 0; index < 2; index++) {
      const workspace = await prisma.workspace.create({ data: { name: key, slug: `${key}-${index}`, ownerId: user.id, ...(index ? {} : { members: { create: { userId: user.id, role: "OWNER" } }, profile: { create: { onboardingDone: true } } }) } }); spaces.push(workspace.id);
    }
    const createdAt = new Date("2025-01-01T12:00:00Z");
    await prisma.mix.createMany({ data: Array.from({ length: 25 }, (_, index) => ({ id: `${key}-${String(index).padStart(2, "0")}`, workspaceId: spaces[0], name: `Page sample ${String(index).padStart(2, "0")}`, triggerMode: "MANUAL_START", status: index === 24 ? "ARCHIVED" : index === 23 ? "DRAFT" : "ACTIVE", createdAt })) });
    await prisma.mix.create({ data: { workspaceId: spaces[1], name: "Page sample foreign", triggerMode: "MANUAL_START", status: "ACTIVE", createdAt } });
    const token = randomBytes(32).toString("base64url");
    await prisma.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
    await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: baseURL!, httpOnly: true, sameSite: "Strict" }]);
    await page.goto("/mixes?q=Page&status=ACTIVE");
    const pager = page.getByRole("navigation", { name: "Mix result pages" });
    const rows = page.locator(".mix-row");
    await expect(rows).toHaveCount(20); await expect(pager).toContainText("1–20 of 23 mixes");
    const first = await rows.locator("h3").allTextContents();
    await pager.getByRole("link", { name: "Next", exact: true }).click();
    await expect(page).toHaveURL(/q=Page&status=ACTIVE&page=2$/);
    await expect(rows).toHaveCount(3); await expect(pager).toContainText("Page 2 of 2");
    const last = await rows.locator("h3").allTextContents();
    expect(new Set([...first, ...last]).size).toBe(23);
    await expect(page.getByText("Page sample foreign")).toHaveCount(0);
    await expect(page.getByText("Page sample 24", { exact: true })).toHaveCount(0);
    await expect(pager.getByRole("link", { name: "Next", exact: true })).toHaveCount(0);
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width: testInfo.project.name === "mobile-chromium" ? 320 : 1440, height: 900 });
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      await pager.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    }
    await pager.getByRole("link", { name: "Previous", exact: true }).click();
    await expect(rows).toHaveCount(20); expect(await rows.locator("h3").allTextContents()).toEqual(first);
    await page.goto("/mixes?q=Page&status=ACTIVE&page=999");
    await expect(rows).toHaveCount(3); await expect(pager).toContainText("Page 2 of 2");
    await page.getByLabel("Search mixes", { exact: true }).fill("Missing result");
    await expect(page).toHaveURL(/q=Missing\+result&status=ACTIVE$/);
    await expect(page.getByRole("heading", { name: "No mixes match these filters." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create a basic starter mix" })).toHaveCount(0);
    await page.goto("/mixes?page=2");
    await page.getByRole("button", { name: /^Filter/ }).click();
    await page.getByLabel("Filter mixes by status").selectOption("DRAFT");
    await expect(page).toHaveURL(/\/mixes\?(?:q=&)?status=DRAFT$/);
    await expect(rows).toHaveCount(1); await expect(rows).toContainText("Page sample 23");
  } finally {
    await context.clearCookies();
    await prisma.workspace.deleteMany({ where: { id: { in: spaces } } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
