import { createHash, randomBytes, randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { prisma } from "../src/lib/prisma";
import { logicalDateInTimezone, zonedDateTimeToUtc } from "../src/lib/jump-schedule";

const enabled = process.env.VOICE_E2E === "1" && /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
test.skip(!enabled, "Requires VOICE_E2E=1 and a disposable local database.");
test.use({ trace: "off", screenshot: "off", video: "off", actionTimeout: 15_000 });
type RecognitionFixture = { onresult: ((event: { results: { transcript: string }[][] }) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null; late: (() => void) | null };
declare global { interface Window { jitmSpeechFixture: { instances: RecognitionFixture[]; aborts: number; starts: number; stops: number; failStart: boolean; localVoice: boolean; spoken: string[]; canceled: number; voicesChanged: () => void } } }
const userIds: string[] = [], workspaceIds: string[] = [];
async function fixture() {
  const id = `voice-${randomUUID()}`; userIds.push(id);
  const user = await prisma.user.create({ data: { id, email: `${id}@example.test`, name: "Voice fixture", emailVerifiedAt: new Date() } });
  const workspace = await prisma.workspace.create({ data: { ownerId: user.id, slug: id, name: "Voice fixture", members: { create: { userId: user.id, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } }); workspaceIds.push(workspace.id);
  await prisma.userPreference.create({ data: { userId: user.id, timezone: "America/Los_Angeles" } });
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, workspace, token };
}
async function mockSpeech(page: Page, supported = true) {
  await page.addInitScript(supported => {
    const state = window.jitmSpeechFixture = { instances: [] as RecognitionFixture[], aborts: 0, starts: 0, stops: 0, failStart: false, localVoice: false, spoken: [] as string[], canceled: 0, voicesChanged: () => {} };
    class Recognition {
      onresult: RecognitionFixture["onresult"] = null; onerror: RecognitionFixture["onerror"] = null; onend: RecognitionFixture["onend"] = null; late = null;
      constructor() { state.instances.push(this); }
      start() { state.starts++; if (state.failStart) throw new Error("Microphone unavailable"); }
      stop() { state.stops++; this.onend?.(); }
      abort() { state.aborts++; }
    }
    Object.defineProperty(window, "SpeechRecognition", { value: supported ? Recognition : undefined, configurable: true });
    Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true });
    const synthesis = new EventTarget();
    Object.assign(synthesis, { getVoices: () => [{ localService: state.localVoice, lang: "en-US", name: "Fixture voice" }], speak: (utterance: { text: string }) => state.spoken.push(utterance.text), cancel: () => { state.canceled++; } });
    state.voicesChanged = () => synthesis.dispatchEvent(new Event("voiceschanged"));
    Object.defineProperty(window, "speechSynthesis", { value: synthesis, configurable: true });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: class { constructor(public text: string) {} }, configurable: true });
  }, supported);
}
test.afterEach(async () => {
  await prisma.contactActivity.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await prisma.userPreference.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  userIds.length = 0; workspaceIds.length = 0;
});

test("dictated text stays editable and transfers privately until the user explicitly saves a contact", async ({ page, context }, info) => {
  const data = await fixture(); await mockSpeech(page);
  await context.addCookies([{ name: "jitm_session", value: data.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  await page.goto("/jumps"); await page.getByRole("button", { name: "Quick Add", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Quick Add" });
  await dialog.getByLabel("What do you want to remember?").fill("Typed note.");
  await expect(dialog.getByText("Your browser’s speech service may process audio. Review the text before saving.")).toBeVisible();
  await dialog.getByRole("button", { name: "Speak", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Stop dictation" })).toBeVisible();
  await page.evaluate(() => window.jitmSpeechFixture.instances.at(-1)!.onresult?.({ results: [[{ transcript: "Add MistakenName sam@example.test about a private estimate" }]] }));
  const input = dialog.getByLabel("What do you want to remember?");
  await expect(input).toHaveValue("Typed note.\nAdd MistakenName sam@example.test about a private estimate");
  await input.fill("Add Sam sam@example.test about a private estimate");
  await dialog.getByRole("button", { name: "Continue with Contact" }).click();
  await expect(page).toHaveURL(/\/contacts\/new\?draft=[a-f0-9-]{36}$/);
  expect(page.url()).not.toMatch(/private|estimate|sam|example/i);
  await expect(page.getByLabel("First name")).toHaveValue("Sam");
  await expect(page.locator('input[name="emailValue"]').first()).toHaveValue("sam@example.test");
  await expect(page.locator('textarea[name="publicNotes"]')).toHaveValue("Add Sam sam@example.test about a private estimate");
  expect(await prisma.contact.count({ where: { workspaceId: data.workspace.id } })).toBe(0);
  expect(await page.evaluate(() => Object.keys(sessionStorage).some(key => key.endsWith(":capture-draft")))).toBe(false);
  const draftPath = new URL(page.url()).pathname + new URL(page.url()).search;
  await page.getByRole("button", { name: "Save contact", exact: true }).click();
  await expect(page).toHaveURL(/\/contacts\/[a-z0-9]{20,}(?:\?|$)/);
  const saved = await prisma.contact.findFirstOrThrow({ where: { workspaceId: data.workspace.id }, include: { emails: true } });
  expect(saved).toMatchObject({ firstName: "Sam", publicNotes: "Add Sam sam@example.test about a private estimate" });
  expect(saved.emails[0].email).toBe("sam@example.test");
  await page.goto(draftPath);
  await expect(page.getByText(/temporary draft is no longer available/)).toBeVisible();
  await expect(page.getByLabel("First name")).toHaveValue("");
});

test("dictation stops on request, handles microphone errors and ignores late results after dialog closure", async ({ page, context }, info) => {
  const data = await fixture(); await mockSpeech(page);
  await context.addCookies([{ name: "jitm_session", value: data.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  await page.goto("/jumps"); await page.getByRole("button", { name: "Quick Add", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Quick Add" }), speak = dialog.getByRole("button", { name: "Speak", exact: true });
  await speak.click(); await dialog.getByRole("button", { name: "Stop dictation" }).click();
  expect(await page.evaluate(() => window.jitmSpeechFixture.stops)).toBe(1);
  await speak.click();
  await page.evaluate(() => window.jitmSpeechFixture.instances.at(-1)!.onerror?.({ error: "not-allowed" }));
  await expect(dialog.getByRole("alert")).toContainText("Microphone access was not granted");
  await page.evaluate(() => { window.jitmSpeechFixture.failStart = true; }); await speak.click();
  await expect(dialog.getByRole("alert")).toContainText("could not start");
  await page.evaluate(() => { window.jitmSpeechFixture.failStart = false; }); await speak.click();
  await page.evaluate(() => { const last = window.jitmSpeechFixture.instances.at(-1)!; const callback = last.onresult; last.late = () => callback?.({ results: [[{ transcript: "Late private capture" }]] }); });
  await dialog.getByRole("button", { name: "Close Quick Add" }).click();
  await page.evaluate(() => window.jitmSpeechFixture.instances.at(-1)!.late?.());
  await page.getByRole("button", { name: "Quick Add", exact: true }).first().click();
  await expect(dialog.getByLabel("What do you want to remember?")).toHaveValue("");
  await expect(speak).toBeVisible();
  await speak.click();
  const aborted = await page.evaluate(() => window.jitmSpeechFixture.aborts);
  await page.evaluate(() => { document.documentElement.dataset.browserLocked = "true"; });
  await expect.poll(() => page.evaluate(() => window.jitmSpeechFixture.aborts)).toBe(aborted + 1);
  await page.evaluate(() => { delete document.documentElement.dataset.browserLocked; });
  await expect(speak).toBeVisible();
  await page.clock.install(); await speak.click(); await page.clock.fastForward(46_000);
  await expect(dialog.getByRole("status")).toContainText("stopped after 45 seconds");
  await expect(speak).toBeVisible();
});

test("typing works without speech support and storage failure preserves the draft", async ({ page, context }, info) => {
  const data = await fixture(); await mockSpeech(page, false);
  await context.addCookies([{ name: "jitm_session", value: data.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  await page.goto("/jumps"); await page.getByRole("button", { name: "Quick Add", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Quick Add" });
  await expect(dialog.getByRole("button", { name: "Speak", exact: true })).toHaveCount(0);
  await expect(dialog.getByText("Type here, or use your keyboard’s dictation.")).toBeVisible();
  await dialog.getByLabel("What do you want to remember?").fill("Call Sam tomorrow about the estimate");
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error("Blocked storage"); }; });
  await dialog.getByRole("button", { name: "Continue with Contact" }).click();
  await expect(dialog.getByRole("alert")).toContainText("could not keep this temporary draft");
  await expect(dialog.getByLabel("What do you want to remember?")).toHaveValue("Call Sam tomorrow about the estimate");
  expect(page.url()).toMatch(/\/jumps$/);
});

test("Today speaks only on request with a local voice and stops when its summary closes", async ({ page, context }, info) => {
  const data = await fixture(); await mockSpeech(page);
  await context.addCookies([{ name: "jitm_session", value: data.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  await page.goto("/jumps"); await page.getByText("Today at a glance", { exact: true }).click();
  const summary = page.locator("details.today-briefing");
  await expect(summary).toContainText("0 follow-ups are due today, with none overdue");
  await expect(summary.getByRole("button", { name: "Listen to summary" })).toHaveCount(0);
  expect(await page.evaluate(() => window.jitmSpeechFixture.spoken.length)).toBe(0);
  await page.evaluate(() => { window.jitmSpeechFixture.localVoice = true; window.jitmSpeechFixture.voicesChanged(); });
  await summary.getByRole("button", { name: "Listen to summary" }).click();
  expect(await page.evaluate(() => window.jitmSpeechFixture.spoken[0])).toContain("0 were marked done today");
  await summary.getByRole("button", { name: "Stop reading" }).click();
  await summary.getByRole("button", { name: "Listen to summary" }).click();
  await page.getByText("Today at a glance", { exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.jitmSpeechFixture.canceled)).toBe(2);
  await page.getByText("Today at a glance", { exact: true }).click();
  for (const colorScheme of ["light", "dark"] as const) for (const width of [320, 1440]) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" }); await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  }
  await page.goto("/jumps?range=week&status=pending");
  await expect(page.locator("details.today-briefing")).toHaveCount(0);
});

test("voice capture and contact drafts fit phone and desktop layouts in both themes", async ({ page, context }, info) => {
  const data = await fixture(); await mockSpeech(page);
  await context.addCookies([{ name: "jitm_session", value: data.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  await page.goto("/jumps"); await page.getByRole("button", { name: "Quick Add", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Quick Add" });
  await dialog.getByLabel("What do you want to remember?").fill("Add Sam sam@example.test about an estimate");
  for (const colorScheme of ["light", "dark"] as const) for (const width of [320, 1440]) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" }); await page.setViewportSize({ width, height: 900 });
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  }
  await dialog.getByRole("button", { name: "Continue with Contact" }).click();
  await expect(page.getByLabel("First name")).toHaveValue("Sam");
  for (const colorScheme of ["light", "dark"] as const) for (const width of [320, 1440]) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" }); await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  }
});

test("briefing uses this workspace and timezone, excludes skipped work, and warns when preparation is incomplete", async ({ page, context }, info) => {
  const data = await fixture(), other = await fixture(); await mockSpeech(page);
  const midnight = zonedDateTimeToUtc(logicalDateInTimezone(new Date(), "America/Los_Angeles"), 0, "America/Los_Angeles");
  for (const current of [data, other]) {
    const workspaceId = current.workspace.id;
    const contact = await prisma.contact.create({ data: { workspaceId, displayName: current === data ? "Summary fixture" : "Other workspace private contact" } });
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Summary step", channel: "EMAIL" } });
    const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Fixture message" } });
    const mix = await prisma.mix.create({ data: { workspaceId, name: "Summary mix", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: { stepVersionId: version.id, dayOffset: 0, sortOrder: 1 } } }, include: { steps: true } });
    await prisma.jump.createMany({ data: [
      { status: "PENDING" as const, scheduledAt: new Date(midnight.getTime() - 1), completedAt: null },
      { status: "PENDING" as const, scheduledAt: new Date(midnight.getTime() + 60_000), completedAt: null },
      { status: "DONE" as const, scheduledAt: new Date(midnight.getTime() - 1), completedAt: new Date() },
      { status: "SKIPPED" as const, scheduledAt: midnight, completedAt: new Date() }
    ].map(item => ({ ...item, workspaceId, contactId: contact.id, mixId: mix.id, mixStepId: mix.steps[0].id, stepVersionId: version.id, reason: "Summary fixture", uniquenessKey: randomUUID(), templateSnapshot: {}, renderedSnapshot: {} })) });
  }
  await context.addCookies([{ name: "jitm_session", value: data.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  await page.goto("/jumps"); await page.getByText("Today at a glance", { exact: true }).click();
  await expect(page.locator("details.today-briefing")).toContainText("1 follow-up is due today, and 1 is overdue. 1 was marked done today.");
  await expect(page.locator("body")).not.toContainText("Other workspace private contact");
  await page.getByRole("link", { name: "1 completed today", exact: true }).click();
  await expect(page.locator(".jump-task-card")).toHaveCount(1);
  await page.goto("/jumps");
  await prisma.job.create({ data: { workspaceId: data.workspace.id, task: "generate-jumps", payload: {} } });
  await page.reload(); await page.getByText("Today at a glance", { exact: true }).click();
  await expect(page.locator("details.today-briefing")).toContainText("not ready yet");
});
