import { expect, test, type Browser } from "@playwright/test";

// How it works shows real captures of the fictional demo workspace, and the waitlist question is the
// page's one brand bubble (JITM-UXA-12, audit M-02 and M-03; JITM-03 §2.13, §2.19).
test.use({ screenshot: "off", video: "off", trace: "off" });

type Scheme = "light" | "dark";

async function openPublicPage(browser: Browser, baseURL: string | undefined, path: string, viewport: { width: number; height: number }, colorScheme: Scheme) {
  const context = await browser.newContext({ baseURL, viewport, colorScheme, reducedMotion: "reduce" });
  const page = await context.newPage();
  const requested = new Set<string>();
  page.on("request", request => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith("/product-shots/")) requested.add(pathname.slice("/product-shots/".length));
  });
  await page.goto(path);
  return { context, page, requested };
}

const CASES = [
  { path: "/", viewport: { width: 1280, height: 800 }, scheme: "light", shots: ["today-desktop", "review-phone"] },
  { path: "/", viewport: { width: 1280, height: 800 }, scheme: "dark", shots: ["today-desktop", "review-phone"] },
  { path: "/", viewport: { width: 768, height: 1024 }, scheme: "dark", shots: ["today-desktop", "review-phone"] },
  { path: "/", viewport: { width: 767, height: 1024 }, scheme: "light", shots: ["today-phone", "review-phone"] },
  { path: "/", viewport: { width: 320, height: 640 }, scheme: "dark", shots: ["today-phone", "review-phone"] },
  { path: "/for/contractors", viewport: { width: 390, height: 844 }, scheme: "light", shots: ["today-phone", "review-phone"] }
] as const;

test("How it works shows the matching theme and size of each capture and requests no other", async ({ browser, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Each case sets its own viewport and theme.");
  test.setTimeout(120_000);
  for (const item of CASES) {
    await test.step(`${item.path} ${item.viewport.width}x${item.viewport.height} ${item.scheme}`, async () => {
      const { context, page, requested } = await openPublicPage(browser, baseURL, item.path, item.viewport, item.scheme);
      const images = page.locator("#how-it-works .product-shots img:visible");
      await expect(images).toHaveCount(item.shots.length);
      await images.first().scrollIntoViewIfNeeded();
      for (const image of await images.all()) await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete ? element.naturalWidth : 0)).toBeGreaterThan(0);
      const shown = await images.evaluateAll((elements: HTMLImageElement[]) => elements.map(element => {
        const box = element.getBoundingClientRect();
        return { file: new URL(element.currentSrc).pathname.split("/").pop(), alt: element.alt, loading: element.loading, height: box.height, ratio: box.width / box.height, natural: element.naturalWidth / element.naturalHeight };
      }));
      const files = item.shots.map(shot => `${shot}-${item.scheme}.webp`);
      expect(shown.map(image => image.file)).toEqual(files);
      for (const image of shown) {
        expect(image.alt).toContain("shown with fictional people");
        expect(image.loading).toBe("lazy");
        expect(Math.abs(image.ratio - image.natural), `${image.file} keeps its proportions`).toBeLessThan(0.02);
      }
      if (item.viewport.width >= 768) expect(Math.abs(shown[0].height - shown[1].height), "computer and phone captures share one height").toBeLessThanOrEqual(2);
      expect([...requested].sort(), "only the shown theme and size are downloaded").toEqual([...files].sort());
      await expect(page.locator(".product-shots-note")).toHaveText("Screens from the app, shown with a sample workspace and fictional people.");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await context.close();
    });
  }
});

test("the captures sit below the first screen, so lazy loading never holds back the first paint", async ({ browser, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Each case sets its own viewport.");
  for (const viewport of [{ width: 412, height: 823 }, { width: 844, height: 390 }, { width: 1280, height: 600 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    const { context, page } = await openPublicPage(browser, baseURL, "/", viewport, "light");
    const top = await page.locator(".product-shots").evaluate(element => element.getBoundingClientRect().top);
    expect(top, `${viewport.width}x${viewport.height}`).toBeGreaterThan(viewport.height);
    await context.close();
  }
});

test("at 200% text the captions wrap inside a phone screen", async ({ browser, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The viewport is set explicitly.");
  const { context, page } = await openPublicPage(browser, baseURL, "/", { width: 390, height: 844 }, "light");
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await page.locator(".product-shots").scrollIntoViewIfNeeded();
  const facts = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    clipped: [...document.querySelectorAll<HTMLElement>(".product-shot figcaption, .product-shots-note")].some(element => element.scrollWidth > element.clientWidth + 1)
  }));
  expect(facts).toEqual({ overflow: false, clipped: false });
  await context.close();
});

test("the waitlist question is the page's one violet bubble, with the tail on the left", async ({ browser, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Both themes are emulated explicitly.");
  const luminance = (rgb: string) => {
    const [r, g, b] = (rgb.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map(value => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  for (const scheme of ["light", "dark"] as const) {
    const { context, page } = await openPublicPage(browser, baseURL, "/", { width: 1280, height: 800 }, scheme);
    await expect(page.locator(".speech-bubble--brand")).toHaveCount(1);
    const bubble = page.locator("#waitlist h2#waitlist-title.speech-bubble--brand");
    await expect(bubble).toHaveText("Ready to put one follow-up in the mix?");
    const style = await bubble.evaluate(element => {
      const own = getComputedStyle(element), tail = getComputedStyle(element, "::after"), box = element.getBoundingClientRect();
      return { color: own.color, fill: own.backgroundColor, border: own.borderTopWidth, tail: tail.backgroundColor, tailLeft: parseFloat(tail.insetInlineStart), width: box.width };
    });
    expect(style.fill, `${scheme} violet fill`).toBe("rgb(93, 76, 242)"); // --violet in design-tokens.css
    expect(style.tail, `${scheme} tail uses the bubble's fill`).toBe(style.fill);
    expect(style.border, "flat, like the shared bubble").toBe("0px");
    expect(style.tailLeft, `${scheme} tail on the left`).toBeLessThan(style.width / 2);
    expect(contrast(style.color, style.fill), `${scheme} bubble text`).toBeGreaterThanOrEqual(4.5);
    await context.close();
  }
});
