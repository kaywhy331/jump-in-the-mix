import { createHash, randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", actionTimeout: 15_000 });
test.setTimeout(120_000);

let workspaceId: string, userId: string;
const token = randomUUID();

test.beforeAll(async () => {
  const suffix = randomUUID();
  userId = (await prisma.user.create({ data: { email: `beat-timing-${suffix}@example.com`, name: "Timing fixture owner", passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: `beat-timing-${suffix}`, name: "Timing fixture", members: { create: { userId } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
});
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
});
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});

async function ready(page: Page) { await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "", { timeout: 60_000 }); }
async function audit(page: Page) { expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]); }

test("a beat can be timed in minutes from the appointment or after the visit is marked completed, and the setting survives editing", async ({ page }) => {
  const name = `Estimate visit ${randomUUID().slice(0, 8)}`;
  await page.goto("/mixes/new?custom=1"); await ready(page);
  await page.getByLabel("Mix name").fill(name);
  await page.getByLabel("Cue · when should it start?").selectOption("MANUAL_START");
  const beat = page.getByRole("group", { name: "Beat 1" });
  await expect(beat.getByLabel("Tempo · days after start")).toBeVisible();
  await beat.getByLabel("Timing").selectOption("APPOINTMENT_START");
  // The day field gives way to a minutes field; the day-based settings no longer apply to this beat.
  await expect(beat.getByLabel("Tempo · days after start")).toHaveCount(0);
  await expect(beat.getByText("More tempo settings")).toHaveCount(0);
  const minutes = beat.getByLabel("Minutes (negative means before)");
  await minutes.fill("-90");
  await expect(beat.getByText(/Goes out 1 hour 30 minutes before the appointment starts/)).toBeVisible();
  await beat.getByLabel("Message").fill("Hi {{First Name}}, leaving now for {{Appointment Title}}.");
  await audit(page);
  await page.getByRole("button", { name: "Create a mix" }).click();
  const mix = await expect.poll(() => prisma.mix.findFirst({ where: { workspaceId, name }, include: { steps: { orderBy: { sortOrder: "asc" } } } }), { timeout: 20_000 }).not.toBeNull().then(() => prisma.mix.findFirstOrThrow({ where: { workspaceId, name }, include: { steps: { orderBy: { sortOrder: "asc" } } } }));
  expect(mix.steps.map((step) => [step.anchor, step.offsetMinutes, step.dayOffset])).toEqual([["APPOINTMENT_START", -90, 0]]);

  // The editor reads the saved timing back and can move the beat to the recorded completion.
  await page.goto(`/mixes/${mix.id}/edit`); await ready(page);
  const saved = page.getByRole("group", { name: "Beat 1" });
  await expect(saved.getByLabel("Timing")).toHaveValue("APPOINTMENT_START");
  await expect(saved.getByLabel("Minutes (negative means before)")).toHaveValue("-90");
  await saved.getByLabel("Timing").selectOption("VISIT_COMPLETED");
  const after = saved.getByLabel("Minutes after it is marked completed");
  await expect(after).toHaveAttribute("min", "0");
  await after.fill("60");
  await expect(saved.getByText(/Goes out 1 hour after the visit is marked completed/)).toBeVisible();
  await page.getByRole("button", { name: /Save mix|Review and start/ }).click();
  await expect.poll(async () => (await prisma.mixStep.findFirstOrThrow({ where: { mixId: mix.id, isActive: true } })).anchor, { timeout: 20_000 }).toBe("VISIT_COMPLETED");
  expect(await prisma.mixStep.findFirstOrThrow({ where: { mixId: mix.id, isActive: true } })).toMatchObject({ anchor: "VISIT_COMPLETED", offsetMinutes: 60 });

  // Back to the calendar-day rule: the day field returns and the minutes are cleared.
  await page.goto(`/mixes/${mix.id}/edit`); await ready(page);
  const again = page.getByRole("group", { name: "Beat 1" });
  await again.getByLabel("Timing").selectOption("CALENDAR_DAY");
  await expect(again.getByLabel("Tempo · days after start")).toBeVisible();
  await page.getByRole("button", { name: /Save mix|Review and start/ }).click();
  await expect.poll(async () => (await prisma.mixStep.findFirstOrThrow({ where: { mixId: mix.id, isActive: true } })).anchor, { timeout: 20_000 }).toBe("CALENDAR_DAY");
  expect((await prisma.mixStep.findFirstOrThrow({ where: { mixId: mix.id, isActive: true } })).offsetMinutes).toBeNull();
});
