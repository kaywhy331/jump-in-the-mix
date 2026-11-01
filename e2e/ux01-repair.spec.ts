import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import type { Prisma } from "../src/generated/prisma/client";
import { emptyWorkflowState, type WorkflowDefinition } from "../src/lib/mix-workflow-types";
import { componentBundle } from "./ux01-repair-harness";
import { resolveNextActions, type NextActionCandidate } from "../src/lib/next-action";

if (!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "")) throw new Error("Disposable local database required");
let userId: string, workspaceId: string, versionId: string, mixId: string, stepId: string;
const token = randomUUID(), suffix = randomUUID();
test.use({ screenshot: "off", video: "off", trace: "off" });
const now = new Date("2026-10-01T12:00:00Z");
test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `next-action-${suffix}@example.com`, name: "Next action owner", passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: `next-action-${suffix}`, name: "Next action fixture", members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "America/Los_Angeles" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  versionId = (await prisma.stepVersion.create({ data: { stepTemplate: { create: { workspaceId, name: "Check in", channel: "SMS" } }, version: 1, body: "Hi, checking in." } })).id;
  const mix = await prisma.mix.create({ data: { workspaceId, name: "One-time follow-up", status: "ACTIVE", source: "ONE_TIME", triggerMode: "MANUAL_START", steps: { create: { stepVersionId: versionId, dayOffset: 0, sortOrder: 1 } } }, include: { steps: true } });
  mixId = mix.id; stepId = mix.steps[0].id;
});
test.beforeEach(async ({ context }) => {
  await prisma.contact.deleteMany({ where: { workspaceId } });
  await prisma.job.deleteMany({ where: { workspaceId } });
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
});
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});
async function person() { return prisma.contact.create({ data: { workspaceId, displayName: "Morgan Fixture", firstName: "Morgan", phones: { create: { phone: "+1 555 010 1002", normalized: "+15550101002", isPrimary: true } } } }); }
async function visit(page: Page, href: string) { await page.goto(href); await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", ""); }
const next = (page: Page) => page.locator("[data-next-action-state]");
async function jump(contactId: string, scheduledAt: Date) {
  const id = randomUUID();
  return prisma.jump.create({ data: { id, workspaceId, contactId, mixId, mixStepId: stepId, stepVersionId: versionId, reason: "One-time check-in", status: "PENDING", scheduledAt, baseScheduledAt: scheduledAt, uniquenessKey: id, templateSnapshot: { oneTime: true, body: "Hi, checking in.", channel: "SMS", originalLocalDate: scheduledAt.toISOString().slice(0, 10), timezone: "America/Los_Angeles" }, renderedSnapshot: { body: "Hi, checking in." } } });
}
async function outcome(contactId: string) {
  const mix = await prisma.mix.create({ data: { workspaceId, name: "Estimate follow-up", status: "ACTIVE", source: "USER", triggerMode: "MANUAL_START", steps: { create: { stepVersionId: versionId, dayOffset: 0, sortOrder: 1 } } }, include: { steps: true } });
  const definition: WorkflowDefinition = { revision: 1, gatedStepIds: [], intentionalEnds: [], mixes: [{ id: mix.id, name: mix.name, status: "ACTIVE", source: "USER", triggerMode: "MANUAL_START", steps: [{ id: mix.steps[0].id, versionId, name: "Check in", channel: "SMS", dayOffset: 0, sendTimeMinutes: null, plannedAt: null, anchor: "CALENDAR_DAY", offsetMinutes: null, subject: null, body: "Hi, checking in.", script: null }] }], rules: [{ id: "decision", name: "Estimate reply", source: { mixId: mix.id, stepId: null }, enabled: true, mode: "CHOICE", join: null, routes: [{ id: "yes", label: "Yes", when: "OUTCOME", outcome: "yes", target: null, delayMinutes: 0, maxVisits: null, replace: false }] }] };
  const state = emptyWorkflowState();
  state.runs = ["first", "second"].map(id => ({ id, mixId: mix.id, startedAt: now.toISOString(), completedAt: now.toISOString(), status: "FINISHED", parentTransitionId: null, legacy: false }));
  state.evaluations = ["first", "second"].map(id => ({ id, ruleId: "decision", runId: id, visitId: null, occurredAt: now.toISOString(), outcome: null, decidedAt: null, generation: 0, status: "WAITING", joined: false }));
  return prisma.mixWorkflowInstance.create({ data: { workspaceId, contactId, admissionKey: randomUUID(), label: "Estimate follow-up", definition: definition as unknown as Prisma.InputJsonValue, state: state as unknown as Prisma.InputJsonValue } });
}


async function sequenceFollowUp(contactId: string) {
  const mix = await prisma.mix.create({ data: { workspaceId, name: "Sequence fixture", status: "ACTIVE", source: "USER", triggerMode: "MANUAL_START", steps: { create: { stepVersionId: versionId, dayOffset: 0, sortOrder: 1 } } }, include: { steps: true } });
  const pending = await jump(contactId, new Date("2099-11-04T17:00:00Z"));
  return prisma.jump.update({ where: { id: pending.id }, data: { mixId: mix.id, mixStepId: mix.steps[0].id } });
}

async function theme(page: Page, value: string) {
  await page.addInitScript(value => { localStorage.setItem("jitm-appearance", value); document.documentElement.dataset.theme = value; }, value);
  await page.evaluate(value => { document.documentElement.dataset.theme = value; }, value);
}
async function stateEvent(page: Page, jumpId: string, status: string) {
  await page.evaluate(detail => window.dispatchEvent(new CustomEvent("jitm:jump-state", { detail })), { jumpId, status });
}
async function installRefresh(page: Page) {
  // Obtain the existing router from its provider in the real production page; no application test hook.
  await expect.poll(() => page.locator("[data-next-action-state]").evaluate(element => {
    const key = Object.keys(element).find(key => key.startsWith("__reactFiber"));
    if (!key) return false;
    let fiber = (element as unknown as Record<string, any>)[key];
    while (fiber) {
      const value = fiber.memoizedProps?.value;
      if (value && typeof value.refresh === "function" && typeof value.push === "function") {
        (window as unknown as Record<string, any>).ux01Refresh = () => value.refresh();
        return true;
      }
      fiber = fiber.return;
    }
    return false;
  })).toBe(true);
}
async function observeAbsentFrames(page: Page, id: string) {
  return page.evaluate(async id => {
    let revived = 0;
    for (let frame = 0; frame < 60; frame++) {
      await new Promise(requestAnimationFrame);
      if (document.querySelector(`[data-next-action-state] a[href*="jump=${id}"]`)) revived++;
    }
    return revived;
  }, id);
}

for (const appearance of ["light", "dark"]) {
  for (const surface of ["Today", "Contacts"]) for (const status of ["DONE", "SKIPPED"] as const) {
    test(`H01 page ${surface} ${status} delayed read and real Undo in ${appearance}`, async ({ page }) => {
      const contact = await person(); const pending = await jump(contact.id, now);
      await theme(page, appearance);
      await visit(page, surface === "Today" ? "/jumps" : `/contacts/${contact.id}`);
      const href = `/jumps?jump=${pending.id}&range=all`;
      await expect(next(page).locator(`a[href="${href}"]`).first()).toBeVisible();
      await installRefresh(page);
      let release!: () => void, captured = false, delivered = false, held = false;
      const gate = new Promise<void>(resolve => { release = resolve; });
      await page.route("**/*", async route => {
        if (route.request().headers().rsc !== "1" || route.request().headers()["next-router-prefetch"] || held) return route.continue();
        held = true; const response = await route.fetch(); const body = await response.body(); captured = true;
        await gate; await route.fulfill({ response, body }); delivered = true;
      });
      try {
        await page.evaluate("window.ux01Refresh()");
        await expect.poll(() => captured).toBe(true);
        const response = await page.request.post(`/api/jumps/${pending.id}/outcome`, { headers: { origin: process.env.APP_URL! }, data: { outcome: status === "DONE" ? "COMPLETED" : "SKIPPED", requestId: randomUUID() } });
        expect(response.ok(), await response.text()).toBe(true);
        expect((await prisma.jump.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe(status);
        await stateEvent(page, pending.id, status);
        await expect(next(page).locator(`a[href="${href}"]`)).toHaveCount(0);
        release(); await expect.poll(() => delivered).toBe(true);
        expect(await observeAbsentFrames(page, pending.id)).toBe(0);
        expect((await prisma.jump.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe(status);
        if (surface === "Today") {
          await page.locator(`[data-follow-up-undo][data-jump-workflow="${pending.id}"]`).getByRole("button", { name: "Undo", exact: true }).click();
        } else {
          const undo = await page.request.post(`/api/jumps/${pending.id}/outcome`, { headers: { origin: process.env.APP_URL! }, data: { outcome: "REOPENED", requestId: randomUUID() } });
          expect(undo.ok(), await undo.text()).toBe(true);
          await stateEvent(page, pending.id, "PENDING");
        }
        await expect.poll(async () => (await prisma.jump.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("PENDING");
        await page.evaluate("window.ux01Refresh()");
        await expect(next(page).locator(`a[href="${href}"]`).first()).toBeVisible();
      } finally { release(); }
    });
  }

  for (const viewport of [{ width: 600, height: 900, text: 1 }, { width: 320, height: 900, text: 2 }]) {
    test(`FOCUS-01 primary and secondary complete at ${viewport.width} text ${viewport.text} in ${appearance}`, async ({ page }, testInfo) => {
      const contact = await person(); await outcome(contact.id); await sequenceFollowUp(contact.id);
      await page.setViewportSize(viewport); await theme(page, appearance);
      for (const route of ["/jumps", `/contacts/${contact.id}`]) {
        await visit(page, route);
        if (viewport.text !== 1) await page.evaluate(scale => {
          const elements = [...document.querySelectorAll<HTMLElement>("body *")];
          const sizes = elements.map(element => parseFloat(getComputedStyle(element).fontSize));
          elements.forEach((element, i) => { element.style.fontSize = `${sizes[i] * scale}px`; });
        }, viewport.text);
        const summary = next(page).locator("summary");
        // A native summary can toggle before hydration and have Enter replayed afterwards.
        await expect.poll(() => summary.evaluate(element => Object.keys(element).some(key => key.startsWith("__reactProps")))).toBe(true);
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        await summary.focus(); await page.keyboard.press("Enter");
        await expect(next(page).locator("details.next-action-secondary")).toHaveAttribute("open", "");
        for (const control of await next(page).locator("a, summary").all()) {
          await control.scrollIntoViewIfNeeded(); await control.focus();
          await expect(control).toBeFocused();
          const geometry = await control.evaluate(element => {
            const r = element.getBoundingClientRect(), style = getComputedStyle(element);
            const outset = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
            let left = 0, right = innerWidth, top = 0, bottom = innerHeight;
            for (let parent = element.parentElement; parent; parent = parent.parentElement) {
              const p = getComputedStyle(parent), box = parent.getBoundingClientRect();
              if (/(hidden|clip|auto|scroll)/.test(p.overflowX)) { left = Math.max(left, box.left); right = Math.min(right, box.right); }
              if (/(hidden|clip|auto|scroll)/.test(p.overflowY)) { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
            }
            return { width: parseFloat(style.outlineWidth), style: style.outlineStyle, left: r.left - outset - left, right: right - r.right - outset, top: r.top - outset - top, bottom: bottom - r.bottom - outset };
          });
          await testInfo.attach("focus-geometry", { body: JSON.stringify({ url: page.url(), appearance, viewport, control: await control.innerText(), geometry }), contentType: "application/json" });
          expect(geometry.style).not.toBe("none"); expect(geometry.width).toBeGreaterThan(0);
          for (const edge of [geometry.left, geometry.right, geometry.top, geometry.bottom]) expect(edge).toBeGreaterThanOrEqual(0);
        }
        if (process.env.UX01_SCREENSHOTS && testInfo.project.name === "desktop-chromium" && route === "/jumps") {
          await next(page).locator(".contact-review-button").focus();
          await page.screenshot({ path: `${process.env.UX01_SCREENSHOTS}/focus-${appearance}-${viewport.width}.png` });
        }
      }
    });
  }

  for (const width of [1200, 1279]) test(`FUTURE-01 outcome retains future follow-up and appointment links at ${width} in ${appearance}`, async ({ page }) => {
    const contact = await person(); await outcome(contact.id);
    const future = await sequenceFollowUp(contact.id);
    const later = await jump(contact.id, new Date("2099-11-05T17:00:00Z"));
    const meeting = await prisma.calendarEntry.create({ data: { workspaceId, contactId: contact.id, kind: "MEETING", title: "Future fixture visit", startsAt: new Date("2099-11-03T17:00:00Z"), endsAt: new Date("2099-11-03T18:00:00Z"), timezone: "UTC" } });
    await page.setViewportSize({ width, height: 900 }); await theme(page, appearance);
    await visit(page, `/contacts/${contact.id}`);
    await expect(next(page).locator(".contact-review-button")).toHaveText("Record outcome");
    for (const item of [future, later]) {
      const link = next(page).locator(`a[href="/jumps?jump=${item.id}&range=all"]`);
      await expect(next(page).locator(`a.next-action-link[href="/jumps?jump=${item.id}&range=all"]`)).toBeVisible();
      if (item.id === future.id) await expect(link).toHaveCount(2);
    }
    await expect(next(page).locator(`a[href*="edit=${meeting.id}"]`)).toBeVisible();
  });
}

for (const today of [false, true]) for (const status of ["DONE", "SKIPPED"]) {
  test(`H01 component ${today ? "Today" : "Contacts"} ${status} delayed and out-of-order snapshots`, async ({ page }) => {
    await page.goto("about:blank"); await page.setContent('<div id="fixture"></div>');
    await page.addScriptTag({ content: await componentBundle() });
    const updatedAt = "2026-11-01T12:00:00.000Z";
    const item: NextActionCandidate = { id: "fixture:jump:one", jumpId: "one", contactId: "fixture", contactName: "Fixture", kind: "follow-up", title: "Check in", detail: "Prepared follow-up", action: "Review message", href: "/jumps?jump=one", dueAt: updatedAt, updatedAt };
    const render = async (items: NextActionCandidate[], observedAt: string) => {
      const projection = resolveNextActions(items, { now: new Date(observedAt), timeZone: "UTC" });
      await page.evaluate(`window.ux01.render(${JSON.stringify(projection)}, ${today})`);
    };
    await render([item], updatedAt);
    await expect(next(page).getByRole("link", { name: "Review message" })).toBeVisible();
    await stateEvent(page, "one", status);
    await expect(next(page).getByRole("link", { name: "Review message" })).toHaveCount(0);
    await render([item], "2026-11-01T12:01:00.000Z");
    expect(await observeAbsentFrames(page, "one")).toBe(0);
    await render([], "2026-11-01T12:02:00.000Z");
    await render([item], "2026-11-01T12:01:00.000Z");
    expect(await observeAbsentFrames(page, "one")).toBe(0);
    await render([{ ...item, title: "Restored version", updatedAt: "2026-11-01T12:03:00.000Z" }], "2026-11-01T12:04:00.000Z");
    await expect(next(page).getByRole("link", { name: "Review message" })).toBeVisible();
    await render([item], "2026-11-01T12:01:00.000Z");
    await expect(next(page).getByRole("link", { name: "Review message" })).toBeVisible();
    await expect(next(page)).toContainText("Restored version");
    await stateEvent(page, "one", status);
    await expect(next(page).getByRole("link", { name: "Review message" })).toHaveCount(0);
    await stateEvent(page, "one", "PENDING");
    await expect(next(page).getByRole("link", { name: "Review message" })).toBeVisible();
  });
}
