import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { BROWSER_CHANGE_KEY, privateStorageKey } from "../src/lib/private-browser-state";

// JITM-PRIV-02: the private-state cleanup must remove every key it is meant to remove,
// whatever else is in the tab's storage. Chromium orders sessionStorage keys by hash and
// can reorder them when an item is removed, so the key set decides whether a cleanup that
// walks live storage skips a key. Each scenario seeds an exact key set, runs one real
// cleanup (a fresh page load), and reports only key names, never stored values.
test.use({ screenshot: "off", video: "off", trace: "off" });
test.setTimeout(180_000);

const PRIVATE_PREFIX = privateStorageKey("", "").slice(0, -1);
// The key set reported in the finding: another account's recovery item and the two
// unscoped legacy items that predate account scoping.
const OTHER_SCOPE = "A";
const reported = [privateStorageKey(OTHER_SCOPE, "opened-jump"), "jitm:opened-jump", "jitm:contacts:list-state"];
// A spread of unrelated names: whether a skip occurs depends on the hashes, not on any one name.
const unrelatedNames = Array.from({ length: 48 }, (_, index) => `unrelated-${index}`);
// More private keys of two other accounts (a short scope and a full-length one).
const manyOther = [...reported, ...[OTHER_SCOPE, "f".repeat(64)].flatMap(scope => ["capture-draft", "contacts:list-state", "opened-jump:unresolved"].map(name => privateStorageKey(scope, name)))];
type Scenario = { clear: string[]; keep: string[] };
// ownKeys are the signed-in account's own private keys, which the cleanup keeps.
function scenarios(ownKeys: string[] = []): Scenario[] {
  return [
    ...unrelatedNames.map(name => ({ clear: reported, keep: [name] })),
    ...[2, 3, 5].map(count => ({ clear: reported, keep: unrelatedNames.slice(0, count) })),
    ...unrelatedNames.slice(0, 12).map(name => ({ clear: manyOther, keep: [name] })),
    ...(ownKeys.length ? unrelatedNames.slice(0, 12).map(name => ({ clear: reported, keep: [...ownKeys, name] })) : [])
  ];
}
async function seed(page: Page, scenario: Scenario) {
  await page.evaluate(({ keys, marker }) => {
    sessionStorage.clear();
    for (const key of keys) sessionStorage.setItem(key, "probe");
    localStorage.removeItem(marker);
  }, { keys: [...scenario.clear, ...scenario.keep], marker: BROWSER_CHANGE_KEY });
}
async function sessionKeys(page: Page) {
  return page.evaluate(() => Object.keys(sessionStorage));
}
function check(left: string[], scenario: Scenario, keepScope?: string) {
  const label = `unrelated keys: ${scenario.keep.filter(key => !key.startsWith(PRIVATE_PREFIX)).join(", ")}`;
  const survivors = left.filter(key => scenario.clear.includes(key) || (key.startsWith(PRIVATE_PREFIX) && !(keepScope && key.startsWith(privateStorageKey(keepScope, "")))));
  expect.soft(survivors, label).toEqual([]);
  expect.soft(scenario.keep.filter(key => !left.includes(key)), label).toEqual([]);
}

test("signed-out cleanup removes every private key, whatever else is in storage", async ({ page }) => {
  await page.goto("/signed-out");
  await page.waitForFunction(marker => localStorage.getItem(marker) !== null, BROWSER_CHANGE_KEY);
  for (const scenario of scenarios()) {
    await seed(page, scenario);
    await page.goto("/signed-out");
    // SignedOutCleanup signals the change right after it clears the tab.
    await page.waitForFunction(marker => localStorage.getItem(marker) !== null, BROWSER_CHANGE_KEY);
    check(await sessionKeys(page), scenario);
  }
});

test.describe("account switch", () => {
  test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
  let owner: { id: string; workspaceId: string } | null = null;
  test.beforeAll(async () => {
    const suffix = randomUUID();
    const user = await prisma.user.create({ data: { name: "Cleanup Beta Owner", email: `cleanup-${suffix}@example.com`, passwordHash: await bcrypt.hash(randomUUID(), 4), emailVerifiedAt: new Date() } });
    const workspace = await prisma.workspace.create({ data: { ownerId: user.id, slug: `cleanup-${suffix}`, name: "Cleanup Beta Owner", members: { create: { userId: user.id } }, profile: { create: { onboardingDone: true } } } });
    owner = { id: user.id, workspaceId: workspace.id };
  });
  test.afterAll(async () => {
    if (!owner) return;
    await prisma.workspace.deleteMany({ where: { id: owner.workspaceId } });
    await prisma.user.deleteMany({ where: { id: owner.id } });
  });

  test("the next account's tab keeps none of the other account's private keys", async ({ page, context }) => {
    const token = randomUUID();
    await prisma.session.create({ data: { userId: owner!.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
    await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: new URL(process.env.APP_URL!).origin, httpOnly: true, secure: true, sameSite: "Strict" }]);
    const open = async () => {
      await page.goto("/jumps");
      await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");
    };
    await open();
    const scope = (await page.locator("[data-browser-scope]").getAttribute("data-browser-scope"))!;
    for (const scenario of scenarios([privateStorageKey(scope, "cleanup-probe")])) {
      // Seed on a public page: the account boundary runs its cleanup when /jumps loads.
      await page.goto("/privacy");
      await seed(page, scenario);
      await open();
      check(await sessionKeys(page), scenario, scope);
    }
  });
});
