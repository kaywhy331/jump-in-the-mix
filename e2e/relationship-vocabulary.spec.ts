import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { prisma } from "../src/lib/prisma";
import { RELATIONSHIP_MIXES } from "../src/lib/relationship-mix-library";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_USER_EMAIL ?? "demo@jumpinthemix.local");
  await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_USER_PASSWORD ?? "JumpInTheMix123!");
  await Promise.all([page.waitForURL(/\/(jumps|onboarding)(\?|$)/), page.getByRole("button", { name: "Sign in", exact: true }).click()]);
}

test("relationship Mixes can be previewed, remixed, fine-tuned, and started without changing the original", async ({ page }, testInfo) => {
  const original = await prisma.sharedMix.findUniqueOrThrow({ where: { id: RELATIONSHIP_MIXES[0].id } });
  const name = `My first note ${testInfo.project.name} ${Date.now()}`;
  let mixId: string | undefined;
  try {
    await signIn(page);
    await page.goto("/templates?framework=Relationships");
    // The ready-made library lists every relationship Mix; choosing one previews it beside the list (the preview
    // dialog and "Remix it" were replaced by the library panes and "Use this mix" in bd125c6).
    const library = page.getByRole("navigation", { name: "Ready-made Mixes", exact: true });
    for (const mix of RELATIONSHIP_MIXES) await expect(library.getByText(mix.title, { exact: true })).toBeVisible();
    await library.locator(".mix-library-item").filter({ hasText: "The First Note" }).click();
    await expect(page).toHaveURL(new RegExp(`mix=${original.id}`));
    const preview = page.getByRole("region", { name: "Selected ready-made Mix", exact: true });
    await expect(preview.getByRole("heading", { name: "The First Note", exact: true })).toBeVisible();
    const beatPreview = preview.getByRole("region", { name: "Beat preview", exact: true });
    await expect(beatPreview.getByRole("listitem")).toHaveCount(2);
    await expect(beatPreview.getByRole("listitem").first()).toContainText("A warm hello");
    await expect(beatPreview.getByRole("listitem").first()).toContainText("Day 0");
    await expect(page.locator('aside[aria-label="Ready-made Mix details"]')).toContainText("When you start it for someone.");
    await preview.getByRole("link", { name: "Use this Mix", exact: true }).click();
    await page.getByLabel("Mix name", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Everyone", { exact: false }).check();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    // /mixes/<id>/edit?imported=1 forwards to the Mix library's editor view.
    await page.waitForURL(/\/mixes\?mix=[^&]+&view=edit&imported=1/);
    mixId = new URL(page.url()).searchParams.get("mix")!;
    const editor = page.locator(".mix-editor-form");
    const beats = editor.getByRole("group", { name: /^Beat \d+$/ });
    await expect(beats).toHaveCount(2);
    await editor.getByRole("group", { name: "Beat 1", exact: true }).getByRole("textbox", { name: "Message", exact: true }).fill("Hi {{First Name}}, I’d love to catch up. {{SMS Signature}}");
    await editor.getByRole("group", { name: "Beat 2", exact: true }).getByRole("spinbutton", { name: "Days after start", exact: true }).fill("5");
    await editor.getByRole("button", { name: "Add a Beat", exact: true }).click();
    await expect(beats).toHaveCount(3);
    const added = editor.getByRole("group", { name: "Beat 3", exact: true });
    await added.getByRole("textbox", { name: "Call notes", exact: true }).fill("• Ask what’s new.\n• Agree on a next step.");
    await added.getByRole("spinbutton", { name: "Days after start", exact: true }).fill("14");
    await editor.getByRole("button", { name: "Save Mix", exact: true }).click();
    await page.waitForURL(/updated=manual/);
    const saved = await prisma.mix.findUniqueOrThrow({ where: { id: mixId }, include: { steps: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, include: { stepVersion: true } } } });
    expect(saved.status).toBe("DRAFT");
    expect(saved.category).toBe("Relationships");
    expect(saved.steps.map(beat => beat.dayOffset)).toEqual([0, 5, 14]);
    expect(saved.steps[0].stepVersion.body).toContain("I’d love to catch up");
    expect((await prisma.sharedMix.findUniqueOrThrow({ where: { id: original.id } })).steps).toEqual(original.steps);
    // A saved Mix keeps its name and start choices folded under "Name and start".
    const startSettings = editor.locator("details.mix-start-settings");
    if (!await startSettings.evaluate(element => (element as HTMLDetailsElement).open)) await startSettings.locator(":scope > summary").click();
    await editor.getByRole("combobox", { name: "After saving", exact: true }).selectOption("ACTIVE");
    await editor.getByRole("button", { name: "Review and start", exact: true }).click();
    const review = page.getByRole("dialog", { name: "Start this Mix?", exact: true });
    await expect(review).toContainText("Beats each");
    await review.getByRole("button", { name: "Start the Mix", exact: true }).click();
    await page.waitForURL(/updated=manual/);
    await expect.poll(async () => (await prisma.mix.findUniqueOrThrow({ where: { id: mixId } })).status).toBe("ACTIVE");
    const contact = await prisma.contact.findFirstOrThrow({ where: { workspaceId: "demo_workspace", archivedAt: null } });
    await page.goto(`/contacts/${contact.id}`);
    await page.locator(".contact-detail-more > summary").click();
    await expect(page.getByRole("combobox", { name: "Loop · repeat this date", exact: true })).toBeVisible();
    await page.getByRole("combobox", { name: "Choose a Mix", exact: true }).selectOption(mixId);
    await page.getByRole("button", { name: "Add to a Mix", exact: true }).click();
    // Starting a Mix for someone now confirms with the preparation notice (006d445).
    await expect(page.getByText(/^Start saved\b.*Follow-ups are being prepared\./)).toBeVisible();
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
