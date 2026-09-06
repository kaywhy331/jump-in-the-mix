import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", actionTimeout: 15_000 });
test.setTimeout(180_000);
let workspaceId: string, userId: string;
let smsIds: string[], emailIds: string[], completedIds: string[];
let scheduledAt: Date;
const token = randomUUID();
test.beforeAll(async () => {
  const suffix = randomUUID();
  userId = (await prisma.user.create({ data: { email: `today-navigation-${suffix}@example.com`, name: "Today fixture owner", passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: `today-navigation-${suffix}`, name: "Today navigation fixture", members: { create: { userId } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  const sms = await prisma.stepTemplate.create({ data: { workspaceId, name: "Fixture text", channel: "SMS" } });
  const email = await prisma.stepTemplate.create({ data: { workspaceId, name: "Fixture email", channel: "EMAIL" } });
  const smsVersion = await prisma.stepVersion.create({ data: { stepTemplateId: sms.id, version: 1, body: "An unsent navigation fixture message." } });
  const emailVersion = await prisma.stepVersion.create({ data: { stepTemplateId: email.id, version: 1, subject: "Fixture subject", body: "An unsent email fixture." } });
  const mix = await prisma.mix.create({ data: { workspaceId, name: "Navigation fixture plan", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: [{ stepVersionId: smsVersion.id, dayOffset: 0, sortOrder: 1 }, { stepVersionId: emailVersion.id, dayOffset: 0, sortOrder: 2 }] } }, include: { steps: true } });
  const contacts = Array.from({ length: 323 }, (_, index) => ({ id: `${suffix}-contact-${index}`, workspaceId, displayName: `Queue person ${String(index + 1).padStart(3, "0")}` }));
  await prisma.contact.createMany({ data: contacts });
  await prisma.contactPhone.createMany({ data: contacts.slice(0, 321).map((contact, index) => ({ contactId: contact.id, phone: `+1555010${String(index).padStart(4, "0")}`, normalized: `+1555010${String(index).padStart(4, "0")}`, isPrimary: true })) });
  await prisma.contactEmail.createMany({ data: contacts.slice(321).map((contact, index) => ({ contactId: contact.id, email: `queue-${index}@example.com`, normalized: `queue-${index}@example.com`, isPrimary: true })) });
  const midnight = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z"); scheduledAt = new Date(midnight.getTime() + 60_000);
  const smsStep = mix.steps.find(step => step.stepVersionId === smsVersion.id)!;
  const emailStep = mix.steps.find(step => step.stepVersionId === emailVersion.id)!;
  smsIds = contacts.slice(0, 321).map((_, index) => `${suffix}-sms-${String(index).padStart(4, "0")}`);
  emailIds = contacts.slice(321).map((_, index) => `${suffix}-email-${index}`);
  completedIds = Array.from({ length: 302 }, (_, index) => `${suffix}-done-${String(index).padStart(4, "0")}`);
  await prisma.jump.createMany({ data: [
    ...smsIds.map((id, index) => ({ id, workspaceId, contactId: contacts[index].id, mixId: mix.id, mixStepId: smsStep.id, stepVersionId: smsVersion.id, scheduledAt, status: "PENDING" as const, reason: "Fixture text follow-up", uniquenessKey: id, templateSnapshot: {}, renderedSnapshot: { body: smsVersion.body } })),
    ...emailIds.map((id, index) => ({ id, workspaceId, contactId: contacts[321 + index].id, mixId: mix.id, mixStepId: emailStep.id, stepVersionId: emailVersion.id, scheduledAt: new Date(scheduledAt.getTime() + 1000), status: "PENDING" as const, reason: "Fixture email follow-up", uniquenessKey: id, templateSnapshot: {}, renderedSnapshot: { subject: emailVersion.subject, body: emailVersion.body } })),
    ...completedIds.map(id => ({ id, workspaceId, contactId: contacts[0].id, mixId: mix.id, mixStepId: smsStep.id, stepVersionId: smsVersion.id, scheduledAt: midnight, status: "DONE" as const, completedAt: midnight, reason: "Older completed fixture", uniquenessKey: id, templateSnapshot: {}, renderedSnapshot: { body: "Completed fixture" } }))
  ] });
});
test.beforeEach(async ({ context }) => {
  await prisma.mixStop.deleteMany({ where: { workspaceId } });
  await prisma.jump.updateMany({ where: { workspaceId, id: { in: smsIds } }, data: { status: "PENDING", scheduledAt, completedAt: null } });
  await prisma.jump.updateMany({ where: { workspaceId, id: { in: emailIds } }, data: { status: "PENDING", scheduledAt: new Date(scheduledAt.getTime() + 1000), completedAt: null } });
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
});
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});
const pager = (page: Page) => page.getByRole("navigation", { name: "Follow-up pages" });
const ids = (page: Page) => page.locator(".jump-card").evaluateAll(cards => cards.map(card => card.id.slice(5)));
async function ready(page: Page) { await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "", { timeout: 60_000 }); }
async function visit(page: Page, path = "/jumps") { await page.goto(path); await ready(page); }
async function audit(page: Page) { expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]); }
async function theme(page: Page, colorScheme: "light" | "dark") {
  await page.emulateMedia({ colorScheme });
  await page.evaluate(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); await Promise.all(document.getAnimations().filter(animation => "transitionProperty" in animation).map(animation => animation.finished.catch(() => undefined))); });
}
async function next(page: Page, firstId: string) {
  const link = pager(page).getByRole("link", { name: "Next follow-ups", exact: true });
  await link.focus(); await page.keyboard.press("Enter"); await expect(page.locator(".jump-card").first()).toHaveAttribute("id", `jump-${firstId}`, { timeout: 30_000 });
}

test("Today counts the whole view and reaches every open follow-up beyond 300", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await visit(page);
  await expect(page.locator(".today-page-header")).toContainText("323 follow-ups need your attention");
  await expect(pager(page)).toContainText("Showing 30 of 625 follow-ups");
  expect(await ids(page)).toEqual(smsIds.slice(0, 30));
  expect(await page.locator("*").count()).toBeLessThan(1500);
  await visit(page, "/jumps?status=pending");
  const seen: string[] = [];
  for (let index = 0; index < 11; index++) {
    const current = await ids(page); seen.push(...current);
    if (index === 10) break;
    await next(page, smsIds[(index + 1) * 30]);
  }
  expect(seen).toEqual([...smsIds, ...emailIds]);
  await expect(pager(page).getByRole("link", { name: "Next follow-ups", exact: true })).toHaveCount(0);
  await pager(page).getByRole("link", { name: "Previous", exact: true }).click();
  await expect(page.locator(".jump-card").first()).toHaveAttribute("id", `jump-${smsIds[270]}`);
  await pager(page).getByRole("link", { name: "First follow-ups", exact: true }).click();
  await expect(page.locator(".jump-card").first()).toHaveAttribute("id", `jump-${smsIds[0]}`);
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeFocused();
});

test("completing earlier work and removing the anchor never skips untouched follow-ups", async ({ page }) => {
  await visit(page, "/jumps?status=pending");
  for (const id of smsIds.slice(0, 2)) {
    await page.locator(`#jump-${id}`).getByRole("button", { name: "Done", exact: true }).click();
    await expect(page.locator(`#jump-${id}`)).toHaveCount(0);
  }
  await prisma.jump.update({ where: { id: smsIds[29] }, data: { status: "CANCELED" } });
  await next(page, smsIds[30]); expect(await ids(page)).toEqual(smsIds.slice(30, 60));
  await expect(pager(page)).toContainText("Showing 30 of 320 follow-ups");
});

test("paging and filters protect closed message drafts until the owner discards them", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 }); await visit(page);
  await page.getByRole("button", { name: "Review message for Queue person 002", exact: true }).click();
  const message = page.getByRole("dialog", { name: "Message Queue person 002", exact: true });
  const draft = message.getByRole("textbox", { name: "Edit before sending", exact: true }); await draft.fill("Keep my unsent customer draft.");
  await page.keyboard.press("Escape");
  await pager(page).getByRole("link", { name: "Next follow-ups", exact: true }).click();
  const guard = page.getByRole("dialog", { name: "Keep your message edits?", exact: true }); await expect(guard).toBeVisible();
  for (const colorScheme of ["light", "dark"] as const) { await theme(page, colorScheme); await audit(page); }
  await guard.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(draft).toBeFocused(); await expect(draft).toHaveValue("Keep my unsent customer draft."); await expect(page).toHaveURL(/\/jumps$/);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await page.getByRole("dialog", { name: "Filter Today", exact: true }).getByRole("combobox", { name: "Dates", exact: true }).selectOption("all");
  await expect(guard).toBeVisible(); await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Filter Today", exact: true }).getByRole("combobox", { name: "Dates", exact: true })).toHaveValue("due");
  await page.keyboard.press("Escape"); await expect(page).toHaveURL(/\/jumps$/);
  await pager(page).getByRole("link", { name: "Next follow-ups", exact: true }).click();
  await guard.getByRole("button", { name: "Discard edits and continue", exact: true }).click();
  await expect(page.locator(".jump-card").first()).toHaveAttribute("id", `jump-${smsIds[30]}`);
  await expect(page.locator('[data-follow-up-draft="true"]')).toHaveCount(0);
  expect(await prisma.jump.count({ where: { workspaceId, status: "PENDING" } })).toBe(323);
});

test("filters reset the page and snooze/stop actions preserve the current filtered position", async ({ page }) => {
  await visit(page, "/jumps?range=all&status=pending&channel=SMS"); await next(page, smsIds[30]);
  const cursor = new URL(page.url()).searchParams.get("after"); expect(cursor).toBeTruthy();
  await page.getByRole("button", { name: "More options for Queue person 031", exact: true }).click();
  await page.getByRole("dialog", { name: "Follow up with Queue person 031", exact: true }).getByRole("button", { name: "Tomorrow", exact: true }).click();
  await expect(page).toHaveURL(/snoozed=1/); expect(new URL(page.url()).searchParams.get("after")).toBe(cursor);
  await expect(page.locator(".jump-card").first()).toHaveAttribute("id", `jump-${smsIds[31]}`);
  await page.getByRole("button", { name: "More options for Queue person 032", exact: true }).click();
  await page.getByRole("dialog", { name: "Follow up with Queue person 032", exact: true }).getByRole("button", { name: "Stop plan…", exact: true }).click();
  await page.getByRole("dialog", { name: "Stop Navigation fixture plan for Queue person 032?", exact: true }).getByRole("button", { name: "Stop plan", exact: true }).click();
  await expect(page).toHaveURL(/mixStopped=1/); expect(new URL(page.url()).searchParams.get("after")).toBe(cursor);
  await expect(page.locator(".jump-card").first()).toHaveAttribute("id", `jump-${smsIds[32]}`);
  await page.getByRole("button", { name: "Filter 3", exact: true }).click();
  await page.getByRole("dialog", { name: "Filter Today", exact: true }).getByRole("combobox", { name: "How", exact: true }).selectOption("EMAIL");
  await expect(page).toHaveURL(/channel=EMAIL/); expect(new URL(page.url()).searchParams.has("after")).toBe(false);
  await expect(page.locator(".jump-card")).toHaveCount(2); expect(await ids(page)).toEqual(emailIds);
  // Let the native dialog close event and its trigger restoration finish.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeFocused();
});

test("pagination stays reachable across themes, phone and sidebar breakpoints", async ({ page }) => {
  test.setTimeout(360_000);
  await visit(page, "/jumps?status=pending"); await next(page, smsIds[30]);
  const pendingPage = page.url();
  for (const history of [false, true]) {
    for (const width of [320, 390, 768, 900, 1024, 1440]) {
      await test.step(`${history ? "Completed" : "Open"} follow-ups at ${width}px`, async () => {
        await page.setViewportSize({ width, height: 844 });
        // Start each layout measurement with a freshly confirmed account. Long
        // axe sweeps must not measure the account-recovery overlay instead.
        await visit(page, history ? "/jumps?range=all&status=done" : pendingPage);
        if (history) await expect(page.locator(".jump-task-complete")).toHaveCount(30);
        await pager(page).scrollIntoViewIfNeeded();
        for (const link of await pager(page).getByRole("link").all()) {
          await link.scrollIntoViewIfNeeded();
          expect(await link.evaluate(element => { const r = element.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && [[r.left + 4, r.top + 4], [r.right - 4, r.bottom - 4]].every(([x, y]) => element.contains(document.elementFromPoint(x, y))); })).toBe(true);
        }
        for (const colorScheme of ["light", "dark"] as const) { await theme(page, colorScheme); await audit(page); }
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
        await page.waitForLoadState("networkidle");
      });
    }
  }
});

test.describe("live outcome updates", () => {
  // Intercept only these local race/recovery scenarios; regular paging keeps SWs enabled.
  test.use({ serviceWorkers: "block" });
  const undoFor = (page: Page, id: string) => page.locator(`[data-jump-workflow="${id}"]`).getByRole("button", { name: "Undo", exact: true });
  const updates = (page: Page) => page.getByRole("complementary", { name: "Today updates", exact: true });
  const isRefresh = (request: import("@playwright/test").Request) => request.headers().rsc === "1" && !request.headers()["next-router-prefetch"];

  async function deliverFetched(route: import("@playwright/test").Route, response: import("@playwright/test").APIResponse) {
    // APIResponse bodies are decoded. Recalculate their length and avoid
    // replaying gzip/chunked transport headers onto an intercepted raw body.
    const headers = response.headers();
    delete headers["content-encoding"]; delete headers["content-length"]; delete headers["transfer-encoding"];
    await route.fulfill({ response, headers, body: await response.body() });
  }

  test("Done and Skip refill the open page after Undo and preserve the filtered cursor", async ({ page }) => {
    await page.clock.install();
    await visit(page, "/jumps?range=all&status=pending&channel=SMS"); await next(page, smsIds[30]);
    const location = page.url();
    await page.locator(`#jump-${smsIds[30]}`).getByRole("button", { name: "Done", exact: true }).click();
    await expect(undoFor(page, smsIds[30])).toBeVisible();
    await page.clock.runFor(8_000); await expect(undoFor(page, smsIds[30])).toBeVisible();
    await expect(pager(page)).toContainText("Showing 30 of 321 follow-ups");
    await page.clock.runFor(2_500);
    await expect(pager(page)).toContainText("Showing 30 of 320 follow-ups");
    expect(await ids(page)).toEqual(smsIds.slice(31, 61)); expect(page.url()).toBe(location);
    await page.getByRole("button", { name: "More options for Queue person 032", exact: true }).click();
    await page.getByRole("dialog", { name: "Follow up with Queue person 032", exact: true }).getByRole("button", { name: "Skip this follow-up", exact: true }).click();
    await expect(undoFor(page, smsIds[31])).toBeVisible(); await page.clock.runFor(10_500);
    await expect(pager(page)).toContainText("Showing 30 of 319 follow-ups");
    expect(await ids(page)).toEqual(smsIds.slice(32, 62)); expect(page.url()).toBe(location);
  });

  test("a refresh already in flight waits for a newly created closed draft", async ({ page }) => {
    await page.clock.install(); await visit(page, "/jumps?status=pending");
    let captured = false, delivered = false, release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; }); let held = false;
    await page.route("**/jumps**", async route => {
      if (!isRefresh(route.request()) || held) return route.continue();
      held = true; const response = await route.fetch(); captured = true; await hold; await deliverFetched(route, response); delivered = true;
    });
    try {
      await page.locator(`#jump-${smsIds[0]}`).getByRole("button", { name: "Done", exact: true }).click();
      await expect(undoFor(page, smsIds[0])).toBeVisible(); await page.clock.runFor(10_500); await expect.poll(() => captured).toBe(true);
      await page.getByRole("button", { name: "Review message for Queue person 002", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Message Queue person 002", exact: true });
      const draft = dialog.getByRole("textbox", { name: "Edit before sending", exact: true });
      await draft.fill("A draft created after the refresh started."); await page.keyboard.press("Escape");
      // Next can keep the browser's streaming request open after consuming the
      // response. Wait for fulfillment and the actual buffered-list UI.
      release(); await expect.poll(() => delivered).toBe(true);
      await expect(updates(page)).toContainText("Finish or discard your message edits");
      await expect(pager(page)).toContainText("Showing 30 of 323 follow-ups");
      await updates(page).getByRole("button", { name: "Return to message edits", exact: true }).click();
      await expect(draft).toHaveValue("A draft created after the refresh started."); await expect(draft).toBeFocused();
      await dialog.getByRole("button", { name: "Discard edits", exact: true }).click();
      await expect(pager(page)).toContainText("Showing 30 of 322 follow-ups");
      expect(await ids(page)).toEqual(smsIds.slice(1, 31));
      await expect(page.locator('[data-follow-up-draft="true"]')).toHaveCount(0);
    } finally { release(); }
  });

  test("an in-flight list update and a slow Undo cannot remove the Undo control", async ({ page }) => {
    await page.clock.install(); await visit(page, "/jumps?status=pending");
    let captured = false, delivered = false, release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; }); let held = false;
    await page.route("**/jumps**", async route => {
      if (!isRefresh(route.request()) || held) return route.continue();
      held = true; const response = await route.fetch(); captured = true; await hold; await deliverFetched(route, response); delivered = true;
    });
    let undoCaptured!: () => void, releaseUndo!: () => void;
    const undoReady = new Promise<void>(resolve => { undoCaptured = resolve; });
    const undoHold = new Promise<void>(resolve => { releaseUndo = resolve; });
    await page.route(`**/api/jumps/${smsIds[1]}/outcome`, async route => {
      if (route.request().postDataJSON().outcome !== "REOPENED") return route.continue();
      const response = await route.fetch(); undoCaptured(); await undoHold; await deliverFetched(route, response);
    });
    try {
      await page.locator(`#jump-${smsIds[0]}`).getByRole("button", { name: "Done", exact: true }).click();
      await expect(undoFor(page, smsIds[0])).toBeVisible(); await page.clock.runFor(10_500); await expect.poll(() => captured).toBe(true);
      await page.locator(`#jump-${smsIds[1]}`).getByRole("button", { name: "Done", exact: true }).click();
      await expect(undoFor(page, smsIds[1])).toBeVisible();
      release(); await expect.poll(() => delivered).toBe(true);
      await page.clock.runFor(1_000);
      await expect(undoFor(page, smsIds[1])).toBeVisible();
      await undoFor(page, smsIds[1]).click(); await undoReady;
      await page.clock.runFor(12_000);
      await expect(page.locator(`[data-jump-workflow="${smsIds[1]}"]`).getByRole("button", { name: "Restoring…", exact: true })).toBeVisible();
      releaseUndo();
      await expect(pager(page)).toContainText("Showing 30 of 322 follow-ups");
      await expect(page.locator(`#jump-${smsIds[1]}`)).toBeVisible();
      expect((await prisma.jump.findUniqueOrThrow({ where: { id: smsIds[1] } })).status).toBe("PENDING");
    } finally { release(); releaseUndo(); }
  });

  test("a failed Undo keeps its error and retry opportunity before restoring the record", async ({ page }) => {
    await page.clock.install(); await visit(page, "/jumps?status=pending");
    let attempts = 0, completions = 0;
    page.on("request", request => { if (new URL(request.url()).pathname.endsWith("/outcome") && request.method() === "POST" && request.postDataJSON().outcome === "COMPLETED") completions++; });
    await page.route(`**/api/jumps/${smsIds[0]}/outcome`, async route => {
      if (route.request().postDataJSON().outcome !== "REOPENED") return route.continue();
      if (++attempts === 1) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "The follow-up could not be reopened. Try Undo again." }) });
      await route.continue();
    });
    await page.locator(`#jump-${smsIds[0]}`).getByRole("button", { name: "Done", exact: true }).click();
    await expect(undoFor(page, smsIds[0])).toBeVisible();
    await page.clock.runFor(7_000); await undoFor(page, smsIds[0]).click();
    await expect(page.locator(`[data-jump-workflow="${smsIds[0]}"]`).getByRole("alert")).toContainText("Try Undo again");
    await page.clock.runFor(6_000); await expect(undoFor(page, smsIds[0])).toBeVisible();
    expect((await prisma.jump.findUniqueOrThrow({ where: { id: smsIds[0] } })).status).toBe("DONE");
    await undoFor(page, smsIds[0]).click();
    await expect(page.locator(`#jump-${smsIds[0]}`)).toBeVisible();
    await expect(page.locator('[data-follow-up-undo="true"]')).toHaveCount(0);
    await expect(pager(page)).toContainText("Showing 30 of 323 follow-ups");
    expect((await prisma.jump.findUniqueOrThrow({ where: { id: smsIds[0] } })).status).toBe("PENDING");
    expect(attempts).toBe(2); expect(completions).toBe(1);
  });

  test("reconnection updates the list without repeating the saved outcome", async ({ page, context }) => {
    await page.clock.install(); await visit(page, "/jumps?status=pending");
    let outcomes = 0; page.on("request", request => { if (new URL(request.url()).pathname.endsWith("/outcome") && request.method() === "POST") outcomes++; });
    await page.locator(`#jump-${smsIds[0]}`).getByRole("button", { name: "Done", exact: true }).click();
    await expect(undoFor(page, smsIds[0])).toBeVisible();
    try {
      await context.setOffline(true); await page.clock.runFor(10_500);
      expect((await prisma.jump.findUniqueOrThrow({ where: { id: smsIds[0] } })).status).toBe("DONE");
      await context.setOffline(false); await ready(page);
      await expect(pager(page)).toContainText("Showing 30 of 322 follow-ups"); expect(outcomes).toBe(1);
    } finally { await context.setOffline(false); }
  });

  test("a delayed refresh can be retried without repeating the saved outcome", async ({ page }) => {
    await page.clock.install(); await visit(page, "/jumps?status=pending");
    let outcomes = 0; page.on("request", request => { if (new URL(request.url()).pathname.endsWith("/outcome") && request.method() === "POST") outcomes++; });
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; }); let held = false;
    await page.route("**/jumps**", async route => {
      if (!isRefresh(route.request()) || held) return route.continue();
      held = true; await hold; await route.abort();
    });
    try {
      await page.locator(`#jump-${smsIds[0]}`).getByRole("button", { name: "Done", exact: true }).click();
      await expect(undoFor(page, smsIds[0])).toBeVisible(); await page.clock.runFor(10_500);
      await expect.poll(() => held).toBe(true);
      await page.clock.runFor(21_000); await expect(updates(page)).toContainText("We couldn’t update this list");
      for (const colorScheme of ["light", "dark"] as const) { await theme(page, colorScheme); await audit(page); }
      await updates(page).getByRole("button", { name: "Update list", exact: true }).click();
      await expect(pager(page)).toContainText("Showing 30 of 322 follow-ups"); expect(outcomes).toBe(1);
    } finally { release(); }
  });

  test("a record reopened elsewhere before refresh does not remain hidden", async ({ page }) => {
    await page.clock.install(); await visit(page, "/jumps?status=pending");
    let refreshes = 0;
    let refreshedBody: string | undefined;
    // Keep the server response before passing it to Next's streaming reader.
    // Chromium can release the consumed body before response.text() reads it.
    await page.route("**/jumps**", async route => {
      if (!isRefresh(route.request())) return route.continue();
      const response = await route.fetch();
      refreshedBody = await response.text();
      await deliverFetched(route, response);
    });
    page.on("request", request => { if (new URL(request.url()).pathname === "/jumps" && isRefresh(request)) refreshes++; });
    await page.locator(`#jump-${smsIds[0]}`).getByRole("button", { name: "Done", exact: true }).click();
    await expect(undoFor(page, smsIds[0])).toBeVisible();
    const reopened = await prisma.jump.update({ where: { id: smsIds[0] }, data: { status: "PENDING", completedAt: null, completionMethod: null } });
    // Starting a read before React commits Undo can buffer a stale completion
    // and incorrectly acknowledge the outcome before this reopening.
    expect(refreshes).toBe(0);
    const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === "/jumps" && isRefresh(response.request()));
    await page.clock.runFor(10_500);
    const response = await refreshed;
    expect(response.status()).toBe(200);
    expect(refreshedBody).toContain(`"revision":"${reopened.updatedAt.toISOString()}"`);
    await expect(page.locator(`#jump-${smsIds[0]}`)).toBeVisible();
    await expect(page.locator(".jump-card")).toHaveCount(30);
    await expect(pager(page)).toContainText("Showing 30 of 323 follow-ups");
  });

  test("completed cards remain visible in history after the Undo window", async ({ page }) => {
    await prisma.jump.updateMany({ where: { workspaceId, id: { not: smsIds[0] } }, data: { status: "CANCELED" } });
    await page.clock.install(); await visit(page, "/jumps?range=all");
    await expect(pager(page)).toContainText("Showing 1 of 1 follow-up");
    await page.locator(`#jump-${smsIds[0]}`).getByRole("button", { name: "Done", exact: true }).click();
    await expect(undoFor(page, smsIds[0])).toBeVisible(); await page.clock.runFor(10_500);
    await expect(page.locator(`#jump-${smsIds[0]}.jump-task-complete`)).toBeVisible();
    await expect(pager(page)).toContainText("Showing 1 of 1 follow-up");
    await expect(page.locator(".today-page-header")).toContainText("No open follow-ups in this view");
  });
});

test("native browser zoom preserves Today drafts, filters and history at 200 and 400 percent", async ({ browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name === "mobile-chromium", "Native zoom is qualified with desktop Chromium's tabs API.");
  test.setTimeout(420_000);
  const directory = await mkdtemp(join(tmpdir(), "jitm-native-zoom-"));
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
  const measurements: Array<{ zoom: number; width: number; dpr: number; history: boolean; colorScheme: string }> = [];
  try {
    // A temporary extension sets actual browser zoom. CSS zoom, pinch scaling,
    // and viewport resizing do not establish the same layout behavior.
    const extension = join(directory, "extension"); await mkdir(extension);
    await writeFile(join(extension, "manifest.json"), JSON.stringify({ manifest_version: 3, name: "Local zoom qualification", version: "1.0", permissions: ["tabs"], background: { service_worker: "worker.js" } }));
    await writeFile(join(extension, "worker.js"), "chrome.runtime.onInstalled.addListener(() => {});");
    context = await chromium.launchPersistentContext(join(directory, "profile"), {
      channel: "chromium", headless: true, viewport: null, deviceScaleFactor: undefined, ignoreHTTPSErrors: true, baseURL: process.env.APP_URL!,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--window-size=1280,960"]
    });
    const extensionWorker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
    const page = await context.newPage(); page.setDefaultTimeout(30_000);
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await visit(page, "/jumps?status=pending");
    const baseline = await page.evaluate(() => ({ width: innerWidth, dpr: devicePixelRatio }));
    expect(baseline.width).toBe(1280);
    for (const zoom of [1, 2, 4]) {
      await test.step(`Native browser zoom at ${zoom * 100}%`, async () => {
        const actualZoom = await extensionWorker.evaluate(async ({ zoom, origin }) => {
          const api = (globalThis as typeof globalThis & { chrome: { tabs: {
            query(options: { url: string }): Promise<Array<{ id?: number }>>;
            setZoom(id: number, zoom: number): Promise<void>;
            getZoom(id: number): Promise<number>;
          } } }).chrome.tabs;
          const [tab] = await api.query({ url: `${origin}/*` });
          if (tab?.id === undefined) throw new Error("The isolated application tab was not found.");
          await api.setZoom(tab.id, zoom); return api.getZoom(tab.id);
        }, { zoom, origin: new URL(process.env.APP_URL!).origin });
        expect(actualZoom).toBeCloseTo(zoom, 4);
        await expect.poll(() => page.evaluate(() => innerWidth)).toBe(Math.round(baseline.width / zoom));
        expect(await page.evaluate(() => devicePixelRatio)).toBeCloseTo(baseline.dpr * zoom, 4);
        for (const history of [false, true]) {
          await visit(page, history ? "/jumps?range=all&status=done" : "/jumps?status=pending");
          await expect(page.locator(history ? ".jump-task-complete" : ".jump-card")).toHaveCount(30);
          for (const colorScheme of ["light", "dark"] as const) {
            await theme(page, colorScheme); await audit(page);
            const geometry = await page.evaluate(() => ({ width: innerWidth, dpr: devicePixelRatio, overflow: document.documentElement.scrollWidth > innerWidth + 1 }));
            expect(geometry.overflow).toBe(false);
            measurements.push({ zoom, history, colorScheme, width: geometry.width, dpr: geometry.dpr });
          }
          if (!history) {
            const review = page.getByRole("button", { name: "Review message for Queue person 002", exact: true });
            await review.focus(); await page.keyboard.press("Enter");
            const message = page.getByRole("dialog", { name: "Message Queue person 002", exact: true });
            const draft = message.getByRole("textbox", { name: "Edit before sending", exact: true });
            const original = await draft.inputValue();
            await draft.fill(`Unsent draft at ${zoom * 100}% zoom`); await audit(page);
            await page.keyboard.press("Escape"); await expect(review).toBeFocused();
            await page.keyboard.press("Enter"); await expect(draft).toHaveValue(`Unsent draft at ${zoom * 100}% zoom`);
            await page.keyboard.press("Escape");
            await pager(page).getByRole("link", { name: "Next follow-ups", exact: true }).click();
            const guard = page.getByRole("dialog", { name: "Keep your message edits?", exact: true });
            await audit(page);
            await guard.getByRole("button", { name: "Keep editing", exact: true }).click();
            await expect(draft).toBeFocused(); await expect(draft).toHaveValue(`Unsent draft at ${zoom * 100}% zoom`);
            await message.getByRole("button", { name: "Discard edits", exact: true }).click();
            await expect(draft).toHaveValue(original); await page.keyboard.press("Escape");
            await expect(page.locator('[data-follow-up-draft="true"]')).toHaveCount(0);
            const filter = page.getByRole("button", { name: /^Filter(?: \d+)?$/ });
            await filter.focus(); await page.keyboard.press("Enter");
            const panel = page.getByRole("dialog", { name: "Filter Today", exact: true });
            await panel.getByRole("combobox", { name: "Dates", exact: true }).focus(); await audit(page);
            await page.keyboard.press("Escape"); await expect(filter).toBeFocused();
            // Native close events restore focus after Escape returns. Let that
            // restoration finish before moving focus to the pagination link.
            await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
          }
          await next(page, history ? completedIds[30] : smsIds[30]);
          await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeFocused();
          for (const link of await pager(page).getByRole("link").all()) {
            await link.scrollIntoViewIfNeeded();
            const target = await link.evaluate(element => {
              const r = element.getBoundingClientRect();
              const top = document.elementFromPoint(r.left + 4, r.top + 4), bottom = document.elementFromPoint(r.right - 4, r.bottom - 4);
              return { label: element.textContent, width: r.width, height: r.height, top: r.top, bottom: r.bottom, viewportHeight: innerHeight,
                topHit: top?.className, bottomHit: bottom?.className, reachable: r.width >= 44 && r.height >= 44 && element.contains(top) && element.contains(bottom) };
            });
            expect(target.reachable, JSON.stringify({ zoom, history, ...target })).toBe(true);
          }
        }
      });
    }
    expect(errors).toEqual([]);
  } finally {
    const evidencePath = testInfo.outputPath("native-browser-zoom.json");
    await writeFile(evidencePath, JSON.stringify(measurements, null, 2));
    await testInfo.attach("native-browser-zoom", { path: evidencePath, contentType: "application/json" });
    await context?.close(); await rm(directory, { recursive: true, force: true });
  }
});
