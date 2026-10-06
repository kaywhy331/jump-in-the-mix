import { expect, test, type Locator, type Page } from "@playwright/test";
import { createOneTimeFollowUp } from "../src/lib/one-time-follow-up";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";
import { applyRenderedTheme } from "./theme-fixture";

// Every contact shows whether they are in a Mix (JITM-09 §2.76–§2.77, D33).
const userEmail = process.env.E2E_USER_EMAIL ?? "demo@jumpinthemix.local";
const userPassword = process.env.E2E_USER_PASSWORD ?? "JumpInTheMix123!";
const workspaceId = "demo_workspace";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(userEmail);
  await page.getByLabel("Password", { exact: true }).fill(userPassword);
  await Promise.all([
    page.waitForURL(/\/(jumps|onboarding)(\?|$)/),
    page.getByRole("button", { name: "Sign in" }).click()
  ]);
}

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function people(names: string[]) {
  const suffix = unique();
  const data = names.map((name, index) => ({ id: `e2e-no-mix-${index}-${suffix}`, workspaceId, displayName: `${name} ${suffix}`, firstName: name }));
  await prisma.contact.createMany({ data });
  // Reachable people, so each row shows its Mix status rather than the missing-method link.
  await prisma.contactPhone.createMany({ data: data.map((person, index) => ({ contactId: person.id, phone: `(555) 010-0${index}0${index}`, normalized: `+155501000${index}${index}`, isPrimary: true })) });
  return { suffix, people: data };
}

async function cleanUp(ids: string[], since?: Date) {
  await prisma.mixAssignment.deleteMany({ where: { workspaceId, contactId: { in: ids } } });
  await prisma.contact.deleteMany({ where: { workspaceId, id: { in: ids } } });
  // No worker runs during the browser suites: settle the preparation this test queued, so the shared demo
  // account does not read as awaiting preparation, or count its Mix's people as being prepared, afterwards.
  if (since) await prisma.job.updateMany({ where: { workspaceId, task: "generate-jumps", completedAt: null, failedAt: null, createdAt: { gte: since } }, data: { completedAt: new Date() } });
}

test.beforeEach(async ({ page }) => { await signIn(page); });

// The shared settle step: both frames painted and the body in the chosen theme's text color.
const setTheme = (page: Page, colorScheme: "light" | "dark") => applyRenderedTheme(page, colorScheme);
async function audit(page: Page) {
  // A theme switch can leave colour transitions running, and axe would sample a mid-transition palette and report
  // a contrast failure that no one sees. Wait for running animations to finish, for at most two seconds.
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))),
    new Promise(resolve => setTimeout(resolve, 2_000))
  ]));
  expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
}

test("the No Mix row, chip and sheet pass the accessibility audit in both themes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Audited at desktop and phone widths in one project, as the sheet suites do.");
  test.setTimeout(180_000);
  const { suffix, people: [person] } = await people(["Audit"]);
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`/contacts?mix=no-mix&q=${encodeURIComponent(suffix)}`);
      await expect(page.locator(".contact-no-mix")).toHaveCount(1);
      for (const colorScheme of ["light", "dark"] as const) { await setTheme(page, colorScheme); await audit(page); }
      await page.goto(`/contacts/${person.id}`);
      const chip = page.getByRole("button", { name: `No Mix: choose what's next for ${person.displayName}` });
      expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(viewport.width < 768 ? 44 : 30);
      await chip.click();
      await expect(page.getByRole("dialog", { name: `What’s next for ${person.displayName}` })).toBeVisible();
      for (const colorScheme of ["light", "dark"] as const) { await setTheme(page, colorScheme); await audit(page); }
    }
  } finally {
    await cleanUp([person.id]);
  }
});

test("a contact with no Mix says so, and the owner can confirm it or start one from the profile", async ({ page }) => {
  const since = new Date();
  const { people: [person] } = await people(["Nomix"]);
  try {
    await page.goto(`/contacts/${person.id}`);
    const chip = page.getByRole("button", { name: `No Mix: choose what's next for ${person.displayName}` });
    await expect(chip).toBeVisible();
    await chip.click();
    const sheet = page.getByRole("dialog", { name: `What’s next for ${person.displayName}` });
    await expect(sheet.getByText("No Mix has work to come for this person.", { exact: true })).toBeVisible();
    await Promise.all([page.waitForURL(/noMixNeeded=1/), sheet.getByRole("button", { name: "Mark No Mix needed", exact: true }).click()]);
    await expect(page.locator(".notice.success").filter({ hasText: "Marked No Mix needed." })).toBeVisible();
    await expect(page.getByRole("button", { name: `No Mix needed: choose what's next for ${person.displayName}` })).toBeVisible();

    // Undo in the notice takes the confirmation back.
    await Promise.all([page.waitForURL(/noMixCleared=1/), page.getByRole("button", { name: "Undo", exact: true }).click()]);
    await expect(page.locator(".notice.success").filter({ hasText: "No Mix needed removed." })).toBeVisible();
    await expect(chip).toBeVisible();

    // Starting a Mix from the same sheet ends No Mix while its Beats are prepared.
    await chip.click();
    await Promise.all([page.waitForURL(/mixAssigned=/), sheet.getByRole("button", { name: "Start Mix", exact: true }).click()]);
    await expect(page.locator(".contact-mix-chip")).toHaveCount(0);
  } finally {
    await cleanUp([person.id], since);
  }
});

test("Contacts finds people with No Mix and handles them in bulk", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Bulk handling is exercised once, in the docked desktop layout.");
  const since = new Date();
  const { suffix, people: list } = await people(["Ana", "Ben"]);
  const ids = list.map(person => person.id);
  try {
    await page.goto(`/contacts?q=${encodeURIComponent(suffix)}`);
    for (const person of list) await expect(page.locator(".contact-row").filter({ hasText: person.displayName }).locator(".contact-no-mix")).toHaveText("No Mix");
    // The summary link and the filter count only the people this search shows, and the link keeps the search (D47).
    const noMixLink = page.getByRole("link", { name: "2 with No Mix", exact: true });
    await expect(noMixLink).toBeVisible();
    expect(Object.fromEntries(new URL(await noMixLink.getAttribute("href") ?? "", page.url()).searchParams)).toMatchObject({ q: suffix, mix: "no-mix" });

    // The filter keeps only people with No Mix, and its count matches the summary link.
    await page.getByRole("button", { name: "Filter contacts", exact: true }).click();
    const filters = page.getByRole("dialog", { name: "Filter contacts", exact: true });
    // The options read Any, In a Mix, No Mix, No Mix needed (JITM-09 §2.77, VOC-01).
    await expect(filters.getByRole("combobox", { name: "Mix", exact: true }).locator("option")).toHaveText(["Any", /^In a Mix · /, "No Mix · 2", "No Mix needed · 0"]);
    await filters.getByRole("combobox", { name: "Mix", exact: true }).selectOption("no-mix");
    await expect(page).toHaveURL(/mix=no-mix/);
    await page.getByLabel("Close Filter contacts").click();
    await expect(page.locator(".contact-row")).toHaveCount(2);

    // An earlier notice in the address must not come back after the bulk actions below (D47).
    await page.goto(`/contacts?q=${encodeURIComponent(suffix)}&mix=no-mix&created=1`);
    await expect(page.locator(".notice.success").filter({ hasText: "Contact added." })).toBeVisible();
    await page.getByRole("button", { name: "More contact tools" }).click();
    await page.getByRole("dialog", { name: "Contact tools" }).getByRole("button", { name: "Select contacts" }).click();
    for (const person of list) await page.getByRole("checkbox", { name: `Select ${person.displayName}`, exact: true }).check();
    const bar = page.getByRole("complementary", { name: "Actions for selected contacts" });
    await bar.getByRole("button", { name: "Mix", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Mix for 2 people" });
    await Promise.all([page.waitForURL(/noMixNeeded=2/), sheet.getByRole("button", { name: "Mark No Mix needed", exact: true }).click()]);
    await expect(page.locator(".notice.success").filter({ hasText: "2 people are marked No Mix needed." })).toBeVisible();
    // They leave the No Mix list, and the filter is kept; the earlier notice is not.
    expect(new URL(page.url()).searchParams.get("mix")).toBe("no-mix");
    expect(new URL(page.url()).searchParams.has("created")).toBe(false);
    await expect(page.locator(".notice.success").filter({ hasText: "Contact added." })).toHaveCount(0);
    await expect(page.locator(".contact-row")).toHaveCount(0);

    await Promise.all([page.waitForURL(/noMixCleared=2/), page.getByRole("button", { name: "Undo", exact: true }).click()]);
    await expect(page.locator(".contact-row")).toHaveCount(2);

    // Adding them to a Mix from the filtered list returns to it, now without them.
    await page.getByRole("button", { name: "More contact tools" }).click();
    await page.getByRole("dialog", { name: "Contact tools" }).getByRole("button", { name: "Select contacts" }).click();
    for (const person of list) await page.getByRole("checkbox", { name: `Select ${person.displayName}`, exact: true }).check();
    await bar.getByRole("button", { name: "Mix", exact: true }).click();
    // The sheet says that anyone who finished the Mix starts it again (D46).
    await expect(sheet.getByText("Anyone who already finished this Mix starts it again. Anyone still in it keeps their start.", { exact: true })).toBeVisible();
    const mixName = await sheet.getByRole("combobox", { name: "Choose a Mix", exact: true }).evaluate((select: HTMLSelectElement) => select.selectedOptions[0].text);
    await Promise.all([page.waitForURL(/mixStarted=2/), sheet.getByRole("button", { name: "Add to the Mix", exact: true }).click()]);
    // The notice names the Mix and what the start did (BLK-01), and offers Undo (D46).
    const started = page.locator(".notice.success").filter({ hasText: `${mixName} started for 2 people.` });
    await expect(started).toBeVisible();
    await expect(page.locator(".contact-row")).toHaveCount(0);
    expect(await prisma.mixAssignment.count({ where: { workspaceId, contactId: { in: ids }, isActive: true } })).toBe(2);
    await Promise.all([page.waitForURL(/mixUndone=2/), started.getByRole("button", { name: "Undo", exact: true }).click()]);
    await expect(page.locator(".notice.success").filter({ hasText: `Undone. ${mixName} is back to how it was for 2 people` })).toBeVisible();
    await expect(page.locator(".contact-row")).toHaveCount(2);
    expect(await prisma.mixAssignment.count({ where: { workspaceId, contactId: { in: ids }, isActive: true } })).toBe(0);

    // Docked beside the list, the profile's confirmation and the notice's Undo keep the list and that person (D47).
    const [first] = list;
    await page.locator(".contact-row").filter({ hasText: first.displayName }).getByRole("link", { name: first.displayName, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`person=${first.id}`));
    await page.getByRole("region", { name: "Selected contact" }).getByRole("button", { name: `No Mix: choose what's next for ${first.displayName}` }).click();
    await Promise.all([page.waitForURL(/noMixNeeded=1/), page.getByRole("dialog", { name: `What’s next for ${first.displayName}` }).getByRole("button", { name: "Mark No Mix needed", exact: true }).click()]);
    expect(Object.fromEntries(new URL(page.url()).searchParams)).toMatchObject({ q: suffix, mix: "no-mix", person: first.id });
    await Promise.all([page.waitForURL(/noMixCleared=1/), page.locator(".notice.success").getByRole("button", { name: "Undo", exact: true }).click()]);
    expect(Object.fromEntries(new URL(page.url()).searchParams)).toMatchObject({ q: suffix, mix: "no-mix", person: first.id });
  } finally {
    await cleanUp(ids, since);
  }
});

test("the disabled Add to the Mix gives its reason to assistive technology (A11Y-01)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The bulk bar is exercised once, in the docked desktop layout.");
  const { suffix, people: list } = await people(["Able", "Blocked"]);
  try {
    await prisma.contactRelationshipState.create({ data: { workspaceId, contactId: list[1].id, doNotContact: true } });
    await page.goto(`/contacts?q=${encodeURIComponent(suffix)}`);
    await page.getByRole("button", { name: "More contact tools" }).click();
    await page.getByRole("dialog", { name: "Contact tools" }).getByRole("button", { name: "Select contacts" }).click();
    for (const person of list) await page.getByRole("checkbox", { name: `Select ${person.displayName}`, exact: true }).check();
    await page.getByRole("complementary", { name: "Actions for selected contacts" }).getByRole("button", { name: "Mix", exact: true }).click();
    const add = page.getByRole("dialog", { name: "Mix for 2 people" }).getByRole("button", { name: "Add to the Mix", exact: true });
    await expect(add).toBeDisabled();
    await expect(add).toHaveAccessibleDescription(`Remove ${list[1].displayName} because “Do not contact” is on.`);
  } finally {
    await cleanUp(list.map(person => person.id));
  }
});

test("the chip, the What's next sheet and the bulk Mix sheet work from the keyboard alone (LAY-01)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "One keyboard pass, in the docked desktop layout; the phone layout has the same controls.");
  test.setTimeout(120_000);
  const since = new Date();
  const { suffix, people: [person] } = await people(["Keys"]);
  /**
   * A keyboard user's start on a page: the skip link, once the account boundary has checked the browser's
   * account. Focus stays in the page from there, so the boundary's window-focus check never interrupts.
   */
  async function startAtSkipLink() {
    await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");
    await page.getByRole("link", { name: "Skip to content" }).focus();
  }
  /** Presses Tab until the control has focus, at most `limit` times. */
  async function tabTo(control: Locator, limit = 60) {
    for (let index = 0; index < limit; index++) {
      if (await control.evaluate(element => element === document.activeElement)) return;
      await page.keyboard.press("Tab");
    }
    throw new Error(`Tab never reached ${await control.evaluate(element => element.outerHTML.slice(0, 160))}`);
  }
  try {
    await page.goto(`/contacts/${person.id}`);
    await startAtSkipLink();
    const chip = page.getByRole("button", { name: `No Mix: choose what's next for ${person.displayName}` });
    await tabTo(chip);
    expect(await chip.evaluate(element => element.matches(":focus-visible"))).toBe(true);
    await page.keyboard.press("Enter");
    const sheet = page.getByRole("dialog", { name: `What’s next for ${person.displayName}` });
    await expect(sheet).toBeVisible();
    for (const control of [sheet.getByRole("combobox", { name: "Choose a Mix" }), sheet.getByLabel("Start on"), sheet.getByRole("button", { name: "Start Mix", exact: true }), sheet.getByRole("link", { name: "Schedule a one-time follow-up" }), sheet.getByRole("button", { name: "Mark No Mix needed", exact: true })]) await tabTo(control, 20);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(chip).toBeFocused();

    // Select, open the bulk Mix sheet, reach every control, mark No Mix needed and Undo it, all with keys.
    await page.goto(`/contacts?q=${encodeURIComponent(suffix)}`);
    await startAtSkipLink();
    await tabTo(page.getByRole("button", { name: "More contact tools" }));
    await page.keyboard.press("Enter");
    await tabTo(page.getByRole("dialog", { name: "Contact tools" }).getByRole("button", { name: "Select contacts" }), 30);
    await page.keyboard.press("Enter");
    const checkbox = page.getByRole("checkbox", { name: `Select ${person.displayName}`, exact: true });
    await tabTo(checkbox);
    await page.keyboard.press("Space");
    // Once ticked, the checkbox's name says what it will do next.
    await expect(page.getByRole("checkbox", { name: `Deselect ${person.displayName}`, exact: true })).toBeChecked();
    await tabTo(page.getByRole("complementary", { name: "Actions for selected contacts" }).getByRole("button", { name: "Mix", exact: true }), 30);
    await page.keyboard.press("Enter");
    const bulk = page.getByRole("dialog", { name: "Mix for 1 person" });
    await expect(bulk).toBeVisible();
    for (const control of [bulk.getByRole("combobox", { name: "Choose a Mix" }), bulk.getByLabel("Start on"), bulk.getByRole("button", { name: "Add to the Mix", exact: true }), bulk.getByRole("button", { name: "Mark No Mix needed", exact: true })]) await tabTo(control, 20);
    await Promise.all([page.waitForURL(/noMixNeeded=1/), page.keyboard.press("Enter")]);
    await startAtSkipLink();
    await tabTo(page.locator(".notice.success").getByRole("button", { name: "Undo", exact: true }));
    await Promise.all([page.waitForURL(/noMixCleared=1/), page.keyboard.press("Enter")]);
    await expect(page.locator(".contact-row").filter({ hasText: person.displayName }).locator(".contact-no-mix")).toHaveText("No Mix");
  } finally {
    await cleanUp([person.id], since);
  }
});

test("Today points to the people with No Mix", async ({ page }) => {
  const { people: [person] } = await people(["Today"]);
  try {
    await page.goto("/jumps");
    const line = page.locator(".today-no-mix-line");
    await expect(line).toContainText(/No Mix, so no Mix will remind you about them\./);
    await Promise.all([page.waitForURL(/\/contacts\?mix=no-mix$/), line.getByRole("link", { name: "Review", exact: true }).click()]);
    await page.goto(`/contacts?mix=no-mix&q=${encodeURIComponent(person.displayName)}`);
    await expect(page.locator(".contact-row").filter({ hasText: person.displayName })).toHaveCount(1);
  } finally {
    await cleanUp([person.id]);
  }
});

// D44: a one-time follow-up is outside every Mix, so the person still has No Mix, and every sentence about
// them stays true: the row shows the follow-up, and nothing says that nothing will remind the owner.
test("a person with No Mix and a pending one-time follow-up is described truthfully", async ({ page }) => {
  const { people: [person] } = await people(["Onetime"]);
  try {
    const { ownerId } = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { ownerId: true } });
    await prisma.$transaction(tx => createOneTimeFollowUp(tx, {
      workspaceId, contactId: person.id, actorUserId: ownerId, scheduledAt: new Date(Date.now() + 2 * 86_400_000),
      reason: "Call back about the quote", channel: "PHONE_CALL", content: { subject: null, body: null, script: "Ask whether the quote works for them." },
      key: `e2e-no-mix-one-time-${person.id}`
    }));
    await page.goto(`/contacts?q=${encodeURIComponent(person.displayName)}`);
    const summary = page.locator(".contact-row").filter({ hasText: person.displayName }).locator(".contact-row-summary");
    await expect(summary.locator(".contact-no-mix")).toHaveText("No Mix");
    // "No Mix · {when the follow-up is due}", never "Nothing scheduled".
    await expect(summary.locator(".contact-no-mix + .contact-summary-separator + span")).not.toHaveText("");
    await expect(summary).not.toContainText("Nothing scheduled");

    await page.goto(`/contacts/${person.id}`);
    await page.getByRole("button", { name: `No Mix: choose what's next for ${person.displayName}` }).click();
    const sheet = page.getByRole("dialog", { name: `What’s next for ${person.displayName}` });
    await expect(sheet.getByText("No Mix has work to come for this person.", { exact: true })).toBeVisible();
    await expect(sheet).not.toContainText("nothing will remind you");

    await page.goto("/jumps");
    const line = page.locator(".today-no-mix-line");
    await expect(line).toContainText(/(1 person has|people have) No Mix, so no Mix will remind you about them\./);
    await expect(line).not.toContainText("nothing will remind you");
  } finally {
    await cleanUp([person.id]);
  }
});
