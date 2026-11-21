import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NAV_LINKS } from "@/lib/app-navigation";
import { BACK_CONTROL, SECTION_RING, browserMayHaveAnimated, edgeBackActive, ringNeighbour, ringStop, shownBackControl, slideFor } from "@/lib/back-navigation";
import { readdirSync } from "node:fs";
import { afterEach, vi } from "vitest";
import { goesBack, returnsToOrigin } from "@/lib/back-navigation";
import { APP_SHELL_ROOTS, inAppShell } from "@/lib/app-shell-routes";
import { customerReturnPath } from "@/lib/customer-return-path";

// Back (JITM-08 §2.46, NATIVE-NAVIGATION.md §3 C).
const url = (path: string) => new URL(path, "https://app.test");

describe("back", () => {
  it("knows the section ring's own screens, and treats the Mix editor as a drill-in", () => {
    expect(SECTION_RING).toEqual(["/jumps", "/contacts", "/mixes", "/more"]);
    expect(["/jumps", "/contacts?q=ana", "/mixes?mix=m1", "/more"].map(path => ringStop(url(path)))).toEqual([0, 1, 2, 3]);
    for (const path of ["/contacts/c1", "/mixes?mix=m1&view=edit", "/settings", "/journey?contactId=c1", "/calendar"]) expect(ringStop(url(path)), path).toBe(-1);
  });

  it("reads the ring from the bottom navigation, and steps to the neighbouring stop without wrapping at the ends", () => {
    expect(SECTION_RING).toEqual(NAV_LINKS.filter(link => link.kind === "primary").map(link => link.href));
    // The finger moving left (-1) goes to the next section, moving right (1) to the previous one.
    expect(["/jumps", "/contacts?q=ana", "/mixes?mix=m1", "/more"].map(path => [ringNeighbour(url(path), 1), ringNeighbour(url(path), -1)])).toEqual([
      [null, "/contacts"], ["/jumps", "/mixes"], ["/contacts", "/more"], ["/mixes", null]
    ]);
    // Never from a drill-in or a page off the ring.
    for (const path of ["/contacts/c1", "/mixes?mix=m1&view=edit", "/journey", "/calendar", "/settings"]) expect([ringNeighbour(url(path), 1), ringNeighbour(url(path), -1)], path).toEqual([null, null]);
  });

  it("lets the edge swipe act only while the page shows its Back control: never for history alone, never on a ring stop", () => {
    const control = (rects: number, visible?: boolean) => ({ getClientRects: () => ({ length: rects }), ...(visible === undefined ? {} : { checkVisibility: () => visible }) });
    const shown = control(1), notRendered = control(0), hidden = control(1, false);
    expect(BACK_CONTROL).toBe("[data-back-link]");
    expect(shownBackControl([])).toBeNull();
    expect(shownBackControl([notRendered, hidden])).toBeNull();
    expect(shownBackControl([notRendered, hidden, shown, control(1, true)])).toBe(shown);
    // A drill-in turns it on with its Back control shown, and off without one: none, or one not rendered at this width.
    for (const path of ["/contacts/c1", "/contacts/c1/edit", "/mixes?mix=m1&view=edit", "/settings/business", "/journey?mix=m1"]) {
      expect(edgeBackActive(url(path), shownBackControl([shown])), path).toBe(true);
      expect(edgeBackActive(url(path), shownBackControl([notRendered])), path).toBe(false);
      expect(edgeBackActive(url(path), null), path).toBe(false);
    }
    for (const path of ["/jumps", "/contacts", "/mixes?mix=m1", "/more"]) expect(edgeBackActive(url(path), shown), path).toBe(false);
    // The component asks the rule, with the control it reads when the touch starts, and nothing about history.
    const component = readFileSync("src/components/BackNavigation.tsx", "utf8");
    expect(component).toMatch(/active: \(\) => installedIosApp\(\) && edgeBackActive\(new URL\(location\.href\), backControl\(\)\),/);
    expect(component).not.toMatch(/canGoBack|history\.length/);
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

// Origin Back (JITM-BACK-01): a page reached from several places returns to where the owner came from, when that was a
// page of the app shell, and otherwise opens its fallback parent.
describe("origin back", () => {
  const here = url("/mixes/system");
  const entry = (path: string | null, sameDocument = true) => ({ url: path === null ? null : url(path).href, sameDocument });

  it("goes back only when the previous entry is a page of the app shell; in every other case it opens the fallback", () => {
    // A previous entry inside the shell, shown by this document: back.
    for (const path of ["/jumps", "/more", "/contacts/c1?tab=notes", "/mixes?mix=m1", "/marketplace", "/settings/business"]) expect(returnsToOrigin(entry(path), here), path).toBe(true);
    // No previous entry: the fallback.
    expect(returnsToOrigin(null, here)).toBe(false);
    expect(returnsToOrigin(entry(null), here)).toBe(false);
    // A previous entry on the same origin but outside the shell: the fallback.
    for (const path of ["/onboarding", "/login", "/api/auth/logout", "/", "/jumpsuit", "/admin/templates"]) expect(returnsToOrigin(entry(path), here), path).toBe(false);
    // Another origin: the fallback.
    expect(returnsToOrigin({ url: "https://elsewhere.test/jumps", sameDocument: true }, here)).toBe(false);
    // An entry an earlier document showed (a reload, a redirect, a native form's post), or none the browser can place: the fallback.
    expect(returnsToOrigin(entry("/jumps", false), here)).toBe(false);
    expect(returnsToOrigin({ url: url("/jumps").href }, here)).toBe(false);
    // The same page again, as a submitted form leaves it: the fallback.
    expect(returnsToOrigin(entry("/mixes/system"), url("/mixes/system?revoked=1"))).toBe(false);
  });

  it("decides the shell from one definition: the folders of the app shell, which sign-in returns use as well", () => {
    const folders = readdirSync("src/app/(app)", { withFileTypes: true }).filter(item => item.isDirectory() && /^[a-z]/.test(item.name)).map(item => item.name);
    expect([...APP_SHELL_ROOTS].sort()).toEqual(folders.sort());
    for (const root of APP_SHELL_ROOTS) expect(inAppShell(`/${root}`) && inAppShell(`/${root}/sub?q=1`) && inAppShell(`/${root}#top`), root).toBe(true);
    for (const path of ["/onboarding", "/login", "/jumpsuit", "/api/jumps", "/"]) expect(inAppShell(path), path).toBe(false);
    // Sign-in returns accept the same pages, Marketplace included, and keep no route pattern of their own.
    expect(customerReturnPath("/marketplace?listing=l1")).toBe("/marketplace?listing=l1");
    expect(customerReturnPath("/onboarding")).toBeNull();
    expect(readFileSync("src/lib/customer-return-path.ts", "utf8")).not.toMatch(/jumps\|contacts/);
  });

  describe("the control's return, which its click and the edge swipe both ask", () => {
    afterEach(() => { vi.unstubAllGlobals(); });
    /** A document at `current` whose previous entry is `previous`, as the Navigation API reports them. */
    const browse = (previous: string | null, current: string, sameDocument = true) => {
      const before = previous === null ? [] : [{ key: "previous", url: url(previous).href, index: 0, sameDocument, getState: () => undefined }];
      const now = { key: "current", url: url(current).href, index: before.length, sameDocument: true, getState: () => undefined };
      vi.stubGlobal("location", url(current));
      vi.stubGlobal("window", { navigation: { currentEntry: now, entries: () => [...before, now] } });
    };
    const parent = { dataset: {} }, origin = { dataset: { backReturn: "origin" } };

    it("keeps the default: back only when the previous entry is the control's own page", () => {
      browse("/more", "/mixes/system");
      expect(goesBack(parent, "/more")).toBe(true);
      browse("/jumps", "/mixes/system");
      expect(goesBack(parent, "/more")).toBe(false);
      // The default does not ask which document showed the entry.
      browse("/more", "/settings", false);
      expect(goesBack(parent, "/more")).toBe(true);
      browse(null, "/mixes/system");
      expect(goesBack(parent, "/more")).toBe(false);
    });

    it("in origin mode, back to any page of the shell this document showed, else the fallback", () => {
      for (const previous of ["/jumps", "/more", "/contacts/c1"]) { browse(previous, "/mixes/system"); expect(goesBack(origin, "/more"), previous).toBe(true); }
      for (const [previous, sameDocument] of [["/onboarding", true], ["/jumps", false]] as const) { browse(previous, "/mixes/system", sameDocument); expect(goesBack(origin, "/more"), previous).toBe(false); }
      browse(null, "/mixes/system");
      expect(goesBack(origin, "/more")).toBe(false);
    });
  });
});
