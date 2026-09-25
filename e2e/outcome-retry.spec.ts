import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { prisma } from "../src/lib/prisma";

const userEmail = process.env.E2E_USER_EMAIL ?? "demo@jumpinthemix.local";
const userPassword = process.env.E2E_USER_PASSWORD ?? "JumpInTheMix123!";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(userEmail);
  await page.getByLabel("Password", { exact: true }).fill(userPassword);
  await Promise.all([
    page.waitForURL(/\/(jumps|onboarding)(\?|$)/),
    page.getByRole("button", { name: "Sign in" }).click()
  ]);
}

type OutcomeBody = { outcome?: string; requestId?: string; note?: string };
const bodyOf = (route: Route): OutcomeBody => JSON.parse(route.request().postData() ?? "{}") as OutcomeBody;
const outcomeRequest = (jumpId: string) => `**/api/jumps/${jumpId}/outcome`;
const isOutcomePost = (jumpId: string) => (response: { url(): string; request(): { method(): string } }) => response.url().includes(`/api/jumps/${jumpId}/outcome`) && response.request().method() === "POST";

/** The server commits; only its answer is lost, as on a weak signal. Returns what the server said. */
async function loseAnswer(route: Route, postData?: string): Promise<number> {
  const response = await route.fetch(postData ? { postData } : {});
  const status = response.status();
  await route.abort("failed");
  return status;
}

async function markDone(workflow: Locator) {
  await workflow.getByRole("button", { name: /Mark (done|sent) for/ }).click();
  // Before the journey check has answered, the button opens its outcome panel first; saving from there is the same request.
  const panel = workflow.getByRole("group", { name: "Record journey outcome" });
  if (await panel.isVisible()) {
    const save = panel.getByRole("button", { name: "Save outcome", exact: true });
    await expect(save).toBeEnabled();
    await save.click();
  }
}

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const people = {
  lostAnswer: { contactId: `e2e-retry-lost-${suffix}`, jumpId: `e2e-retry-lost-jump-${suffix}`, name: `Retry Lost ${suffix}` },
  newId: { contactId: `e2e-retry-newid-${suffix}`, jumpId: `e2e-retry-newid-jump-${suffix}`, name: `Retry Newid ${suffix}` },
  trayNote: { contactId: `e2e-retry-tray-${suffix}`, jumpId: `e2e-retry-tray-jump-${suffix}`, name: `Retry Tray ${suffix}` }
};

test.describe("Today outcome retries", () => {
  test.beforeAll(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "The retry workflow is exercised once.");
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: "demo_workspace" } });
    const mix = await prisma.mix.findFirstOrThrow({
      where: { workspaceId: workspace.id, status: "ACTIVE", steps: { some: { isActive: true } } },
      include: { steps: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, take: 1, include: { stepVersion: { include: { stepTemplate: true } } } } }
    });
    const step = mix.steps[0];
    if (!step) throw new Error("The E2E workspace needs an active Mix step.");
    let phone = 14155550130;
    for (const person of Object.values(people)) {
      const [firstName, ...rest] = person.name.split(" ");
      await prisma.contact.create({
        data: { id: person.contactId, workspaceId: workspace.id, firstName, lastName: rest.join(" "), displayName: person.name, phones: { create: { phone: `+${phone}`, normalized: String(phone), isPrimary: true } } }
      });
      phone += 1;
      await prisma.jump.create({
        data: {
          id: person.jumpId, workspaceId: workspace.id, contactId: person.contactId, mixId: mix.id, mixStepId: step.id, stepVersionId: step.stepVersionId,
          scheduledAt: new Date(), status: "PENDING", reason: "Outcome retry test",
          templateSnapshot: { channel: step.stepVersion.stepTemplate.channel, body: "Prepared E2E follow-up" }, renderedSnapshot: { body: "Prepared E2E follow-up" },
          uniquenessKey: `e2e:retry:${person.jumpId}`
        }
      });
    }
  });
  test.afterAll(async () => {
    await prisma.contact.deleteMany({ where: { id: { in: Object.values(people).map((person) => person.contactId) }, workspaceId: "demo_workspace" } });
  });
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("a lost answer is retried under the same request id and recorded once", async ({ page }) => {
    const { jumpId } = people.lostAnswer;
    const requestIds: string[] = [];
    let firstAnswer = 0;
    await page.route(outcomeRequest(jumpId), async (route) => {
      requestIds.push(bodyOf(route).requestId ?? "");
      if (requestIds.length === 1) { firstAnswer = await loseAnswer(route); return; }
      await route.continue();
    });
    await page.goto("/jumps?range=all&status=pending");
    const workflow = page.locator(`[data-jump-workflow="${jumpId}"]:visible`);
    await expect(workflow).toBeVisible();
    await workflow.getByRole("button", { name: /^Review (message|call) for/ }).click();

    await markDone(workflow);
    await expect(workflow.getByRole("alert")).toBeVisible();
    expect(firstAnswer).toBe(200);
    await expect(workflow.getByText("Follow-up completed")).toHaveCount(0);

    const replay = page.waitForResponse(isOutcomePost(jumpId));
    await markDone(workflow);
    expect(await (await replay).json()).toMatchObject({ status: "DONE", duplicate: true });
    await expect(workflow.getByText("Follow-up completed")).toBeVisible({ timeout: 30_000 });
    expect(requestIds).toHaveLength(2);
    expect(requestIds[1]).toBe(requestIds[0]);
    expect(requestIds[0].length).toBeGreaterThan(10);
    await expect.poll(() => prisma.contactActivity.count({ where: { jumpId, outcome: "COMPLETED" } })).toBe(1);
    expect((await prisma.jump.findUniqueOrThrow({ where: { id: jumpId } })).status).toBe("DONE");
  });

  test("a retry that no longer knows the first request id learns the outcome was already recorded", async ({ page }) => {
    const { jumpId } = people.newId;
    let calls = 0;
    await page.route(outcomeRequest(jumpId), async (route) => {
      calls += 1;
      // Recorded under an id this page never learns, as after a reload; then the answer is lost.
      if (calls === 1) { await loseAnswer(route, JSON.stringify({ ...bodyOf(route), requestId: randomUUID() })); return; }
      await route.continue();
    });
    await page.goto("/jumps?range=all&status=pending");
    const workflow = page.locator(`[data-jump-workflow="${jumpId}"]:visible`);
    await expect(workflow).toBeVisible();
    await workflow.getByRole("button", { name: /^Review (message|call) for/ }).click();

    await markDone(workflow);
    await expect(workflow.getByRole("alert")).toBeVisible();

    const refusal = page.waitForResponse(isOutcomePost(jumpId));
    await markDone(workflow);
    const refused = await refusal;
    expect(refused.status()).toBe(409);
    expect(await refused.json()).toEqual({ error: "This follow-up is no longer pending.", status: "DONE" });
    // The card moves on and says what happened, without calling anything "saved".
    await expect(workflow.getByText("Follow-up completed")).toBeVisible({ timeout: 30_000 });
    await expect(workflow.getByText("Already marked done.")).toBeVisible();
    await expect(workflow.getByText(/saved/i)).toHaveCount(0);
    await expect(workflow.getByRole("button", { name: "Undo" })).toBeVisible();
    expect(calls).toBe(2);
    await expect.poll(() => prisma.contactActivity.count({ where: { jumpId, outcome: "COMPLETED" } })).toBe(1);
  });

  test("the return tray says when a note typed after a lost answer was not added", async ({ page }) => {
    const { jumpId, name } = people.trayNote;
    const requestIds: string[] = [];
    await page.route(outcomeRequest(jumpId), async (route) => {
      requestIds.push(bodyOf(route).requestId ?? "");
      if (requestIds.length === 1) { await loseAnswer(route); return; }
      await route.continue();
    });
    await page.goto("/jumps?range=all&status=pending");
    const workflow = page.locator(`[data-jump-workflow="${jumpId}"]:visible`);
    await expect(workflow).toBeVisible();
    await page.evaluate(({ jumpId: id, contactName }) => {
      const scope = document.querySelector<HTMLElement>("[data-browser-scope]")!.dataset.browserScope!;
      const detail = { scope, jumpId: id, contactName, channel: "SMS", openedAt: Date.now() };
      sessionStorage.setItem(`jitm:private:${scope}:opened-jump`, JSON.stringify(detail));
      window.dispatchEvent(new CustomEvent("jitm:jump-opened", { detail }));
    }, { jumpId, contactName: name });
    const tray = page.getByLabel(`Finish follow-up with ${name}`).filter({ visible: true });
    await expect(tray.getByText(`How did the follow-up with ${name} go?`)).toBeVisible();

    // The quick outcome commits, but its answer is lost.
    await tray.getByRole("button", { name: "Sent", exact: true }).click();
    await expect(tray.getByRole("alert")).toBeVisible();
    await expect(workflow.getByText("Follow-up completed")).toHaveCount(0);

    // A note is a different payload, so it travels under its own id and meets the finished follow-up.
    await tray.getByText("Add a note or next follow-up", { exact: true }).click();
    const form = tray.locator("form");
    await form.locator("textarea").fill("They asked for the quote by Friday.");
    const refusal = page.waitForResponse(isOutcomePost(jumpId));
    await form.getByRole("button", { name: "Save outcome" }).click();
    expect((await refusal).status()).toBe(409);
    expect(requestIds).toHaveLength(2);
    expect(requestIds[1]).not.toBe(requestIds[0]);

    await expect(page.getByRole("status").filter({ hasText: "Already marked done. Your note wasn't added." })).toBeVisible();
    await expect(page.getByText(`How did the follow-up with ${name} go?`)).toHaveCount(0);
    await expect(page.getByText(`Outcome not recorded for ${name}.`)).toHaveCount(0);
    await expect(page.getByText("Your outcome is saved")).toHaveCount(0);
    await expect(workflow.getByText("Follow-up completed")).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => prisma.contactActivity.count({ where: { jumpId, kind: "JUMP_OUTCOME" } })).toBe(1);
    expect((await prisma.contactActivity.findFirstOrThrow({ where: { jumpId, kind: "JUMP_OUTCOME" } })).summary).toBeNull();
  });
});
