import { createHash, randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { saveWorkflowConfiguration } from "../src/lib/mix-workflow";
import { emptyWorkflow } from "../src/lib/mix-workflow-types";
import { axeInPage } from "./axe-in-page";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block", timezoneId: "America/Los_Angeles" });
test.setTimeout(120_000);
let workspaceId: string, userId: string;
const token = randomUUID(), mixes: string[] = [], beats: string[] = [];
const failures: string[] = [];
test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `connections-${randomUUID()}@example.invalid`, name: "Connection fixture", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Connection fixture", slug: randomUUID(), members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  for (const name of ["Welcome", "Follow through"]) {
    const mix = await prisma.mix.create({ data: { workspaceId, name, status: "ACTIVE", triggerMode: "MANUAL_START" } });
    mixes.push(mix.id);
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name: `${name} conversation`, channel: "PHONE_CALL", versions: { create: { version: 1, body: "A private fixture with no recipient or delivery." } } }, include: { versions: true } });
    const step = await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: template.versions[0].id, dayOffset: 0, sortOrder: 0 } });
    beats.push(step.id);
  }
});
test.beforeEach(async ({ context, page }) => {
  failures.length = 0;
  page.on("pageerror", error => failures.push(error.message));
  const current = await prisma.mixWorkflow.findUnique({ where: { workspaceId } });
  await prisma.$transaction(db => saveWorkflowConfiguration(db, workspaceId, emptyWorkflow(), current?.revision ?? 0, userId));
  await context.addCookies([{ name: "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, sameSite: "Strict" }]);
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/journey", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Reset zoom to 100%", exact: true }).click();
});
test.afterEach(() => expect(failures).toEqual([]));
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});
const port = (page: Page, mix: number, beat: boolean, direction: "input" | "output") => page.locator(`[data-workflow-port="${direction}"][data-workflow-mix="${mixes[mix]}"][data-workflow-step="${beat ? beats[mix] : ""}"]`);
const editor = (page: Page) => page.getByRole("complementary", { name: "Journey details" }).locator("form").first();
const canvas = (page: Page) => page.getByRole("region", { name: /^Scrollable journey diagram/ });
async function expand(page: Page) {
  for (const id of mixes) await page.locator(`[data-workflow-node="${id}"]`).getByRole("button", { name: "Show Beats", exact: true }).click();
}
async function center(locator: Locator) { const box = await locator.boundingBox(); expect(box).toBeTruthy(); return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }; }
async function drag(page: Page, from: Locator, to: Locator) {
  await from.scrollIntoViewIfNeeded(); await to.scrollIntoViewIfNeeded();
  const a = await center(from), b = await center(to);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 12 });
  await expect(page.locator("path[data-ready=true]")).toBeVisible(); await page.mouse.up();
}

test("drag every Mix/Beat combination, preserve exact endpoints, and cancel without saving", async ({ page }) => {
  await expand(page);
  let posts = 0; page.on("request", request => { if (request.url().includes("/api/mix-workflow") && request.method() === "POST") posts++; });
  for (const [sourceBeat, targetBeat] of [[false, false], [false, true], [true, false], [true, true]]) {
    await drag(page, port(page, 0, sourceBeat, "output"), port(page, 1, targetBeat, "input"));
    await expect(editor(page).getByRole("heading", { name: "Connect what happens next" })).toBeFocused();
    await expect(editor(page).getByLabel("After which Mix or Beat?")).toHaveValue(sourceBeat ? `beat:${beats[0]}` : `mix:${mixes[0]}`);
    await expect(editor(page).getByRole("combobox", { name: /^Continue to/ })).toHaveValue(targetBeat ? `beat:${beats[1]}` : `mix:${mixes[1]}`);
    await expect(editor(page).getByLabel("Enable this connection")).not.toBeChecked();
    await expect(editor(page).getByRole("button", { name: "Remove connection" })).toHaveCount(0);
    await expect(port(page, 1, false, "output")).toBeDisabled();
    await editor(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(port(page, 0, sourceBeat, "output")).toBeFocused();
  }
  expect(posts).toBe(0);
});

test("save an enabled Beat connection, reload it, and reopen instead of duplicating", async ({ page }) => {
  await expand(page);
  await drag(page, port(page, 0, true, "output"), port(page, 1, true, "input"));
  await editor(page).getByLabel("Connection name").fill("Continue our conversation");
  await editor(page).getByLabel("Enable this connection").check();
  const response = page.waitForResponse(res => res.url().includes("/api/mix-workflow") && res.request().method() === "POST");
  await editor(page).getByRole("button", { name: "Save connection", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByRole("status").filter({ hasText: "Configuration saved" })).toBeVisible();
  await page.reload({ waitUntil: "networkidle" }); await page.getByRole("button", { name: "Reset zoom to 100%", exact: true }).click(); await expand(page);
  await port(page, 0, true, "output").click(); await port(page, 1, true, "input").click();
  await expect(editor(page).getByRole("heading", { name: "Edit connection" })).toBeVisible();
  await expect(editor(page).getByLabel("Connection name")).toHaveValue("Continue our conversation");
  const saved = await prisma.mixWorkflow.findUniqueOrThrow({ where: { workspaceId } });
  expect(JSON.stringify(saved)).toContain(beats[1]);
  await editor(page).getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await page.locator(`[data-workflow-node="${mixes[0]}"]`).getByRole("button", { name: /Continue our conversation/ }).count()).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole("button", { name: "Fit map", exact: true }).click();
  const visibleEdge = page.locator('svg[aria-label="Configured connections"] > g').first().locator("path").last();
  await expect.poll(() => visibleEdge.evaluate(element => (element as SVGGraphicsElement).getBBox().y)).toBeGreaterThanOrEqual(0);
  // A straight SVG stroke has zero geometry height, so Playwright visibility is not applicable.
  expect(await visibleEdge.evaluate(element => (element as SVGGraphicsElement).getBBox().width)).toBeGreaterThan(0);
  expect(await visibleEdge.evaluate(element => getComputedStyle(element).stroke)).not.toBe("none");
  if (process.env.CONNECTION_ARTIFACTS) await page.screenshot({ path: `${process.env.CONNECTION_ARTIFACTS}/overview-beat-connections.png` });
});

test("saving a drawn connection preserves unrelated changes made in another window", async ({ page, context }) => {
  await expand(page);
  await drag(page, port(page, 0, true, "output"), port(page, 1, true, "input"));
  await editor(page).getByLabel("Connection name").fill("My new Beat connection");
  const graph = await (await context.request.get("/api/mix-workflow")).json();
  const other = { id: randomUUID(), name: "Another window", source: { mixId: mixes[1], stepId: null }, enabled: false, mode: "PARALLEL", join: null, routes: [{ id: randomUUID(), label: "Later", when: "FINISHED", outcome: "", delayMinutes: 0, target: { mixId: mixes[0], stepId: null }, maxVisits: null, replace: false }] };
  const concurrent = await context.request.post("/api/mix-workflow", { headers: { Origin: process.env.APP_URL! }, data: { action: "configure", expectedRevision: graph.revision, configuration: { ...graph.configuration, rules: [other] } } });
  expect(concurrent.status()).toBe(200);
  await editor(page).getByRole("button", { name: "Save connection", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Configuration saved" })).toBeVisible();
  const saved = await (await context.request.get("/api/mix-workflow")).json();
  expect(saved.configuration.rules.map((rule: { name: string }) => rule.name).sort()).toEqual(["Another window", "My new Beat connection"]);
  expect(saved.configuration.gatedStepIds).toContain(beats[1]);
});

test("a failed refresh after saving keeps the saved connection and offers refresh recovery", async ({ page, context }) => {
  await port(page, 0, false, "output").click(); await port(page, 1, false, "input").click();
  await page.route("**/api/mix-workflow?*", route => route.fulfill({ status: 503, json: { error: "Temporary read failure" } }));
  await editor(page).getByRole("button", { name: "Save connection", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Configuration saved" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connect what happens next" })).toHaveCount(0);
  expect((await (await context.request.get("/api/mix-workflow")).json()).configuration.rules).toHaveLength(1);
  await expect(page.getByRole("region", { name: "Mix and Beat journey", exact: true }).getByRole("alert")).toContainText("saved");
  await page.unroute("**/api/mix-workflow?*"); await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("region", { name: "Mix and Beat journey", exact: true }).getByRole("alert")).toHaveCount(0);
});

test("retrying after a lost save response does not duplicate a connection", async ({ page, context }) => {
  await port(page, 0, false, "output").click(); await port(page, 1, false, "input").click();
  await editor(page).getByLabel("Connection name").fill("Retry the same connection");
  let intercepted = false;
  await page.route("**/api/mix-workflow", async route => {
    if (route.request().method() !== "POST" || intercepted) return route.continue();
    intercepted = true; const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort("connectionfailed");
  });
  await editor(page).getByRole("button", { name: "Save connection", exact: true }).click();
  await expect(editor(page).getByRole("alert")).toBeVisible();
  const once = await (await context.request.get("/api/mix-workflow")).json();
  await expect(editor(page).getByLabel("Connection name")).toHaveValue("Retry the same connection");
  await editor(page).getByRole("button", { name: "Save connection", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Configuration saved" })).toBeVisible();
  const twice = await (await context.request.get("/api/mix-workflow")).json();
  expect(twice.revision).toBe(once.revision); expect(twice.configuration.rules).toHaveLength(1);
});

test("same-connection conflicts preserve the draft and support review or an explicit replacement", async ({ page, context }) => {
  const graph = async () => (await context.request.get("/api/mix-workflow")).json();
  const changeElsewhere = async (name: string) => {
    const current = (await graph()).configuration.rules[0];
    const result = await context.request.post("/api/mix-workflow", { headers: { Origin: process.env.APP_URL! }, data: { action: "save-rule", rule: { ...current, name }, expectedRule: current } });
    expect(result.status()).toBe(200);
  };
  await port(page, 0, false, "output").click(); await port(page, 1, false, "input").click();
  await editor(page).getByRole("button", { name: "Save connection", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Configuration saved" })).toBeVisible();
  await port(page, 0, false, "output").click(); await port(page, 1, false, "input").click();
  await editor(page).getByLabel("Connection name").fill("My unsaved changes"); await changeElsewhere("Saved in another window");
  await editor(page).getByRole("button", { name: "Save connection", exact: true }).click();
  await expect(editor(page).getByRole("alert")).toContainText("changed in another window");
  await expect(editor(page).getByLabel("Connection name")).toHaveValue("My unsaved changes");
  await expect(editor(page).getByRole("button", { name: "Save connection", exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 1000 });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    expect((await axeInPage(page).include('[aria-label="Journey details"]').withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    if (process.env.CONNECTION_ARTIFACTS) await page.screenshot({ path: `${process.env.CONNECTION_ARTIFACTS}/save-conflict-${theme}.png`, fullPage: true });
  }
  await editor(page).getByRole("button", { name: "Use saved version", exact: true }).click();
  await expect(editor(page).getByLabel("Connection name")).toHaveValue("Saved in another window");
  await editor(page).getByLabel("Connection name").fill("My reviewed version"); await changeElsewhere("Changed once more");
  await editor(page).getByRole("button", { name: "Save connection", exact: true }).click();
  await expect(editor(page).getByRole("alert")).toContainText("changed in another window");
  expect((await graph()).configuration.rules[0].name).toBe("Changed once more");
  await editor(page).getByRole("button", { name: "Save my version", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit connection" })).toHaveCount(0);
  expect((await graph()).configuration.rules[0].name).toBe("My reviewed version");
});

test("keyboard and reverse-direction selection create a bounded return path", async ({ page }) => {
  const input = port(page, 0, false, "input"), output = port(page, 0, false, "output");
  await input.focus(); await page.keyboard.press("Enter"); await output.focus(); await page.keyboard.press("Space");
  await expect(editor(page).getByLabel("After which Mix or Beat?")).toHaveValue(`mix:${mixes[0]}`);
  await editor(page).getByLabel("Enable this connection").check();
  await editor(page).getByRole("button", { name: "Save connection", exact: true }).click();
  await expect(editor(page).getByRole("alert")).toContainText("repeat limit");
  await expect(editor(page).getByLabel("Repeat limit")).toBeVisible();
  await editor(page).getByLabel("Repeat limit").fill("0");
  await editor(page).getByText("Repeat and replace", { exact: true }).click();
  await editor(page).getByRole("button", { name: "Save connection", exact: true }).click();
  await expect(editor(page).getByLabel("Repeat limit")).toBeVisible();
  await expect(editor(page).getByLabel("Repeat limit")).toBeFocused();
  await editor(page).getByLabel("Repeat limit").fill("2");
  await editor(page).getByRole("button", { name: "Save connection", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Configuration saved" })).toBeVisible();
});

test("invalid drops, Escape, pointer cancellation, and view changes leave no draft", async ({ page }) => {
  const source = port(page, 0, false, "output"), a = await center(source), b = await center(port(page, 1, false, "output"));
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
  await expect(page.getByRole("heading", { name: "Connect what happens next" })).toHaveCount(0);
  await source.click(); await page.keyboard.press("Escape"); await expect(source).toHaveAttribute("aria-pressed", "false");
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(a.x + 50, a.y + 20);
  await page.keyboard.press("Escape"); await page.mouse.up(); await expect(page.locator("path[data-ready]")).toHaveCount(0);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(a.x + 50, a.y + 20);
  await source.dispatchEvent("pointercancel", { pointerId: 1, pointerType: "mouse", isPrimary: true }); await page.mouse.up();
  await expect(source).toHaveAttribute("aria-pressed", "false");
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(10, 10); await page.mouse.up();
  await expect(page.getByRole("heading", { name: "Connect what happens next" })).toHaveCount(0);
  await source.click(); await page.getByRole("button", { name: "Map options", exact: true }).click(); await page.getByRole("button", { name: "Show list", exact: true }).click(); await page.getByRole("button", { name: "Show diagram", exact: true }).click();
  await page.getByRole("button", { name: "Reset zoom to 100%", exact: true }).click(); await expect(source).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Progress", exact: true }).click(); await expect(page.locator("[data-workflow-port]")).toHaveCount(0);
});

test("zoomed dragging follows screen coordinates and touch selection works after scrolling", async ({ page, context }) => {
  await page.getByRole("button", { name: "Zoom out", exact: true }).click(); await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expand(page); await drag(page, port(page, 0, true, "output"), port(page, 1, true, "input"));
  await editor(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Reset zoom to 100%", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  // Real touch events, including the click synthesized after a drag.
  const cdp = await context.newCDPSession(page);
  const touch = async (locator: Locator) => {
    await locator.scrollIntoViewIfNeeded(); const point = await center(locator);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...point, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  await touch(port(page, 0, true, "output")); await touch(port(page, 1, false, "input"));
  await expect(editor(page).getByRole("combobox", { name: /^Continue to/ })).toHaveValue(`mix:${mixes[1]}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await editor(page).getByRole("button", { name: "Cancel", exact: true }).click();
  // closeEditor refocuses and scrolls the origin port in the next animation frame; wait for that so it cannot move the ports after they are measured.
  await expect(port(page, 0, true, "output")).toBeFocused();
  await canvas(page).evaluate(element => { element.scrollTop = 0; element.scrollLeft = 40; element.scrollIntoView({ block: "center", behavior: "instant" }); });
  const from = await center(port(page, 1, false, "output")), to = await center(port(page, 1, true, "input"));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...from, id: 2 }] });
  for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + (to.x - from.x) * i / 10, y: from.y + (to.y - from.y) * i / 10, id: 2 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(editor(page).getByRole("combobox", { name: /^Continue to/ })).toHaveValue(`beat:${beats[1]}`);
  await cdp.detach();
});

test("dragging near the canvas edge pans to a destination outside the initial view", async ({ page }) => {
  await expand(page);
  await canvas(page).evaluate(element => { element.style.height = "300px"; element.style.minHeight = "300px"; element.scrollTop = 0; });
  const source = port(page, 1, false, "output"), destination = port(page, 0, true, "input");
  const start = await center(source), bounds = await canvas(page).boundingBox();
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + 35, bounds!.y + bounds!.height - 8, { steps: 10 });
  await expect.poll(async () => { const point = await center(destination); return point.y > bounds!.y + 32 && point.y < bounds!.y + bounds!.height - 32; }).toBe(true);
  await page.mouse.move(start.x + 35, bounds!.y + bounds!.height / 2);
  const end = await center(destination); await page.mouse.move(end.x, end.y, { steps: 6 }); await page.mouse.up();
  await expect(editor(page).getByRole("combobox", { name: /^Continue to/ })).toHaveValue(`beat:${beats[0]}`);
});

test("handles follow themes, keyboard focus, narrow layouts, and read-only state", async ({ page }) => {
  await expand(page);
  for (const width of [1440, 834, 390, 320]) for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    await canvas(page).evaluate(element => { element.scrollTop = 0; element.scrollLeft = 0; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const analysis = await axeInPage(page).include('[aria-label="Mix and Beat journey"]').withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(analysis.violations).toEqual([]);
    if (process.env.CONNECTION_ARTIFACTS) await page.screenshot({ path: `${process.env.CONNECTION_ARTIFACTS}/journey-${width}-${theme}.png`, fullPage: true });
  }
  await page.route("**/api/mix-workflow?*", async route => { const response = await route.fetch(); const json = await response.json(); await route.fulfill({ response, json: { ...json, canEdit: false } }); });
  await page.reload({ waitUntil: "networkidle" }); await page.getByRole("button", { name: "Reset zoom to 100%", exact: true }).click();
  await expect(page.locator("[data-workflow-port]")).toHaveCount(0);
});

test("advanced paths retain outcomes, waits and join settings behind the compact editor", async ({ page, context }) => {
  await port(page, 0, false, "output").click(); await port(page, 1, false, "input").click();
  const form = editor(page);
  await expect(form.getByLabel("Wait before continuing", { exact: true })).not.toBeVisible();
  await form.getByRole("button", { name: "Add a path", exact: true }).click();
  await form.getByLabel("How should the paths work?").selectOption("CHOICE");
  const paths = form.locator("fieldset:has(> legend)");
  const first = paths.nth(0), second = paths.nth(1);
  await first.getByLabel("Continue when").selectOption("OUTCOME"); await first.getByLabel("Recorded outcome").fill("Ready");
  await second.getByLabel("Continue when").selectOption("TIMEOUT"); await second.getByLabel("Wait for an outcome unit", { exact: true }).selectOption({ label: "hours" }); await second.getByLabel("Wait for an outcome", { exact: true }).fill("1");
  await form.getByText("Bring paths back together", { exact: true }).click(); await form.getByLabel("Continue after these paths join").check();
  await form.getByLabel("Then continue to").selectOption(`mix:${mixes[1]}`);
  await form.getByRole("button", { name: "Save connection", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Configuration saved" })).toBeVisible();
  const graph = await (await context.request.get("/api/mix-workflow")).json();
  expect(graph.configuration.rules[0]).toMatchObject({ enabled: false, mode: "CHOICE", join: { mode: "ALL", target: { mixId: mixes[1] } } });
  expect(graph.configuration.rules[0].routes).toEqual(expect.arrayContaining([expect.objectContaining({ when: "OUTCOME", outcome: "Ready" }), expect.objectContaining({ when: "TIMEOUT", delayMinutes: 60 })]));
});

async function seedRemovablePaths(page: Page, branches = false, join = false) {
  const rule = { id: randomUUID(), name: "Connection to review", enabled: false, mode: "PARALLEL" as const, source: { mixId: mixes[0], stepId: null }, join: join ? { mode: "ALL" as const, target: { mixId: mixes[1], stepId: beats[1] }, cancelRemaining: false } : null, routes: [{ id: randomUUID(), label: "First path", when: "FINISHED" as const, outcome: "", delayMinutes: 0, target: { mixId: mixes[1], stepId: null as string | null }, maxVisits: null, replace: false }] };
  if (branches) rule.routes.push({ ...rule.routes[0], id: randomUUID(), label: "Second path", target: { mixId: mixes[1], stepId: beats[1] } });
  const saved = await page.request.post("/api/mix-workflow", { headers: { Origin: process.env.APP_URL! }, data: { action: "save-rule", rule, expectedRule: null } }); expect(saved.ok()).toBe(true);
  await page.reload({ waitUntil: "networkidle" }); await page.getByRole("button", { name: "Reset zoom to 100%", exact: true }).click();
  return rule;
}
const pathActions = (page: Page) => page.getByRole("region", { name: "Selected path", exact: true });
async function selectSavedPath(page: Page, id: string) { await page.locator(`[data-workflow-path="${id}"]`).focus(); await page.keyboard.press("Enter"); await expect(pathActions(page)).toBeVisible(); }
async function confirmPathDeletion(page: Page) { await pathActions(page).getByRole("button", { name: "Delete path", exact: true }).click(); await page.getByRole("dialog").getByRole("button", { name: "Delete path", exact: true }).click(); }

test("select a canvas line, cancel deletion, then delete and reload without removing its Mixes", async ({ page }) => {
  const rule = await seedRemovablePaths(page);
  const line = page.locator(`[data-workflow-path="${rule.routes[0].id}"] path`).last();
  const point = await line.evaluate(element => { const path = element as SVGPathElement, point = path.getPointAtLength(path.getTotalLength() / 2), matrix = path.getScreenCTM()!; return { x: matrix.a * point.x + matrix.c * point.y + matrix.e, y: matrix.b * point.x + matrix.d * point.y + matrix.f }; });
  await page.mouse.click(point.x, point.y); await expect(pathActions(page)).toContainText("First path");
  await expect(page.locator(`[data-workflow-path="${rule.routes[0].id}"]`)).toHaveAttribute("data-selected", "true");
  await pathActions(page).getByRole("button", { name: "Delete path", exact: true }).click(); const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused(); await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await (await page.request.get("/api/mix-workflow")).json()).configuration.rules).toHaveLength(1);
  await confirmPathDeletion(page); await expect(page.getByRole("status").filter({ hasText: "Path deleted" })).toBeVisible(); await expect(canvas(page)).toBeFocused();
  await expect(page.locator("[data-workflow-path]")).toHaveCount(0); await expect(page.locator("[data-workflow-node]")).toHaveCount(2);
  await page.reload({ waitUntil: "networkidle" }); await expect(page.locator("[data-workflow-path]")).toHaveCount(0);
});

test("delete an individual branch and a shared join while preserving other paths", async ({ page }) => {
  const rule = await seedRemovablePaths(page, true, true);
  await selectSavedPath(page, rule.routes[0].id); await confirmPathDeletion(page);
  await expect(page.locator(`[data-workflow-path="${rule.routes[0].id}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-workflow-path="${rule.routes[1].id}"]`)).toHaveCount(1);
  const joinedId = `${rule.id}:join:${rule.routes[1].id}`; await selectSavedPath(page, joinedId);
  await pathActions(page).getByRole("button", { name: "Delete path", exact: true }).click(); await expect(page.getByRole("dialog")).toContainText("every branch");
  await page.getByRole("dialog").getByRole("button", { name: "Delete path", exact: true }).click(); await expect(page.locator(`[data-workflow-path="${joinedId}"]`)).toHaveCount(0);
  const saved = await (await page.request.get("/api/mix-workflow")).json(); expect(saved.configuration.rules[0].routes).toEqual([rule.routes[1]]); expect(saved.configuration.rules[0].join).toBeNull(); expect(saved.configuration.gatedStepIds).toContain(beats[1]);
});

test("path deletion survives an unconfirmed response and failed refresh without duplicates", async ({ page }) => {
  const rule = await seedRemovablePaths(page); await selectSavedPath(page, rule.routes[0].id);
  let lost = false; await page.route("**/api/mix-workflow", async route => { if (route.request().method() === "POST" && route.request().postDataJSON().action === "remove-path" && !lost) { lost = true; await route.fetch(); await route.abort("failed"); } else await route.continue(); });
  await confirmPathDeletion(page); await expect(page.getByRole("dialog").getByRole("alert")).toContainText("confirm the deletion");
  const committed = await (await page.request.get("/api/mix-workflow")).json(); expect(committed.configuration.rules).toEqual([]);
  await page.route("**/api/mix-workflow?*", route => route.fulfill({ status: 503, json: { error: "Synthetic read failure" } }));
  await page.getByRole("dialog").getByRole("button", { name: "Delete path", exact: true }).click();
  await expect(page.getByRole("region", { name: "Mix and Beat journey", exact: true }).getByRole("alert")).toContainText("Path deleted");
  expect((await (await page.request.get("/api/mix-workflow")).json()).revision).toBe(committed.revision);
  await page.unroute("**/api/mix-workflow?*"); await page.unroute("**/api/mix-workflow"); await page.getByRole("button", { name: "Retry", exact: true }).click(); await expect(page.locator("[data-workflow-path]")).toHaveCount(0);
});

test("a changed path needs review before deletion and retains unrelated configuration", async ({ page }) => {
  const rule = await seedRemovablePaths(page); await selectSavedPath(page, rule.routes[0].id);
  const changed = { ...rule, routes: [{ ...rule.routes[0], label: "Updated destination path" }] };
  expect((await page.request.post("/api/mix-workflow", { headers: { Origin: process.env.APP_URL! }, data: { action: "save-rule", rule: changed, expectedRule: rule } })).ok()).toBe(true);
  await confirmPathDeletion(page); await expect(page.getByRole("dialog").getByRole("alert")).toContainText("changed in another window");
  await page.getByRole("dialog").getByRole("button", { name: "Review updated path", exact: true }).click(); await expect(pathActions(page)).toContainText("Updated destination path");
  const current = await (await page.request.get("/api/mix-workflow")).json();
  expect((await page.request.post("/api/mix-workflow", { headers: { Origin: process.env.APP_URL! }, data: { action: "configure", expectedRevision: current.revision, configuration: { ...current.configuration, intentionalEnds: [`mix:${mixes[1]}`] } } })).ok()).toBe(true);
  await confirmPathDeletion(page); await expect(page.locator("[data-workflow-path]")).toHaveCount(0);
  expect((await (await page.request.get("/api/mix-workflow")).json()).configuration.intentionalEnds).toEqual([`mix:${mixes[1]}`]);
});

test("path actions work in both themes, narrow layouts and read-only maps", async ({ page }) => {
  const rule = await seedRemovablePaths(page);
  for (const width of [320, 834, 1440]) for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width, height: 1000 }); await page.evaluate(value => document.documentElement.dataset.theme = value, theme); await page.getByRole("button", { name: "Fit map", exact: true }).click();
    await selectSavedPath(page, rule.routes[0].id); await expect(pathActions(page).getByRole("button", { name: "Edit path", exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await pathActions(page).getByRole("button", { name: "Delete path", exact: true }).click();
    const scan = await axeInPage(page).include(".confirm-dialog[open]").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze(); expect(scan.violations).toEqual([]);
    if (process.env.CONNECTION_ARTIFACTS) await page.screenshot({ path: `${process.env.CONNECTION_ARTIFACTS}/delete-path-${width}-${theme}.png` });
    await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
    if (process.env.CONNECTION_ARTIFACTS) await page.screenshot({ path: `${process.env.CONNECTION_ARTIFACTS}/selected-path-${width}-${theme}.png` });
    await pathActions(page).getByRole("button", { name: "Deselect path", exact: true }).click();
  }
  await page.route("**/api/mix-workflow?*", async route => { const response = await route.fetch(); await route.fulfill({ response, json: { ...await response.json(), canEdit: false } }); });
  await page.reload({ waitUntil: "networkidle" }); await selectSavedPath(page, rule.routes[0].id); await expect(pathActions(page).getByRole("button", { name: "Delete path", exact: true })).toHaveCount(0);
});
