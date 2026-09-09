import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { prisma } from "../src/lib/prisma";
import { RELATIONSHIP_MIXES } from "../src/lib/relationship-mix-library";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.E2E_USER_EMAIL ?? "demo@jumpinthemix.local");
  await page.getByLabel("Password").fill(process.env.E2E_USER_PASSWORD ?? "JumpInTheMix123!");
  await Promise.all([page.waitForURL(/\/(jumps|onboarding)(\?|$)/), page.getByRole("button", { name: "Sign in", exact: true }).click()]);
}

test("relationship mixes can be previewed, remixed, fine-tuned, and started without changing the original", async ({ page }, testInfo) => {
  const original = await prisma.sharedMix.findUniqueOrThrow({ where: { id: RELATIONSHIP_MIXES[0].id } });
  const name = `My first note ${testInfo.project.name} ${Date.now()}`;
  let mixId: string | undefined;
  try {
    await signIn(page);
    await page.goto("/templates?framework=Relationships");
    for (const mix of RELATIONSHIP_MIXES) await expect(page.getByRole("heading", { name: mix.title, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Preview the rhythm: The First Note", exact: true }).click();
    const preview = page.getByRole("dialog", { name: "The First Note", exact: true });
    await expect(preview).toContainText("Beat 1");
    await expect(preview).toContainText("Cue · starts");
    await preview.getByRole("link", { name: "Remix it", exact: true }).click();
    await page.getByLabel("Mix name", { exact: true }).fill(name);
    await page.getByLabel("Everyone", { exact: false }).check();
    await page.getByRole("button", { name: "Create my remix", exact: true }).click();
    await page.waitForURL(/\/mixes\/[^/]+\/edit\?imported=1/);
    mixId = page.url().match(/\/mixes\/([^/]+)/)![1];
    const editor = page.locator(".mix-editor-form");
    const beats = editor.locator("fieldset.mix-editor-jump");
    await expect(beats).toHaveCount(2);
    await beats.first().getByLabel("Message", { exact: false }).fill("Hi {{First Name}}, I’d love to catch up. {{SMS Signature}}");
    await beats.nth(1).getByLabel("Tempo · days after start", { exact: true }).fill("5");
    await editor.getByRole("button", { name: "Add a beat", exact: true }).click();
    await expect(beats).toHaveCount(3);
    await beats.nth(2).getByLabel("Call notes", { exact: true }).fill("• Ask what’s new.\n• Agree on a next step.");
    await beats.nth(2).getByLabel("Tempo · days after start", { exact: true }).fill("14");
    await editor.getByRole("button", { name: "Save mix", exact: true }).click();
    await page.waitForURL(/updated=manual/);
    const saved = await prisma.mix.findUniqueOrThrow({ where: { id: mixId }, include: { steps: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, include: { stepVersion: true } } } });
    expect(saved.status).toBe("DRAFT");
    expect(saved.category).toBe("Relationships");
    expect(saved.steps.map(beat => beat.dayOffset)).toEqual([0, 5, 14]);
    expect(saved.steps[0].stepVersion.body).toContain("I’d love to catch up");
    expect((await prisma.sharedMix.findUniqueOrThrow({ where: { id: original.id } })).steps).toEqual(original.steps);
    await editor.getByRole("combobox", { name: "After saving", exact: true }).selectOption("ACTIVE");
    await editor.getByRole("button", { name: "Review and start", exact: true }).click();
    const review = page.getByRole("dialog", { name: "Start this mix?", exact: true });
    await expect(review).toContainText("beats each");
    await review.getByRole("button", { name: "Start the mix", exact: true }).click();
    await page.waitForURL(/updated=manual/);
    await expect.poll(async () => (await prisma.mix.findUniqueOrThrow({ where: { id: mixId } })).status).toBe("ACTIVE");
    const contact = await prisma.contact.findFirstOrThrow({ where: { workspaceId: "demo_workspace", archivedAt: null } });
    await page.goto(`/contacts/${contact.id}`);
    await page.locator(".contact-detail-more > summary").click();
    await expect(page.getByRole("combobox", { name: "Loop · repeat this date", exact: true })).toBeVisible();
    await page.getByRole("combobox", { name: "Choose a mix", exact: true }).selectOption(mixId);
    await page.getByRole("button", { name: "Add to a mix", exact: true }).click();
    await expect(page.getByText("Mix started.", { exact: true })).toBeVisible();
  } finally {
    if (mixId) {
      const templates = await prisma.stepTemplate.findMany({ where: { workspaceId: "demo_workspace", versions: { some: { mixSteps: { some: { mixId } } } } }, select: { id: true } });
      await prisma.job.deleteMany({ where: { workspaceId: "demo_workspace", task: "generate-jumps", payload: { path: ["mixId"], equals: mixId } } });
      await prisma.mix.deleteMany({ where: { id: mixId, workspaceId: "demo_workspace" } });
      await prisma.stepTemplate.deleteMany({ where: { id: { in: templates.map(item => item.id) }, workspaceId: "demo_workspace" } });
    }
  }
});

test("musical vocabulary stays readable with familiar navigation across phone and desktop widths", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The viewport matrix runs once.");
  await signIn(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/mixes", "/mixes/new?custom=1", "/templates?framework=Relationships"]) {
      await page.goto(route);
      await expect(page.locator(".app-nav").getByRole("link", { name: "Contacts", exact: true })).toBeVisible();
      await expect(page.locator(".app-nav").getByRole("link", { name: "Mixes", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${route} at ${width}`).toBeLessThanOrEqual(1);
      if (width === 390 || width === 1440) {
        const result = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
        expect(result.violations.map(item => `${item.id}: ${item.nodes.length}`), `${route} at ${width}`).toEqual([]);
      }
      if (width <= 390) {
        const boxes = await page.locator(".app-nav .nav-link").evaluateAll(nodes => nodes.filter(n => n.checkVisibility()).map(n => { const box = n.getBoundingClientRect(); return { x: box.x, width: box.width }; }));
        expect(boxes).toHaveLength(5);
        const centers = boxes.sort((a, b) => a.x - b.x).map(box => box.x + box.width / 2);
        const spacing = centers.slice(1).map((center, index) => center - centers[index]);
        expect(Math.max(...spacing) - Math.min(...spacing)).toBeLessThanOrEqual(2);
      }
    }
  }
});
