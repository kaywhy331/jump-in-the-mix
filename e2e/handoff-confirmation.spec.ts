import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { formatDateTime } from "../src/lib/format";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", actionTimeout: 15_000 });

const name = "Alex Handoff";
const preferences = { locale: "en-GB", timeZone: "America/Los_Angeles" };
const due = new Date("2026-01-05T18:00:00Z");
const nextAt = "2030-03-10T18:30:00Z";
let userId: string, workspaceId: string, contactId: string, jumpId: string;

test.beforeEach(async ({ context, page }) => {
  const suffix = randomUUID(), token = randomUUID();
  userId = (await prisma.user.create({ data: { email: `handoff-${suffix}@example.test`, name: "Handoff owner", passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: `handoff-${suffix}`, name: "Handoff fixture", members: { create: { userId } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: preferences.timeZone, locale: preferences.locale } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  contactId = (await prisma.contact.create({ data: { workspaceId, displayName: name, phones: { create: { phone: "+15550100340", normalized: "+15550100340", isPrimary: true } } } })).id;
  const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Check the estimate", channel: "SMS" } });
  const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Hi Alex, checking on your estimate." } });
  const mix = await prisma.mix.create({ data: { workspaceId, name: "Estimate follow-up", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: [{ stepVersionId: version.id, dayOffset: 0, sortOrder: 1 }, { stepVersionId: version.id, dayOffset: 7, sortOrder: 2 }] } }, include: { steps: true } });
  jumpId = `handoff-${suffix}`;
  await prisma.jump.create({ data: {
    id: jumpId, workspaceId, contactId, mixId: mix.id, mixStepId: mix.steps.find(step => step.sortOrder === 1)!.id, stepVersionId: version.id,
    scheduledAt: due, baseScheduledAt: due, status: "PENDING", reason: "Estimate follow-up", uniquenessKey: jumpId,
    templateSnapshot: { channel: "SMS", body: "Hi Alex, checking on your estimate.", timezone: "UTC", originalLocalDate: "2026-01-05", variants: { EMAIL: { subject: "Your estimate", body: "Checking on your estimate." }, CALL: { script: "Ask about the estimate." } } },
    renderedSnapshot: { body: "Hi Alex, checking on your estimate." }
  } });
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
  // Exercise the real handoff handler while leaving the synthetic test in the browser.
  await page.addInitScript(() => {
    document.addEventListener("click", event => {
      if ((event.target as Element).closest('a[href^="sms:"],a[href^="mailto:"],a[href^="tel:"]')) event.preventDefault();
    }, true);
  });
});

test.afterEach(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});

const review = (page: Page) => page.locator(`#jump-${jumpId} .follow-up-review-sheet`);
const tray = (page: Page) => page.getByRole("complementary", { name: `Finish follow-up with ${name}` });
const confirmation = (page: Page) => page.locator(`[data-follow-up-undo][data-jump-workflow="${jumpId}"]`);
async function open(page: Page) {
  await page.goto(`/jumps?jump=${jumpId}&range=all`);
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");
  // The jump URL requests this review. Wait for hydration instead of racing its opening effect with another click.
  await expect(review(page)).toHaveAttribute("open", "");
  await expect(review(page)).toBeVisible();
  await expect(review(page).getByRole("textbox", { name: "Your message", exact: true })).toBeEnabled();
}
async function handoff(page: Page) {
  await open(page);
  await review(page).getByRole("link", { name: `Open text for ${name}`, exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(tray(page).getByText(`Did you send the message to ${name}?`, { exact: true })).toBeVisible();
  await expect(tray(page)).toContainText("Opening an app does not send it.");
}
async function choices(page: Page, state: "ready" | "waiting" | "unavailable") {
  await page.route("**/api/mix-workflow?jumpId=*", route => state === "unavailable"
    ? route.fulfill({ status: 503, json: { error: "Unavailable" } })
    : route.fulfill({ json: { decisions: state === "waiting" ? [{ id: "estimate-decision", name: "Estimate accepted?", choices: ["Yes", "No"] }] : [] } }));
}

test("returned message handoff keeps Sent, Not sent, the warning and Undo", async ({ page }) => {
  await choices(page, "ready");
  await handoff(page);
  await expect(tray(page).getByRole("button", { name: "Not sent", exact: true })).toBeVisible();
  expect((await prisma.jump.findUniqueOrThrow({ where: { id: jumpId } })).status).toBe("PENDING");
  await tray(page).getByRole("button", { name: "Sent", exact: true }).click();
  await expect(confirmation(page)).toContainText("Follow-up completed");
  await expect(confirmation(page)).toContainText("Next date: not known yet.");
  await confirmation(page).getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await prisma.jump.findUniqueOrThrow({ where: { id: jumpId } })).status).toBe("PENDING");
});

test("the message question still works when private browser storage is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException("Blocked", "SecurityError"); };
    Storage.prototype.setItem = () => { throw new DOMException("Blocked", "SecurityError"); };
  });
  await choices(page, "ready");
  await handoff(page);
  await tray(page).getByRole("button", { name: "Not sent", exact: true }).click();
  await expect(tray(page)).toHaveCount(0);
  expect((await prisma.jump.findUniqueOrThrow({ where: { id: jumpId } })).status).toBe("PENDING");
});

test("a message handoff and its confirmation never appear after signing out", async ({ page, context }) => {
  await choices(page, "ready");
  await handoff(page);
  await tray(page).getByRole("button", { name: "Sent", exact: true }).click();
  await expect(confirmation(page)).toContainText(name);
  await context.clearCookies();
  await page.goto("/login");
  await expect(page.getByText(`Did you send the message to ${name}?`, { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-follow-up-undo]")).toHaveCount(0);
  await expect(page.getByText(name, { exact: true })).toHaveCount(0);
});

test("an unresolved message handoff stays out of another account", async ({ page, context }) => {
  await handoff(page);
  const suffix = randomUUID(), token = randomUUID();
  const other = await prisma.user.create({ data: { email: `other-handoff-${suffix}@example.test`, name: "Other owner", passwordHash: "fixture-only", emailVerifiedAt: new Date() } });
  const otherWorkspace = await prisma.workspace.create({ data: { ownerId: other.id, slug: `other-handoff-${suffix}`, name: "Other fixture", members: { create: { userId: other.id } }, profile: { create: { onboardingDone: true } } } });
  try {
    await prisma.session.create({ data: { userId: other.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
    await context.clearCookies();
    await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
    await page.goto("/jumps");
    await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");
    await expect(page.getByText(`Did you send the message to ${name}?`, { exact: true })).toHaveCount(0);
    await expect(page.locator("[data-follow-up-undo]")).toHaveCount(0);
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  } finally {
    await prisma.workspace.delete({ where: { id: otherWorkspace.id } });
    await prisma.user.delete({ where: { id: other.id } });
  }
});

for (const succeeds of [true, false]) {
  test(`${succeeds ? "successful" : "failed"} Copy preserves the editor and asks only after success`, async ({ page }) => {
    await page.addInitScript(succeeds => {
      Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { if (!succeeds) throw new Error("Clipboard unavailable"); } } });
      document.execCommand = () => false;
    }, succeeds);
    await open(page);
    const field = review(page).getByRole("textbox", { name: "Your message", exact: true });
    const wording = await field.inputValue();
    const copy = review(page).getByRole("button", { name: "Copy", exact: true });
    await copy.focus();
    await page.keyboard.press("Enter");
    const question = review(page).getByText(`Did you send the message to ${name}?`, { exact: true });
    if (succeeds) {
      await expect(question).toBeVisible();
      await expect.poll(() => prisma.jumpActionEvent.count({ where: { jumpId, action: "COPIED" } })).toBe(1);
      await expect(review(page).getByRole("button", { name: `Mark sent for ${name}`, exact: true })).toBeVisible();
    } else {
      await expect(review(page).getByRole("button", { name: "Copy failed", exact: true })).toBeVisible();
      await expect(question).toHaveCount(0);
    }
    await expect(review(page)).toHaveAttribute("open", "");
    await expect(field).toHaveValue(wording);
    await expect(tray(page)).toHaveCount(0);
    expect((await prisma.jump.findUniqueOrThrow({ where: { id: jumpId } })).status).toBe("PENDING");
    expect(await prisma.jumpAttempt.count({ where: { jumpId } })).toBe(0);
  });
}

for (const state of ["waiting", "unavailable"] as const) {
  test(`confirmation preserves a known date and ${state} outcome context`, async ({ page }) => {
    await choices(page, state);
    await handoff(page);
    if (state === "waiting") await expect(tray(page).getByText("Estimate accepted?", { exact: true })).toBeVisible();
    else await expect(tray(page)).toContainText("Couldn't check the next step.");
    // An outcome-created date is authoritative even when the independent Journey read is unavailable.
    await page.route(`**/api/jumps/${jumpId}/outcome`, route => route.fulfill({ json: { status: "DONE", activityId: "synthetic-activity", nextJumpId: "synthetic-next", nextCommitmentAt: nextAt } }));
    await tray(page).getByRole("button", { name: "Sent", exact: true }).click();
    await expect(confirmation(page)).toContainText(`Next follow-up: ${formatDateTime(nextAt, preferences)}`);
    await expect(confirmation(page)).toContainText(state === "waiting" ? "Record the required outcome in Needs your input" : "The next Journey step could not be checked yet.");
    await expect(confirmation(page)).not.toContainText("No next follow-up is scheduled.");
    await expect(confirmation(page).getByRole("button", { name: "Undo", exact: true })).toBeVisible();
  });
  test(`${state} without a date never claims nothing is scheduled`, async ({ page }) => {
    await choices(page, state);
    await handoff(page);
    if (state === "waiting") await expect(tray(page).getByText("Estimate accepted?", { exact: true })).toBeVisible();
    else await expect(tray(page)).toContainText("Couldn't check the next step.");
    await tray(page).getByRole("button", { name: "Sent", exact: true }).click();
    await expect(confirmation(page)).toContainText(state === "waiting" ? "Record the required outcome" : "could not be checked yet");
    await expect(confirmation(page)).not.toContainText("No next follow-up is scheduled.");
    await expect(confirmation(page)).not.toContainText("Next scheduled:");
  });
}

test("each unavailable channel has its own reason without a warning about an unselected option", async ({ page }) => {
  await open(page);
  const email = review(page).getByRole("button", { name: "Email", exact: true });
  await expect(email).toBeDisabled();
  await expect(email).toHaveAccessibleDescription("Needs an email address. Add email");
  await expect(review(page).locator(".channel-missing")).toHaveCount(0);
  await expect(review(page).getByRole("link", { name: "Add email", exact: true })).toBeVisible();
  await expect(review(page).locator(".review-action-bar .editable-follow-up-actions .review-outcome-actions")).toBeVisible();
});

test("grouped actions and channel reasons reflow in both themes and at 200 percent text", async ({ page }, info) => {
  test.setTimeout(150_000);
  await open(page);
  await mkdir(".artifacts/m5s3", { recursive: true });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => document.documentElement.setAttribute("data-theme", theme), theme);
    for (const width of [320, 390, 834, 1194, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(review(page).getByRole("button", { name: "Copy", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const actions = review(page).locator(".review-action-bar");
      for (const control of await actions.locator("button:visible,a:visible").all()) {
        const box = await control.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      await actions.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `.artifacts/m5s3/${info.project.name}-${theme}-${width}.png` });
    }
    await page.setViewportSize({ width: 320, height: 1000 });
    const enlarged = await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const control of await review(page).locator(".review-action-bar .button").all()) {
      expect(await control.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    }
    await review(page).getByRole("button", { name: "Copy", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.artifacts/m5s3/${info.project.name}-${theme}-320-200.png` });
    await enlarged.evaluate(node => node.parentNode?.removeChild(node));
  }
});
