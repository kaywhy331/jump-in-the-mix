import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SECTION_RING, browserMayHaveAnimated, ringStop, slideFor } from "@/lib/back-navigation";

// Back (JITM-08 §2.46, NATIVE-NAVIGATION.md §3 C).
const url = (path: string) => new URL(path, "https://app.test");

describe("back", () => {
  it("knows the section ring's own screens, and treats the Mix editor as a drill-in", () => {
    expect(SECTION_RING).toEqual(["/jumps", "/contacts", "/mixes", "/more"]);
    expect(["/jumps", "/contacts?q=ana", "/mixes?mix=m1", "/more"].map(path => ringStop(url(path)))).toEqual([0, 1, 2, 3]);
    for (const path of ["/contacts/c1", "/mixes?mix=m1&view=edit", "/settings", "/journey?contactId=c1", "/calendar"]) expect(ringStop(url(path)), path).toBe(-1);
  });

  it("slides the way history moved, and in ring order between two ring stops", () => {
    expect(slideFor(url("/contacts/c1"), url("/contacts"), true)).toBe("back");
    expect(slideFor(url("/contacts"), url("/contacts/c1"), false)).toBe("forward");
    expect(slideFor(url("/mixes"), url("/contacts"), false)).toBe("back");
    expect(slideFor(url("/contacts"), url("/mixes"), true)).toBe("forward");
    expect(slideFor(url("/mixes?mix=m1"), url("/mixes"), true)).toBe("back");
  });

  it("never animates a back twice: it slides only when the browser says it did not animate, or the app went back itself", () => {
    expect(browserMayHaveAnimated(true, false)).toBe(true);
    expect(browserMayHaveAnimated(false, false)).toBe(false);
    // A browser without the Navigation API cannot tell.
    expect(browserMayHaveAnimated(undefined, false)).toBe(true);
    expect(browserMayHaveAnimated(undefined, true)).toBe(false);
  });

  it("slides with the motion tokens, keeps the navigation still, and is instant under reduced motion", () => {
    const popups = readFileSync("src/styles/popups.css", "utf8"), base = readFileSync("src/styles/base.css", "utf8");
    expect(popups).toMatch(/html\[data-slide\]::view-transition-old\(root\), html\[data-slide\]::view-transition-new\(root\) \{ animation: var\(--motion-settle\) var\(--ease-settle\) both;/);
    for (const name of ["app-header", "app-nav", "app-rail"]) expect(popups).toMatch(new RegExp(`::view-transition-old\\(${name}\\)[^{]*\\{ display: none; \\}`));
    expect(base).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^@]*::view-transition-group\(\*\), ::view-transition-old\(\*\), ::view-transition-new\(\*\) \{ animation-duration: \.01ms !important; \}/);
  });
});
