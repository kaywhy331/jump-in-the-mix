import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";

// Journey opens readable (JITM-07 §2.20, D75): from 768px the map opens at 100%, scrolled to the first numbered Mix,
// and Fit map is the overview; on phones Journey opens in its list view, with the map one tap away.
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block" });
test.setTimeout(120_000);
let workspaceId: string, userId: string, firstMixId: string;
const token = randomUUID();
test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `journey-readable-${randomUUID()}@example.invalid`, name: "Journey owner", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Journey fixture", slug: randomUUID(), members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  // Mixes load in name order and are numbered in the order they were made, so the first one made, "Zulu", is A1 but
  // sits last in the map's first column, below the fold.
  const base = Date.now() - 3_600_000;
  for (const [index, name] of ["Zulu follow-up", "Alpha follow-up", "Bravo follow-up", "Charlie follow-up", "Delta follow-up", "Echo follow-up"].entries()) {
    const mix = await prisma.mix.create({ data: { workspaceId, name, status: "ACTIVE", triggerMode: "MANUAL_START", createdAt: new Date(base + index * 60_000) } });
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name: `${name} call`, channel: "PHONE_CALL", versions: { create: { version: 1, body: "A private fixture with no recipient or delivery." } } }, include: { versions: true } });
    await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: template.versions[0].id, dayOffset: 0, sortOrder: 0 } });
    if (index === 0) firstMixId = mix.id;
  }
});
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, sameSite: "Strict" }]);
});
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});
const canvas = (page: Page) => page.getByRole("region", { name: /^Scrollable journey diagram/ });
const showAs = (page: Page, name: "Map" | "List") => page.getByRole("group", { name: "Show the journey as" }).getByRole("button", { name, exact: true });
/** The first numbered Mix's card lies wholly inside the map's scrolled view. */
async function firstMixInView(page: Page) {
  return canvas(page).evaluate((element, id) => {
    const node = element.querySelector(`[data-workflow-node="${id}"]`);
    if (!node) return "missing";
    const view = element.getBoundingClientRect(), box = node.getBoundingClientRect();
    return box.top >= view.top && box.left >= view.left && box.top < view.bottom && box.left < view.right ? "in view" : `out of view ${JSON.stringify([view.top, view.bottom, box.top, box.bottom])}`;
  }, firstMixId);
}

test("from 768px the map opens at 100%, scrolled to the first numbered Mix, and Fit map is the overview", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/journey", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Reset zoom to 100%", exact: true })).toHaveText("100%");
  await expect(canvas(page).locator(`[data-workflow-node="${firstMixId}"]`)).toContainText("A1");
  await expect.poll(() => canvas(page).evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect(await firstMixInView(page)).toBe("in view");
  await expect(showAs(page, "Map")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Fit map", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reset zoom to 100%", exact: true })).not.toHaveText("100%");
  // The list is one tap away, in journey order.
  await showAs(page, "List").click();
  await expect(canvas(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Mix A1\s*Zulu follow-up/ })).toBeVisible();
});

test("on a phone Journey opens in its list view, with people counts, and the map one tap away at 100%", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/journey", { waitUntil: "networkidle" });
  const first = page.getByRole("button", { name: /^Mix A1\s*Zulu follow-up/ });
  await expect(first).toBeVisible();
  await expect(canvas(page)).toHaveCount(0);
  await expect(showAs(page, "List")).toHaveAttribute("aria-pressed", "true");
  await expect(first).toContainText("0 here");
  await showAs(page, "Map").click();
  await expect(canvas(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset zoom to 100%", exact: true })).toHaveText("100%");
  await expect.poll(() => firstMixInView(page)).toBe("in view");
});
