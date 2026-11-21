import { expect, test, type Locator, type Page } from "@playwright/test";
import { axeInPage } from "./axe-in-page";
import { applyRenderedTheme } from "./theme-fixture";
import { COPIED_LABEL_MS } from "../src/components/CopyText";

// JITM-UXB-01 (audit E-04, E-06, E-13, E-14, E-16, M-08): the public pages read as one system.
// One H1 scale, one header and one table of contents; reading text near 65 characters a line;
// the hero tracked as the export draws it; hyphenated headings kept whole; template messages in the
// voice font; copy confirmed on its button.
const landing = ["/", "/for/contractors", "/for/consultants"];
const pages = ["/faq", "/pricing", "/privacy", "/terms", "/security", "/contact", "/follow-up-templates", "/follow-up-templates/estimate-follow-up", "/follow-up-templates/proposal-follow-up", "/features/follow-up-reminders"];
const withContents = ["/privacy", "/follow-up-templates/estimate-follow-up", "/features/follow-up-reminders"];
const widths = [1440, 768, 375];
// JITM-06 §2.34: target 65 characters, never more than 75.
const MOST_CHARACTERS = 75;

test.use({ screenshot: "off", video: "off", trace: "off" });

async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

/** The H1's size in px, tracking and line-height in em, and its wrapping. */
function h1Type(page: Page) {
  return page.locator("h1").evaluate(element => {
    const style = getComputedStyle(element), size = parseFloat(style.fontSize);
    return { size, tracking: parseFloat(style.letterSpacing) / size, leading: parseFloat(style.lineHeight) / size, wrap: style.textWrapStyle || style.textWrap };
  });
}

/** The most characters on any rendered line of the page's reading text, with the block that has them. */
function longestLine(page: Page) {
  return page.evaluate(() => {
    for (const details of document.querySelectorAll("main details")) (details as HTMLDetailsElement).open = true;
    let most = { characters: 0, text: "" };
    const blocks = [...document.querySelectorAll("main :is(p, li, dd)")].filter(element => element.checkVisibility() && !element.closest(".product-demo, nav, .public-header"));
    for (const block of blocks) {
      const lines = new Map<number, number>();
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node as Text;
        for (let index = 0; index < text.length; index++) {
          const range = document.createRange(); range.setStart(text, index); range.setEnd(text, index + 1);
          const rect = range.getClientRects()[0];
          if (!rect?.width) continue;
          const line = Math.round(rect.top / 4);
          lines.set(line, (lines.get(line) ?? 0) + 1);
        }
      }
      const characters = Math.max(0, ...lines.values());
      if (characters > most.characters) most = { characters, text: block.textContent?.trim().slice(0, 40) ?? "" };
    }
    return most;
  });
}

/** Headings whose line breaks fall right after a hyphen ("follow-" / "up"). */
function hyphenBreaks(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll("h1, h2, h3")].filter(heading => heading.checkVisibility()).flatMap(heading => {
    const found: string[] = [];
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    const characters: { node: Text; index: number }[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) for (let index = 0; index < (node as Text).length; index++) characters.push({ node: node as Text, index });
    const top = (at: { node: Text; index: number }) => { const range = document.createRange(); range.setStart(at.node, at.index); range.setEnd(at.node, at.index + 1); return range.getClientRects()[0]?.top ?? 0; };
    characters.forEach((at, position) => {
      const next = characters[position + 1];
      if (at.node.data[at.index] === "-" && next && Math.abs(top(next) - top(at)) > 2) found.push(heading.textContent ?? "");
    });
    return found;
  }));
}

test("public pages share one H1 scale, one header and one table of contents at 1440, 768 and 375", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport matrix.");
  test.setTimeout(240_000);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const pageSteps = new Set<string>();
    const heroSteps = new Map<string, string>();
    for (const route of [...landing, ...pages]) {
      await test.step(`${route} ${width}px`, async () => {
        await page.goto(route);
        await settle(page);
        await expect(page.locator("h1")).toHaveCount(1);
        const type = await h1Type(page);
        expect(type.wrap, `${route} ${width}px H1 wrap`).toBe("balance");
        if (landing.includes(route)) {
          // The export's hero tracking (Landing.html: -0.045em), never the old -0.06em, and a line-height of at least 1.05.
          expect(type.tracking, `${route} ${width}px hero tracking`).toBeCloseTo(-0.045, 3);
          expect(type.leading, `${route} ${width}px hero line-height`).toBeGreaterThanOrEqual(1.0499);
          expect(type.leading).toBeLessThanOrEqual(1.1);
          heroSteps.set(route, `${type.size}/${type.tracking.toFixed(3)}/${type.leading.toFixed(3)}`);
        } else {
          expect(type.tracking, `${route} ${width}px H1 tracking`).toBeGreaterThanOrEqual(-0.0301);
          expect(type.leading, `${route} ${width}px H1 line-height`).toBeGreaterThanOrEqual(1.0499);
          expect(type.leading).toBeLessThanOrEqual(1.1);
          pageSteps.add(`${type.size}/${type.tracking.toFixed(3)}/${type.leading.toFixed(3)}`);
        }
        // One header: the same section links on every public page, inline or in Explore.
        const header = page.locator(".public-header");
        const links = width > 900 ? header.getByRole("navigation", { name: "Public navigation" }).locator(".public-section-link") : header.getByRole("navigation", { name: "Explore the app", includeHidden: true }).getByRole("link", { includeHidden: true });
        const labels = (await links.allTextContents()).filter(label => ["Templates", "Questions", "Pricing", "How it works", "Try the demo"].includes(label));
        expect(labels, `${route} ${width}px header links`).toEqual(["Templates", "Questions", "Pricing"]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${route} ${width}px overflow`).toBe(true);
      });
    }
    // Every non-hero public H1 is one step: one size, tracking and line-height per width.
    expect([...pageSteps], `${width}px page H1 styles`).toHaveLength(1);
    // The hero belongs to the landing template (PublicLanding), which the home page and the profession pages share.
    expect(heroSteps.get("/for/consultants"), `${width}px profession hero step`).toBe(heroSteps.get("/"));
  }
});

test("one table of contents: the same link cue everywhere, collapsed on phones from the public menu boundary", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport matrix.");
  test.setTimeout(180_000);
  const cues = new Set<string>();
  for (const route of withContents) {
    for (const width of [1440, 768, 761, 760, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route);
      const contents = page.getByRole("navigation", { name: "On this page" });
      await expect(contents).toBeVisible();
      const summary = contents.locator("summary");
      await expect(summary).toHaveText("On this page");
      const disclosure = contents.locator("details");
      if (width <= 760) {
        await expect(disclosure, `${route} ${width}px starts collapsed`).not.toHaveAttribute("open");
        expect((await contents.boundingBox())!.height, `${route} ${width}px collapsed height`).toBeLessThan(100);
        const box = (await summary.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        await summary.focus();
        await page.keyboard.press("Enter");
        await expect(disclosure).toHaveAttribute("open", "");
      } else {
        await expect(disclosure, `${route} ${width}px starts open`).toHaveAttribute("open", "");
      }
      const link = contents.getByRole("link").first();
      await expect(link).toBeVisible();
      cues.add(await link.evaluate(element => { const style = getComputedStyle(element); return `${style.textDecorationLine} ${style.fontWeight} ${style.color}`; }));
      // Following an entry still reaches its section.
      const target = await link.getAttribute("href");
      await link.click();
      await expect(page.locator(target!)).toBeInViewport();
    }
  }
  expect([...cues], "ToC link cue").toHaveLength(1);
  expect([...cues][0]).toMatch(/^underline /);
});

test("reading text stays near 65 characters a line, and hyphenated headings stay whole", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport matrix.");
  test.setTimeout(300_000);
  for (const width of [1920, 1440, 901, 834, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [...landing, ...pages]) {
      await page.goto(route);
      await settle(page);
      const longest = await longestLine(page);
      expect(longest.characters, `${route} ${width}px longest line: "${longest.text}"`).toBeLessThanOrEqual(MOST_CHARACTERS);
      expect(await hyphenBreaks(page), `${route} ${width}px heading broken at a hyphen`).toEqual([]);
    }
  }
  // At 320px with 200% text a heading word wider than the column may wrap, but nothing overflows.
  await page.setViewportSize({ width: 320, height: 640 });
  for (const route of ["/follow-up-templates", "/follow-up-templates/estimate-follow-up", "/for/consultants", "/privacy"]) {
    await page.goto(route);
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await settle(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${route} 320px 200% overflow`).toBe(true);
    expect(await page.locator("h1").evaluate(element => element.getBoundingClientRect().right <= innerWidth), `${route} 320px 200% H1 inside the screen`).toBe(true);
  }
});

/** Waits until React has attached to the element, so a first click or key press is not lost before hydration. */
async function hydrated(locator: Locator) {
  await expect.poll(() => locator.evaluate(element => Object.keys(element).some(key => key.startsWith("__reactProps")))).toBe(true);
}

/** Stops the page clock, so the button's timed label changes only when the test moves time on. */
async function pauseClock(page: Page) {
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
}

test("template messages use the voice font, and copy confirms on its own button", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.clock.install();
  await page.goto("/follow-up-templates/estimate-follow-up");
  const message = page.locator(".template-example blockquote").first();
  // The voice font (--font-voice, Newsreader) that the homepage demo uses for the same wording (JITM-06 §2.13).
  const voice = await page.evaluate(() => { const probe = document.createElement("span"); probe.style.fontFamily = "var(--font-voice)"; document.body.append(probe); const family = getComputedStyle(probe).fontFamily; probe.remove(); return family; });
  expect(await message.evaluate(element => getComputedStyle(element).fontFamily)).toBe(voice);
  expect(await page.locator(".template-subject").first().evaluate(element => getComputedStyle(element).fontFamily), "the Subject label stays interface text").not.toBe(voice);
  // The button's name changes, so hold its row rather than the name.
  const actions = page.locator(".template-example-actions").first();
  await expect(actions.getByRole("button")).toHaveText("Copy text");
  await hydrated(actions.getByRole("button"));
  await pauseClock(page);
  await actions.getByRole("button").click();
  await expect(actions.getByRole("button")).toHaveText("Copied");
  const status = actions.getByRole("status");
  await expect(status).toHaveText("Copied. Paste it into your own messaging app and make it yours.");
  await expect(status).toHaveAttribute("aria-live", "polite");
  expect(await status.evaluate(element => element.getBoundingClientRect().width), "success is announced, not repeated beside the button").toBeLessThanOrEqual(1);
});

test("the Copied label returns after a moment, a repeated copy confirms again, and each copy is announced once", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.clock.install();
  await page.goto("/follow-up-templates/estimate-follow-up");
  const actions = page.locator(".template-example-actions").first();
  const button = actions.getByRole("button");
  const status = actions.getByRole("status");
  const announcement = "Copied. Paste it into your own messaging app and make it yours.";
  await expect(button).toHaveText("Copy text");
  await hydrated(button);
  // Every change to the live region: text it adds is announced; the label's return must add nothing.
  await status.evaluate(element => {
    const log = { added: [] as string[], changes: 0 };
    (window as unknown as { liveRegion: typeof log }).liveRegion = log;
    new MutationObserver(records => {
      log.changes += records.length;
      for (const record of records) for (const node of record.addedNodes) if (node.textContent) log.added.push(node.textContent);
    }).observe(element, { childList: true, subtree: true, characterData: true });
  });
  const liveRegion = () => page.evaluate(() => (window as unknown as { liveRegion: { added: string[]; changes: number } }).liveRegion);
  await pauseClock(page);

  // Mouse: the button confirms, and the status announces the copy.
  await button.click();
  await expect(button).toHaveText("Copied");
  await expect.poll(async () => (await liveRegion()).added).toEqual([announcement]);
  await page.clock.runFor(COPIED_LABEL_MS / 2);
  await expect(button).toHaveText("Copied");

  // A second copy before the label returns is announced again and restarts the interval.
  await button.click();
  await expect.poll(async () => (await liveRegion()).added).toEqual([announcement, announcement]);
  await page.clock.runFor(COPIED_LABEL_MS - 1);
  await expect(button, "the interval restarted with the second copy").toHaveText("Copied");
  const beforeReturn = await liveRegion();
  await page.clock.runFor(1);
  await expect(button).toHaveText("Copy text");
  expect(await liveRegion(), "the label's return announces nothing").toEqual(beforeReturn);
  await expect(status).toHaveText(announcement);

  // Keyboard: Enter copies again, and the confirmation shows again.
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toHaveText("Copied");
  await expect.poll(async () => (await liveRegion()).added).toEqual([announcement, announcement, announcement]);
  await page.clock.runFor(COPIED_LABEL_MS);
  await expect(button).toHaveText("Copy text");
  await expect(button).toBeFocused();
});

test("a copy that fails keeps its button label and says so in readable text", async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } }); });
  await page.goto("/follow-up-templates/proposal-follow-up");
  const actions = page.locator(".template-example-actions").first();
  await expect(actions.getByRole("button")).toHaveText("Copy email");
  await actions.getByRole("button").click();
  const status = actions.getByRole("status");
  await expect(status).toHaveText("Copy isn’t available here. Select the text above and copy it manually.");
  await expect(status).toBeVisible();
  expect(parseFloat(await status.evaluate(element => getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(13);
  await expect(actions.getByRole("button")).toHaveText("Copy email");
});

test("marketing copy reads as sentences: no dot strings outside app-style meta lines", async ({ page }) => {
  for (const route of [...landing, ...pages]) {
    await page.goto(route);
    // The demo's own meta lines ("Beat 2 of 3 · Upcoming") mirror the app and stay.
    const text = await page.locator("main").evaluate(main => {
      const copy = main.cloneNode(true) as HTMLElement;
      copy.querySelectorAll("[class*='beat'], .product-demo h3, select, option").forEach(element => element.remove());
      return copy.textContent ?? "";
    });
    expect(text, `${route} middle dot`).not.toContain(" · ");
  }
  await page.goto("/");
  await expect(page.locator(".product-demo")).toContainText("3 Beats in one reusable follow-up plan");
});

test("the table of contents and header pass axe in both themes on phones and desktops", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport matrix.");
  for (const viewport of [{ width: 375, height: 812 }, { width: 1440, height: 900 }]) {
    for (const scheme of ["light", "dark"] as const) {
      await page.setViewportSize(viewport);
      await page.goto("/follow-up-templates/estimate-follow-up");
      await applyRenderedTheme(page, scheme);
      const violations = (await axeInPage(page).include(".public-header").include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations;
      expect(violations, `${scheme} ${viewport.width}px`).toEqual([]);
    }
  }
});
