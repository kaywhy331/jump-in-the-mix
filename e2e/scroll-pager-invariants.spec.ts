import { createHash, randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { textBelowFloor } from "./text-floor";

// NAV-02-R3: the same text floor and exclusion contract apply to every pager mounting.
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ serviceWorkers: "block" });
test.setTimeout(180_000);
let userId: string, workspaceId: string, mixId: string, megaId: string, templateId: string;
const token = randomUUID();
test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `pager-invariants-${randomUUID()}@example.invalid`, name: "Pager invariants", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Pager invariants", slug: randomUUID(), members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  mixId = (await prisma.mix.create({ data: { workspaceId, name: "Invariant Mix", status: "DRAFT", triggerMode: "MANUAL_START" } })).id;
  for (let beat = 0; beat < 3; beat++) {
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name: `Conversation ${beat + 1}`, channel: "PHONE_CALL", versions: { create: { version: 1, script: "What would help today?" } } }, include: { versions: true } });
    await prisma.mixStep.create({ data: { mixId, stepVersionId: template.versions[0].id, dayOffset: beat, sortOrder: beat } });
  }
  megaId = (await prisma.megaMixPipeline.create({ data: { workspaceId, name: "Invariant Mega-Mix", members: { create: { mixId, position: 0 } } } })).id;
  templateId = (await prisma.sharedMix.create({ data: { title: "Invariant ready-made", description: "A plan to adapt.", category: "Relationships", framework: "Ready-made", durationDays: 7, steps: [{ name: "Hello", channel: "PHONE_CALL", script: "What would help today?", dayOffset: 0, sendTimeMinutes: 600 }], status: "APPROVED" } })).id;
});
test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{ name: "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, sameSite: "Strict" }]);
  await page.setViewportSize({ width: 390, height: 844 });
});
test.afterAll(async () => {
  if (templateId) await prisma.sharedMix.deleteMany({ where: { id: templateId } });
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});
const routes = () => ["/journey", `/mixes?mix=${mixId}`, `/mixes/mega?megaMix=${megaId}`, `/templates?mix=${templateId}`, `/marketplace?q=Invariant%20ready-made`];
async function visit(page: Page, path: string) {
  await page.goto(path, { waitUntil: "networkidle" });
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "", { timeout: 60_000 });
  if (path.startsWith("/marketplace")) await page.locator(".mix-library-item", { hasText: "Invariant ready-made" }).click();
}
async function settled(page: Page) {
  await expect.poll(() => page.locator(".scroll-pager-track").evaluate(track => {
    const panel = track.querySelector<HTMLElement>("[data-pager-selected]")!;
    return Math.abs(panel.getBoundingClientRect().left - track.getBoundingClientRect().left);
  })).toBeLessThanOrEqual(1);
}

test("every pager pane meets the phone text floor in both themes", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-chromium", "Phone paging needs touch.");
  for (const path of routes()) {
    await visit(page, path);
    await expect(page.locator(".scroll-pager")).toHaveAttribute("data-paging");
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme });
        const tabs = page.locator(".scroll-pager-tabs > [role=tab]:enabled");
        for (let index = 0; index < await tabs.count(); index++) {
          await tabs.nth(index).click();
          await settled(page);
          expect.soft(await textBelowFloor(page, { scope: ".scroll-pager" }), `${path}, ${width}, ${colorScheme}, tab ${index}`).toEqual([]);
        }
      }
    }
  }
});

async function drag(page: Page, from: { x: number; y: number }, dx: number, pointer: "touch" | "mouse") {
  if (pointer === "mouse") {
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(from.x + dx, from.y, { steps: 12 }); await page.mouse.up();
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
    for (let step = 1; step <= 12; step++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + dx * step / 12, y: from.y }] });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally { await cdp.detach(); }
}

// Contract probes live inside the real mounted panel, not a substitute pager implementation.
// They isolate native control/scroll/edge behavior from page-specific handlers.
const probes = ["input", "textarea", "select", "editable", "slider", "opt-out", "horizontal-start", "horizontal-end", "horizontal-middle", "sheet", "left-edge", "right-edge"] as const;
for (const pointer of ["touch", "mouse"] as const) test(`${pointer} exclusions preserve target events and never page in every pager`, async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-chromium", "Phone paging needs touch.");
  for (const path of routes()) {
    await visit(page, path);
    const tabs = page.locator(".scroll-pager-tabs > [role=tab]:enabled");
    await tabs.nth(Math.min(1, await tabs.count() - 1)).click();
    await settled(page);
    for (const kind of probes) {
      const before = await page.locator(".scroll-pager-track").evaluate(track => ({ left: track.scrollLeft, selected: track.querySelector("[data-pager-selected]")?.getAttribute("data-pager-pane") }));
      const from = await page.evaluate(kind => {
        const panel = document.querySelector<HTMLElement>(".scroll-pager [data-pager-selected]")!;
        const target = document.createElement(kind === "input" || kind === "slider" ? "input" : kind === "textarea" ? "textarea" : kind === "select" ? "select" : kind === "sheet" ? "dialog" : "div");
        target.id = "exclusion-probe";
        target.style.cssText = "position:absolute;z-index:1000;top:120px;left:15%;width:70%;height:80px;background:var(--surface);color:var(--text);";
        if (kind === "editable") target.contentEditable = "true";
        if (kind === "slider") (target as HTMLInputElement).type = "range";
        if (kind === "opt-out") target.dataset.swipeIgnore = "";
        if (kind === "select") target.innerHTML = "<option>Choose</option>";
        if (kind.startsWith("horizontal")) {
          target.style.overflowX = "auto";
          target.innerHTML = '<div style="width:1000px;height:60px">Scrollable content</div>';
        }
        if (kind.endsWith("edge")) { target.style.left = "0"; target.style.width = "100%"; }
        panel.append(target);
        if (kind === "sheet") (target as HTMLDialogElement).showModal();
        if (kind === "horizontal-end") target.scrollLeft = target.scrollWidth;
        if (kind === "horizontal-middle") target.scrollLeft = 100;
        const events: { type: string; prevented: boolean }[] = [], starts: string[] = [], positions: number[] = [];
        Object.assign(window, { exclusionEvidence: { events, starts, positions } });
        const track = panel.closest<HTMLElement>(".scroll-pager-track")!;
        const record = (event: Event) => { if (target.contains(event.target as Node)) events.push({ type: event.type, prevented: event.defaultPrevented }); };
        for (const name of ["touchstart", "touchmove", "touchend", "pointerdown", "pointermove", "pointerup"]) document.addEventListener(name, record);
        target.addEventListener("pointerdown", () => starts.push("pointerdown"));
        target.addEventListener("touchstart", () => starts.push("touchstart"));
        const onScroll = () => positions.push(track.scrollLeft);
        track.addEventListener("scroll", onScroll);
        Object.assign(target, { cleanup: () => {
          for (const name of ["touchstart", "touchmove", "touchend", "pointerdown", "pointermove", "pointerup"]) document.removeEventListener(name, record);
          track.removeEventListener("scroll", onScroll);
        } });
        const box = target.getBoundingClientRect();
        return { x: kind === "left-edge" ? 8 : kind === "right-edge" ? innerWidth - 8 : box.x + box.width / 2, y: box.y + box.height / 2 };
      }, kind);
      await drag(page, from, kind === "left-edge" || kind === "horizontal-start" ? 160 : -160, pointer);
      await page.waitForTimeout(400);
      const evidence = await page.evaluate(() => {
        const target = document.getElementById("exclusion-probe") as HTMLElement & { cleanup: () => void };
        const result = (window as unknown as { exclusionEvidence: { events: { type: string; prevented: boolean }[]; starts: string[]; positions: number[] } }).exclusionEvidence;
        const innerLeft = target.scrollLeft;
        target.cleanup(); target.remove();
        const track = document.querySelector<HTMLElement>(".scroll-pager-track")!;
        return { ...result, innerLeft, left: track.scrollLeft, selected: track.querySelector("[data-pager-selected]")?.getAttribute("data-pager-pane") };
      });
      const label = `${path} ${pointer} ${kind}`;
      if (kind === "horizontal-middle" && pointer === "touch") expect.soft(evidence.innerLeft, `${label}: child still scrolls`).toBeGreaterThan(100);
      expect.soft(evidence.starts, label).toContain("pointerdown");
      if (pointer === "touch") expect.soft(evidence.starts, label).toContain("touchstart");
      expect.soft(evidence.events.filter(event => event.prevented), `${label}: unchanged events`).toEqual([]);
      expect.soft(evidence.selected, label).toBe(before.selected);
      expect.soft(Math.max(Math.abs(evidence.left - before.left), ...evidence.positions.map(left => Math.abs(left - before.left))), `${label}: track stays still`).toBeLessThanOrEqual(1);
      // Restore through the visible tab after a failure so every exclusion is independently observed.
      await tabs.nth(Math.min(1, await tabs.count() - 1)).click(); await settled(page);
    }
  }
});
