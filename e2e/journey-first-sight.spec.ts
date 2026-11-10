import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { installMegaMix } from "../src/lib/mega-mix-service";
import { processWorkflowInstance, startWorkflowInstance } from "../src/lib/mix-workflow";
import { textBelowFloor } from "./text-floor";

// Journey is readable at first sight, and pages say where you are (JITM-UXA-10; JITM-10 §2.2, §2.22; JITM-07 §2.20).
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block" });
test.setTimeout(180_000);
let workspaceId: string, userId: string;
const token = randomUUID();
// The ready-made Contractor Mega-Mix gives a real map: many Mixes, numbered Beats and long path names.
const longPath = "No reply; reconnect is appropriate";
test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `journey-first-sight-${randomUUID()}@example.invalid`, name: "Journey owner", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Journey first sight", slug: randomUUID(), members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  await installMegaMix({ workspaceId, actorUserId: userId, blueprintId: "contractor", expectedVersion: 1 });
  // One person in the first Mix, so the People pane has a row with a numbered Mix and statuses.
  const first = await prisma.mix.findFirstOrThrow({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
  const person = await prisma.contact.create({ data: { workspaceId, displayName: "Rosa Rivera", firstName: "Rosa" } });
  const instance = await startWorkflowInstance({ workspaceId, contactId: person.id, mixId: first.id, requestId: randomUUID() });
  await processWorkflowInstance(workspaceId, instance, new Date());
  await prisma.job.updateMany({ where: { workspaceId, completedAt: null }, data: { completedAt: new Date() } });
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
const panels = (page: Page) => page.getByRole("navigation", { name: "Journey workspace panels" });
async function openJourney(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto("/journey", { waitUntil: "networkidle" });
  // The text checks read inside <main>, so Journey must be there.
  await expect(page.locator("main h1")).toHaveText("Journey");
}
/** Every pane the width shows: below 1200px the panes sit behind People / Mixes / Details. */
async function eachPane(page: Page, check: (pane: string) => Promise<void>) {
  if (!(await panels(page).isVisible())) return check("all");
  for (const name of ["People", "Mixes", "Details"]) {
    await panels(page).getByRole("button", { name, exact: true }).click();
    await check(name);
  }
  await panels(page).getByRole("button", { name: "Mixes", exact: true }).click();
}
/** Text on the map that has no room: cut off, ellipsized, or wider or taller than its own box. */
async function clippedMapText(page: Page) {
  return canvas(page).evaluate(element => [...element.querySelectorAll<HTMLElement>("[data-workflow-edge-label], [data-workflow-node] button, [data-workflow-node] strong")].flatMap(item => {
    const style = getComputedStyle(item);
    const cut = item.scrollWidth > item.clientWidth + 1 || item.scrollHeight > item.clientHeight + 1 || style.textOverflow === "ellipsis" && style.overflow !== "visible";
    return cut ? [`${item.dataset.workflowEdgeLabel ? "label" : item.tagName.toLowerCase()}: ${item.textContent?.trim().slice(0, 60)} (${item.scrollWidth}x${item.scrollHeight} in ${item.clientWidth}x${item.clientHeight})`] : [];
  }));
}

test("pages say where you are: Journey, Page not found and You’re offline", async ({ page }) => {
  await page.goto("/journey", { waitUntil: "networkidle" });
  await expect(page).toHaveTitle("Journey | Jump in the Mix");
  // The title's page part matches the H1 (JITM-10 §2.22); on phones the H1 sits in the People pane, out of view.
  await expect(page.locator("main h1")).toHaveText("Journey");
  const missing = await page.goto(`/no-such-page-${randomUUID()}`);
  expect(missing?.status()).toBe(404);
  await expect(page).toHaveTitle("Page not found | Jump in the Mix");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
  await page.goto("/offline");
  await expect(page).toHaveTitle("You’re offline | Jump in the Mix");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("You’re offline");
});

for (const [width, height] of [[1440, 900], [375, 812]] as const) {
  test(`no Journey text is under the floors at ${width}px, in the map and the list, in both themes`, async ({ page }) => {
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await openJourney(page, width, height);
      for (const view of ["Map", "List"] as const) {
        await showAs(page, view).click();
        await expect(showAs(page, view)).toHaveAttribute("aria-pressed", "true");
        // Open a Mix's Beats on the map, so its Beat rows are measured too.
        if (view === "Map") await canvas(page).getByRole("button", { name: "Show Beats" }).first().click();
        await eachPane(page, async pane => {
          // JITM-10 §2.2: 13px for meaningful text and 12px for compact action labels…
          expect(await textBelowFloor(page, { scope: "main" }), `${colorScheme} ${view} ${pane}`).toEqual([]);
          // …and nothing on Journey, decorative map labels included, is under 12px.
          expect(await textBelowFloor(page, { scope: "main", floor: 12 }), `${colorScheme} ${view} ${pane}`).toEqual([]);
        });
      }
      // A chosen Mix's details, with its numbered Beats open.
      await page.locator("[data-list-mix]").first().click();
      const details = page.getByRole("complementary", { name: "Journey details" });
      await details.getByText("Beats in this Mix", { exact: true }).click();
      await expect(details.getByTitle(/^Beat [A-Z]\d+\.[a-z]+$/).first()).toBeVisible();
      expect(await textBelowFloor(page, { scope: "main" }), `${colorScheme} details`).toEqual([]);
      expect(await textBelowFloor(page, { scope: "main", floor: 12 }), `${colorScheme} details`).toEqual([]);
    }
  });
}

test("the map and the list lead with the plain name; Journey numbers come second", async ({ page }) => {
  await openJourney(page, 1440, 900);
  await expect(showAs(page, "Map")).toHaveAttribute("aria-pressed", "true");
  const card = canvas(page).locator("[data-workflow-node]").first();
  await card.getByRole("button", { name: "Show Beats" }).click();
  // A Beat row reads "Name", then its number: the name is the first text in the row.
  const beat = card.locator("[data-workflow-beat]").first();
  const beatName = (await beat.locator("strong").first().textContent())!.trim();
  await expect(beat.getByTitle(/^Beat [A-Z]\d+\.[a-z]+$/)).toBeVisible();
  expect((await beat.innerText()).trim().startsWith(beatName)).toBe(true);
  // The Mix card also leads with its name, with the Mix number after it.
  const mixName = (await card.locator("strong").first().textContent())!.trim();
  expect((await card.locator("button[aria-pressed]").first().innerText()).trim().startsWith(mixName)).toBe(true);

  await showAs(page, "List").click();
  const heading = page.getByRole("button", { name: new RegExp(`^${mixName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*Mix [A-Z]\\d+\\b`) });
  await expect(heading).toBeVisible();
  const listBeat = page.locator("main ol li").filter({ hasText: beatName }).first();
  expect((await listBeat.innerText()).trim().startsWith(beatName)).toBe(true);
  // A path's next Mix reads "Name · A2", never "A2 · Name".
  const route = page.locator("main ul li").filter({ hasText: `${longPath} →` }).first();
  await expect(route).toHaveText(new RegExp(`^${longPath} → [^·]+ · [A-Z]\\d+(?:\\.[a-z]+)?`));
});

for (const [width, height] of [[1440, 900], [834, 1112]] as const) {
  test(`no map label is clipped when Journey opens at ${width}px, also at 200% text`, async ({ page }) => {
    await openJourney(page, width, height);
    if (await panels(page).isVisible()) await panels(page).getByRole("button", { name: "Mixes", exact: true }).click();
    await expect(page.getByRole("button", { name: "Reset zoom to 100%", exact: true })).toHaveText("100%");
    const label = canvas(page).locator("[data-workflow-edge-label]").filter({ hasText: longPath }).first();
    await expect(label).toBeAttached();
    // The whole path name is on the map, in a box that holds it.
    expect((await label.innerText()).replace(/\s+/g, " ")).toContain(longPath);
    await expect.poll(() => clippedMapText(page)).toEqual([]);
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await expect.poll(() => clippedMapText(page)).toEqual([]);
  });
}
