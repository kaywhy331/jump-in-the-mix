import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";

const userEmail = process.env.E2E_USER_EMAIL ?? "demo@jumpinthemix.local";
const userPassword = process.env.E2E_USER_PASSWORD ?? "JumpInTheMix123!";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(userEmail);
  await page.getByLabel("Password").fill(userPassword);
  await Promise.all([page.waitForURL(/\/(jumps|onboarding)(\?|$)/), page.getByRole("button", { name: "Sign in" }).click()]);
}

async function removeMix(mixId: string) {
  const templates = await prisma.stepTemplate.findMany({ where: { versions: { some: { mixSteps: { some: { mixId } } } } }, select: { id: true } });
  await prisma.job.deleteMany({ where: { workspaceId: "demo_workspace", task: "generate-jumps", payload: { path: ["mixId"], equals: mixId } } });
  await prisma.mix.deleteMany({ where: { id: mixId, workspaceId: "demo_workspace" } });
  if (templates.length) await prisma.stepTemplate.deleteMany({ where: { id: { in: templates.map((item) => item.id) }, workspaceId: "demo_workspace" } });
}

test("a plan can be written inline without creating a prerequisite message template", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Inline plan authoring is exercised once.");
  const name = `Inline plan ${Date.now()} ${Math.random().toString(36).slice(2)}`;
  let mixId: string | null = null;
  try {
    await signIn(page);
    await page.goto("/mixes/new?custom=1");
    await page.getByLabel("Plan name").fill(name);
    await page.getByLabel("When should it start?").selectOption("MANUAL_START");
    const dayOffset = page.getByLabel("Days later");
    await expect(dayOffset).toHaveAttribute("min", "0");
    await dayOffset.fill("0");
    await page.getByLabel("How?").selectOption("EMAIL");
    await page.getByLabel("Subject").fill("A renewal question for {{First Name}}");
    await page.getByLabel("Message").fill("Hi {{First Name}}, is there anything you would like to review before renewal?");
    await page.getByRole("button", { name: "Create plan" }).click();
    await page.waitForURL(/\/mixes\/[^/]+\/edit\?created=manual/);
    const mix = await prisma.mix.findFirstOrThrow({ where: { workspaceId: "demo_workspace", name }, include: { steps: { include: { stepVersion: { include: { stepTemplate: true } } } } } });
    mixId = mix.id;
    expect(mix.status).toBe("DRAFT");
    expect(mix.steps).toHaveLength(1);
    expect(mix.steps[0]?.stepVersion.stepTemplate.isActive).toBe(false);
    await expect(page.getByText("Plan created. Future follow-ups are updating.")).toBeVisible();
  } finally {
    if (mixId) await removeMix(mixId);
  }
});

test("an approved template uses one setup screen and explicit audience", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Template setup is exercised once.");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const sharedId = `e2e-shared-template-${suffix}`;
  const title = `Focused Template ${suffix}`;
  const mixName = `Used Template ${suffix}`;
  let mixId: string | null = null;
  await prisma.sharedMix.create({
    data: {
      id: sharedId,
      title,
      description: "A focused test template that is configured in one setup screen.",
      category: "Current clients",
      industry: "Other",
      framework: "Friendly check-in",
      durationDays: 7,
      status: "APPROVED",
      steps: [{ name: "Check in", channel: "EMAIL", dayOffset: 0, sendTimeMinutes: 600, subject: "A quick check-in", body: "Hi {{First Name}}, how are things going?", script: null, longSms: false, includeOptOut: false }]
    }
  });
  await prisma.sharedMixMetadata.create({ data: { sharedMixId: sharedId, version: 1, triggerMode: "MANUAL_START", publishedAt: new Date() } });
  try {
    await signIn(page);
    await page.goto(`/templates/${sharedId}/use`);
    await expect(page.getByRole("heading", { name: `Use ${title}` })).toBeVisible();
    await page.getByLabel("Plan name").fill(mixName);
    await page.getByLabel("Everyone").check();
    await page.getByRole("button", { name: "Create plan" }).click();
    await page.waitForURL(/\/mixes\/[^/]+\/edit\?imported=1/);
    const mix = await prisma.mix.findFirstOrThrow({ where: { workspaceId: "demo_workspace", name: mixName } });
    mixId = mix.id;
    expect(mix.status).toBe("DRAFT");
    expect(await prisma.sharedMixImport.count({ where: { workspaceId: "demo_workspace", sharedMixId: sharedId, mixId } })).toBe(1);
  } finally {
    if (mixId) await removeMix(mixId);
    await prisma.sharedMix.deleteMany({ where: { id: sharedId } });
  }
});
