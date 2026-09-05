import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";

const userEmail = process.env.E2E_USER_EMAIL ?? "demo@jumpinthemix.local";
const userPassword = process.env.E2E_USER_PASSWORD ?? "JumpInTheMix123!";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(userEmail);
  await page.getByLabel("Password").fill(userPassword);
  await Promise.all([
    page.waitForURL(/\/(jumps|onboarding)(\?|$)/),
    page.getByRole("button", { name: "Sign in" }).click()
  ]);
}

test("follow-up outcomes complete in place and appear on the Contact timeline", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The complete workflow is exercised once.");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const contactId = `e2e-outcome-contact-${suffix}`;
  const jumpId = `e2e-outcome-jump-${suffix}`;
  const displayName = `Outcome Tester ${suffix}`;
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: "demo_workspace" } });
  const mix = await prisma.mix.findFirstOrThrow({
    where: { workspaceId: workspace.id, status: "ACTIVE", steps: { some: { isActive: true } } },
    include: {
      steps: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        take: 1,
        include: { stepVersion: { include: { stepTemplate: true } } }
      }
    }
  });
  const step = mix.steps[0];
  if (!step) throw new Error("The E2E workspace needs an active Mix step.");

  await prisma.contact.create({
    data: {
      id: contactId,
      workspaceId: workspace.id,
      firstName: "Outcome",
      lastName: `Tester ${suffix}`,
      displayName,
      phones: { create: { phone: "+14155550123", normalized: "14155550123", isPrimary: true } }
    }
  });
  await prisma.jump.create({
    data: {
      id: jumpId,
      workspaceId: workspace.id,
      contactId,
      mixId: mix.id,
      mixStepId: step.id,
      stepVersionId: step.stepVersionId,
      scheduledAt: new Date(),
      status: "PENDING",
      reason: "Outcome workflow test",
      templateSnapshot: { channel: step.stepVersion.stepTemplate.channel, body: "Prepared E2E follow-up" },
      renderedSnapshot: { body: "Prepared E2E follow-up" },
      uniquenessKey: `e2e:outcome:${suffix}`
    }
  });

  try {
    await signIn(page);
    await page.goto("/jumps?range=all&status=pending");
    const workflow = page.locator(`[data-jump-workflow="${jumpId}"]:visible`);
    await expect(workflow).toBeVisible();
    await workflow.getByRole("button", { name: "Done", exact: true }).click();
    await expect(workflow.getByText("Follow-up completed")).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => (await prisma.jump.findUniqueOrThrow({ where: { id: jumpId } })).status).toBe("DONE");
    await expect.poll(async () => prisma.contactActivity.count({ where: { jumpId, outcome: "COMPLETED" } })).toBe(1);

    await workflow.getByRole("button", { name: "Undo" }).click();
    await expect(workflow.getByRole("button", { name: "Done", exact: true })).toBeVisible();
    await expect.poll(async () => (await prisma.jump.findUniqueOrThrow({ where: { id: jumpId } })).status).toBe("PENDING");

    await page.evaluate(({ jumpId: id, contactName }) => {
      const detail = { jumpId: id, contactName, channel: "PHONE_CALL", openedAt: Date.now() };
      sessionStorage.setItem("jitm:opened-jump", JSON.stringify(detail));
      window.dispatchEvent(new CustomEvent("jitm:jump-opened", { detail }));
    }, { jumpId, contactName: displayName });
    await expect(page.getByText(`How did the follow-up with ${displayName} go?`)).toBeVisible();
    const tray = page.getByLabel(`Finish follow-up with ${displayName}`).filter({ visible: true });
    await tray.getByText("Add a note, detailed outcome, or next follow-up", { exact: true }).click();
    const outcomeForm = tray.locator("form");
    await outcomeForm.getByRole("combobox").first().selectOption("NO_ANSWER");
    await outcomeForm.locator("textarea").fill("No answer; try again tomorrow morning.");
    const nextDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await outcomeForm.locator('input[type="date"]').fill(nextDate);
    await outcomeForm.getByRole("button", { name: "Save outcome" }).click();
    await expect(workflow.getByText("Follow-up completed")).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => prisma.contactActivity.count({ where: { jumpId, outcome: "NO_ANSWER" } })).toBe(1);
    await expect.poll(async () => prisma.jumpDate.count({ where: { contactId, isActive: true, label: { contains: "Next commitment" } } })).toBe(1);

    await page.goto(`/contacts/${contactId}`);
    const timeline = page.locator(".contact-timeline-card");
    await expect(timeline.getByText("No answer; try again tomorrow morning.", { exact: true })).toBeVisible();
    await timeline.getByLabel("Add a note").fill("Met through the regional business association.");
    await timeline.getByRole("button", { name: "Add update" }).click();
    await expect(timeline.getByText("Met through the regional business association.")).toBeVisible();
    await expect.poll(async () => prisma.contactActivity.count({ where: { contactId, kind: "CUSTOMER_NOTE" } })).toBe(1);
  } finally {
    await prisma.contact.deleteMany({ where: { id: contactId, workspaceId: workspace.id } });
  }
});
