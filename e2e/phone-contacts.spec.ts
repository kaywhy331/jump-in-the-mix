import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";

const userEmail = process.env.E2E_USER_EMAIL ?? "demo@jumpinthemix.local";
const userPassword = process.env.E2E_USER_PASSWORD ?? "JumpInTheMix123!";
const iphoneUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(userEmail);
  await page.getByLabel("Password", { exact: true }).fill(userPassword);
  await Promise.all([
    page.waitForURL(/\/(jumps|onboarding)(\?|$)/),
    page.getByRole("button", { name: "Sign in" }).click()
  ]);
}

// The app's service worker re-requests pages without the emulated phone's user agent; real phones send their own.
test.use({ serviceWorkers: "block" });

const card = (name: string, email: string) => ["BEGIN:VCARD", "VERSION:3.0", `FN:${name}`, `EMAIL;type=INTERNET:${email}`, "END:VCARD"].join("\r\n");

test.describe("on Android", () => {
  test("Add a contact opens the phone's contact picker directly", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "The picker runs on the Android phone profile.");
    const email = `e2e-picker-${Date.now()}@jumpinthemix.local`;
    await page.addInitScript((address) => {
      Object.defineProperty(navigator, "contacts", {
        configurable: true,
        value: { getProperties: async () => ["name", "email", "tel", "address"], select: async () => [{ name: ["E2E Picker Person"], email: [address], tel: [], address: [] }] }
      });
    }, email);
    await signIn(page);
    try {
      await page.goto("/contacts/new");
      await page.getByRole("button", { name: /Add from phone contacts/ }).click();
      await expect(page.getByText("1 added · 0 merged")).toBeVisible();

      await page.goto("/contacts/from-phone");
      await expect(page.getByRole("heading", { level: 2, name: "Choose from your contacts", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: /Add from phone contacts/ })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: /contact card/ })).toHaveCount(0);
    } finally {
      await prisma.contact.deleteMany({ where: { emails: { some: { normalized: email } } } });
    }
  });
});

test.describe("on iPhone", () => {
  test.use({ userAgent: iphoneUserAgent });

  test("Add a contact leads to the iPhone steps, and the shortcut key adds a shared card", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "The iPhone steps run on the phone profile with an iPhone browser.");
    const email = `e2e-share-${Date.now()}@jumpinthemix.local`;
    await signIn(page);
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: userEmail }, select: { id: true } });
    await prisma.contactShareKey.deleteMany({ where: { userId: owner.id } });
    try {
      await page.goto("/contacts/new");
      await page.getByRole("link", { name: /Add from iPhone contacts/ }).click();
      await expect(page).toHaveURL(/\/contacts\/from-phone$/);
      await expect(page.getByRole("heading", { level: 1, name: "Add from your phone" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: "Save a contact card", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: /Android|Choose from your contacts/ })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Import contacts" })).toHaveAttribute("href", "/contacts/import");

      // The shortcut steps stay hidden until its link is set, except while the shortcut is being built.
      await page.goto("/contacts/from-phone?setup=shortcut");
      const shortcut = page.getByRole("region", { name: "Share from Contacts", exact: true });
      await expect(page.getByRole("heading", { level: 2, name: "Or save a contact card", exact: true })).toBeVisible();
      await shortcut.getByRole("button", { name: "Make my key" }).click();
      const keyField = shortcut.getByLabel("Key", { exact: true });
      await expect(keyField).toHaveValue(/^[A-Za-z0-9_-]{43}$/);
      await expect(keyField).toBeFocused();
      const key = await keyField.inputValue();

      const added = await page.request.post("/api/webhooks/phone-contacts", { headers: { "x-jitm-key": key, "content-type": "text/vcard" }, data: card("E2E Shared Person", email) });
      expect(added.status()).toBe(200);
      expect(await added.text()).toBe("Added E2E Shared Person to Jump in the Mix.");

      await page.reload();
      await expect(shortcut.getByText(/^Made .+, last used .+\.$/)).toBeVisible();
      await shortcut.getByRole("button", { name: "Make a new key" }).click();
      const confirm = page.getByRole("dialog", { name: "Make a new key?" });
      await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
      await confirm.getByRole("button", { name: "Make a new key" }).click();
      await expect(keyField).not.toHaveValue(key);
      const refused = await page.request.post("/api/webhooks/phone-contacts", { headers: { "x-jitm-key": key, "content-type": "text/vcard" }, data: card("E2E Shared Person", email) });
      expect(refused.status()).toBe(401);

      await shortcut.getByRole("button", { name: "Turn off the shortcut" }).click();
      await page.getByRole("dialog", { name: "Turn off the shortcut?" }).getByRole("button", { name: "Turn off" }).click();
      await expect(shortcut.getByRole("button", { name: "Make my key" })).toBeVisible();
      expect(await prisma.contactShareKey.count({ where: { userId: owner.id } })).toBe(0);
    } finally {
      await prisma.contactShareKey.deleteMany({ where: { userId: owner.id } });
      await prisma.contact.deleteMany({ where: { emails: { some: { normalized: email } } } });
    }
  });
});

test("computers see both phones' steps and no phone button on Add a contact", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Runs once, in the desktop layout.");
  await signIn(page);
  await page.goto("/contacts/new");
  await expect(page.getByRole("heading", { level: 1, name: "Add a contact" })).toBeVisible();
  await expect(page.getByText(/Add from (phone|iPhone) contacts/)).toHaveCount(0);
  await page.goto("/contacts/import");
  await page.getByRole("link", { name: "Adding people from your phone?" }).click();
  await expect(page).toHaveURL(/\/contacts\/from-phone$/);
  await expect(page.getByRole("heading", { level: 2, name: "On Android", exact: true })).toBeVisible();
  await expect(page.getByText("Open this page in Chrome on your Android phone to choose people from its contacts.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "On iPhone: save a contact card", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "On iPhone: share from Contacts", exact: true })).toHaveCount(0);
});

test("Add from your phone passes automated accessibility checks in both themes and works by keyboard", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Runs once, in the desktop layout.");
  await signIn(page);
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: userEmail }, select: { id: true } });
  await prisma.contactShareKey.deleteMany({ where: { userId: owner.id } });
  try {
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.goto("/contacts/from-phone?setup=shortcut");
      const make = page.getByRole("button", { name: /^Make (my|a new) key$/ });
      await make.focus();
      await page.keyboard.press("Enter");
      const confirm = page.getByRole("dialog", { name: "Make a new key?" });
      if (colorScheme === "dark") {
        await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
        await page.keyboard.press("Tab");
        await page.keyboard.press("Enter");
      }
      await expect(page.getByLabel("Key", { exact: true })).toHaveValue(/^[A-Za-z0-9_-]{43}$/);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(results.violations, results.violations.map(violation => `${violation.id}: ${violation.help}`).join("\n")).toEqual([]);
    }
  } finally {
    await prisma.contactShareKey.deleteMany({ where: { userId: owner.id } });
  }
});
