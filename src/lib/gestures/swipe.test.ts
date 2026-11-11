import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SWIPE, SWIPE_IGNORE, SwipeTracker, blockedStart, motionMs, scrolledBelowTop, type SwipeNode } from "@/lib/gestures/swipe";

// A sheet dismiss: vertical, downward, on a 600 px sheet. 30% is 180 px.
const SHEET = 600;
const sheet = () => new SwipeTracker("y", 1);

/** Drag from (0, 0) by `dy` in `steps` moves of `stepMs`, then hold still for `holdMs` and release. */
function drag(tracker: SwipeTracker, dy: number, { steps = 10, stepMs = 40, holdMs = 150, size = SHEET } = {}) {
  let t = 0;
  tracker.down(1, 100, 0, t);
  for (let step = 1; step <= steps; step++) tracker.move(1, 100, (dy * step) / steps, t += stepMs);
  return tracker.up(1, 100, dy, t + holdMs, size);
}

describe("axis lock", () => {
  it("moves nothing until 10 px of travel, then follows the finger 1:1", () => {
    const tracker = sheet();
    tracker.down(1, 100, 100, 0);
    expect(tracker.move(1, 100, 100 + SWIPE.axisLock - 1, 10)).toBe("pending");
    expect(tracker.distance).toBe(0);
    expect(tracker.move(1, 100, 100 + SWIPE.axisLock, 20)).toBe("dragging");
    expect(tracker.distance).toBe(10);
    tracker.move(1, 103, 173, 30);
    expect(tracker.distance).toBe(73);
  });

  it("leaves the other axis and the other direction to native scrolling for the rest of the touch", () => {
    const sideways = sheet();
    sideways.down(1, 100, 100, 0);
    expect(sideways.move(1, 112, 104, 10)).toBe("idle");
    expect(sideways.move(1, 112, 300, 20)).toBe("idle");
    expect(sideways.distance).toBe(0);

    const upward = sheet();
    upward.down(1, 100, 100, 0);
    expect(upward.move(1, 100, 88, 10)).toBe("idle");

    const horizontal = new SwipeTracker("x", -1);
    horizontal.down(1, 200, 100, 0);
    expect(horizontal.move(1, 196, 112, 10)).toBe("idle");
    horizontal.down(2, 200, 100, 20);
    expect(horizontal.move(2, 185, 103, 30)).toBe("dragging");
    expect(horizontal.distance).toBe(15);
  });

  it("leans the gesture's way only while the touch heads that way", () => {
    const tracker = sheet();
    tracker.down(1, 100, 100, 0);
    tracker.move(1, 101, 104, 5);
    expect(tracker.leaning()).toBe(true);
    tracker.move(1, 100, 97, 10);
    expect(tracker.leaning()).toBe(false);
    tracker.move(1, 106, 103, 15);
    expect(tracker.leaning()).toBe(false);
  });

  it("never moves the surface past its resting position", () => {
    const tracker = sheet();
    tracker.down(1, 100, 100, 0);
    tracker.move(1, 100, 160, 10);
    tracker.move(1, 100, 40, 20);
    expect(tracker.distance).toBe(0);
  });
});

describe("commit by distance or velocity", () => {
  it("commits a slow release past 30% of the sheet's height and springs back below it", () => {
    expect(drag(sheet(), SHEET * SWIPE.commit.y)).toBe("commit");
    expect(drag(sheet(), SHEET * SWIPE.commit.y - 1)).toBe("cancel");
  });

  it("measures a horizontal swipe against 35% of the width", () => {
    const width = 400;
    const swipe = (dx: number) => {
      const tracker = new SwipeTracker("x", -1);
      tracker.down(1, 300, 100, 0);
      for (let step = 1; step <= 10; step++) tracker.move(1, 300 - (dx * step) / 10, 100, step * 40);
      return tracker.up(1, 300 - dx, 100, 600, width);
    };
    expect(swipe(width * SWIPE.commit.x)).toBe("commit");
    expect(swipe(width * SWIPE.commit.x - 1)).toBe("cancel");
  });

  it("commits a fling of 0.5 px/ms over the last 100 ms, whatever the distance", () => {
    // 60 px in 100 ms is 0.6 px/ms, far short of 30%.
    expect(drag(sheet(), 60, { steps: 5, stepMs: 20, holdMs: 0 })).toBe("commit");
    // 40 px in 100 ms is 0.4 px/ms.
    expect(drag(sheet(), 40, { steps: 5, stepMs: 20, holdMs: 0 })).toBe("cancel");
  });

  it("measures speed over the last 100 ms only, so a pause before release is not a fling", () => {
    const tracker = sheet();
    expect(drag(tracker, 100, { steps: 5, stepMs: 10, holdMs: SWIPE.flingWindow + 1 })).toBe("cancel");
  });

  it("cancels when the finger flings back toward rest, even past the distance threshold", () => {
    const tracker = sheet();
    tracker.down(1, 100, 0, 0);
    tracker.move(1, 100, 20, 20);
    tracker.move(1, 100, 400, 400);
    tracker.move(1, 100, 340, 450);
    expect(tracker.up(1, 100, 300, 480, SHEET)).toBe("cancel");
  });
});

describe("cancel and spring-back", () => {
  it("springs back on a short release, then rests", () => {
    const tracker = sheet();
    expect(drag(tracker, 50)).toBe("cancel");
    expect(tracker.phase).toBe("settling");
    tracker.settled();
    expect(tracker.phase).toBe("idle");
    expect(tracker.distance).toBe(0);
  });

  it("does nothing for a tap", () => {
    const tracker = sheet();
    tracker.down(1, 100, 100, 0);
    tracker.move(1, 101, 103, 50);
    expect(tracker.up(1, 101, 103, 80, SHEET)).toBeNull();
    expect(tracker.phase).toBe("idle");
  });

  it("springs back on pointercancel and ignores other pointers", () => {
    const dragging = sheet();
    dragging.down(1, 100, 0, 0);
    dragging.move(1, 100, 300, 40);
    expect(dragging.cancel(7)).toBeNull();
    expect(dragging.move(7, 100, 500, 50)).toBe("dragging");
    expect(dragging.distance).toBe(300);
    expect(dragging.cancel(1)).toBe("cancel");
    expect(dragging.phase).toBe("settling");

    const pending = sheet();
    pending.down(1, 100, 0, 0);
    expect(pending.cancel(1)).toBeNull();
    expect(pending.phase).toBe("idle");
  });

  it("cancels on a second finger, so pinch zoom stays the browser's", () => {
    const dragging = sheet();
    dragging.down(1, 100, 0, 0);
    dragging.move(1, 100, 250, 40);
    expect(dragging.down(2, 200, 0, 50)).toBe("settling");
    expect(dragging.up(1, 100, 260, 60, SHEET)).toBeNull();

    const pending = sheet();
    pending.down(1, 100, 0, 0);
    expect(pending.down(2, 200, 0, 10)).toBe("idle");
    expect(pending.move(1, 100, 50, 20)).toBe("idle");
  });

  it("lets a new touch catch a settling surface where it is", () => {
    const tracker = sheet();
    expect(drag(tracker, 50)).toBe("cancel");
    expect(tracker.down(2, 100, 400, 1_000, 30)).toBe("dragging");
    expect(tracker.distance).toBe(30);
    tracker.move(2, 100, 600, 1_040);
    expect(tracker.distance).toBe(230);
    expect(tracker.up(2, 100, 600, 1_200, SHEET)).toBe("commit");
  });
});

/** A structural stand-in for DOM elements, with the selector forms SWIPE_IGNORE uses. */
type Fake = SwipeNode & { tag: string; attrs: Record<string, string>; overflowX: string };
function el(tag: string, attrs: Record<string, string> = {}, parent: Fake | null = null, box: Partial<Pick<Fake, "scrollTop" | "scrollWidth" | "clientWidth" | "overflowX">> = {}): Fake {
  const self: Fake = {
    tag, attrs, parentElement: parent, scrollTop: 0, scrollWidth: 300, clientWidth: 300, overflowX: "visible", ...box,
    closest(selectors: string) {
      for (let node: Fake | null = self; node; node = node.parentElement as Fake | null) if (matches(node, selectors)) return node;
      return null;
    }
  };
  return self;
}
function matches(node: Fake, selectors: string) {
  const attributes = (part = "") => [...part.matchAll(/\[([\w-]+)(?:='([^']*)')?\]/g)]
    .every(([, name, value]) => name in node.attrs && (value === undefined || node.attrs[name] === value));
  return selectors.split(",").some(selector => {
    const parts = /^(\w+)?((?:\[[^\]]+\])*)(?::not\((\[[^\]]+\])\))?$/.exec(selector.trim());
    if (!parts) throw new Error(`Unsupported selector: ${selector}`);
    return (!parts[1] || parts[1] === node.tag) && attributes(parts[2]) && !(parts[3] && attributes(parts[3]));
  });
}
const overflow = (node: SwipeNode) => (node as Fake).overflowX;

describe("start exclusions", () => {
  const surface = el("div");
  const body = el("div", {}, surface);
  const start = (target: Fake, x = 200, width = 400) => blockedStart(target, surface, x, width, overflow);

  it("ignores fields, sliders, contenteditable and anything marked data-swipe-ignore", () => {
    for (const target of [
      el("input", { type: "text" }, body), el("input", { type: "range" }, body), el("textarea", {}, body), el("select", {}, body),
      el("span", {}, el("div", { contenteditable: "true" }, body)), el("div", { role: "slider" }, body),
      el("button", {}, el("div", { "data-swipe-ignore": "" }, body))
    ]) expect(start(target)).toBe("ignored");
    expect(start(el("button", {}, body))).toBeNull();
    expect(start(el("p", { contenteditable: "false" }, body))).toBeNull();
    expect(SWIPE_IGNORE.split(", ")).toEqual(["input", "textarea", "select", "[contenteditable]:not([contenteditable='false'])", "[role='slider']", "[data-swipe-ignore]"]);
  });

  it("leaves the 24 px at each screen edge to the system", () => {
    expect(start(body, SWIPE.edge - 1)).toBe("edge");
    expect(start(body, SWIPE.edge)).toBeNull();
    expect(start(body, 400 - SWIPE.edge)).toBeNull();
    expect(start(body, 400 - SWIPE.edge + 1)).toBe("edge");
  });

  it("leaves anything that can scroll sideways to native scrolling", () => {
    const chips = el("div", {}, body, { scrollWidth: 900, overflowX: "auto" });
    expect(start(el("button", {}, chips))).toBe("scroller");
    expect(start(el("button", {}, el("div", {}, body, { scrollWidth: 900, overflowX: "scroll" })))).toBe("scroller");
    // Clipped overflow cannot be scrolled by hand, and the surface itself is not an inner scroller.
    expect(start(el("button", {}, el("div", {}, body, { scrollWidth: 900, overflowX: "hidden" })))).toBeNull();
    expect(blockedStart(body, el("div", {}, null, { scrollWidth: 900, overflowX: "auto" }), 200, 400, overflow)).toBeNull();
  });
});

describe("inner scroll goes first", () => {
  it("holds dismissal while the sheet or a scroller inside it is below its top", () => {
    const page = el("main", {}, null, { scrollTop: 800 });
    const panel = el("div", {}, page);
    const list = el("div", {}, panel);
    const row = el("button", {}, list);
    expect(scrolledBelowTop(row, panel)).toBe(false);
    panel.scrollTop = 1;
    expect(scrolledBelowTop(row, panel)).toBe(true);
    panel.scrollTop = 0;
    list.scrollTop = 40;
    expect(scrolledBelowTop(row, panel)).toBe(true);
    // iOS reports a negative scrollTop while rubber-banding at the top.
    list.scrollTop = -12;
    expect(scrolledBelowTop(row, panel)).toBe(false);
  });
});

describe("motion", () => {
  const tokens = readFileSync("src/styles/design-tokens.css", "utf8");
  const token = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(tokens)?.[1] ?? "";

  it("settles and springs back with the motion tokens, once, in the design tokens", () => {
    expect(token("--motion-settle")).toBe("220ms");
    expect(token("--motion-cancel")).toBe("180ms");
    expect(token("--ease-settle")).toBe("cubic-bezier(0.32, 0.72, 0, 1)");
    expect(tokens.match(/--motion-settle:/g)).toHaveLength(1);
    expect(motionMs(token("--motion-settle"), false)).toBeGreaterThanOrEqual(200);
    expect(motionMs(token("--motion-settle"), false)).toBeLessThanOrEqual(250);
    expect(motionMs(" .18s", false)).toBe(180);
    expect(motionMs("", false)).toBe(0);
  });

  it("makes every settle instant under reduced motion", () => {
    expect(motionMs(token("--motion-settle"), true)).toBe(0);
    expect(motionMs(token("--motion-cancel"), true)).toBe(0);
    // The CSS settles also fall under the reduced-motion rule, which outranks them.
    expect(readFileSync("src/styles/base.css", "utf8")).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*html \{[^}]*\}\s*\*, \*::before, \*::after \{[^}]*transition-duration: \.01ms !important/);
  });
});

describe("touch-action per surface", () => {
  const popups = readFileSync("src/styles/popups.css", "utf8");

  it("gives a sheet's grip the touch on touch screens, and keeps the body scrolling natively", () => {
    expect(popups).toMatch(/@media \(width < 768px\) and \(pointer: coarse\) \{\s*\.sheet-header, \.quick-add-dialog-header \{ touch-action: none; \}/);
    // On short screens the header scrolls with the body, so it scrolls like the body.
    expect(popups).toMatch(/and \(max-height: 480px\) \{\s*\.sheet-header \{ touch-action: pan-y; \}/);
    for (const state of ["settle", "cancel"]) expect(popups).toMatch(new RegExp(`\\[data-swipe-state="${state}"\\] \\{ transition: transform var\\(--motion-${state}\\) var\\(--ease-settle\\); \\}`));
  });

  it("never sets touch-action: none on a page", () => {
    const styles = readdirSync("src/styles").filter(file => file.endsWith(".css"))
      .map(file => readFileSync(`src/styles/${file}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")).join("\n");
    const blocked = [...styles.matchAll(/([^{}]+)\{[^{}]*touch-action:\s*none/g)].flatMap(([, selector]) => selector.split(",").map(part => part.trim()));
    expect(blocked).toEqual(expect.arrayContaining([".sheet-header", ".quick-add-dialog-header"]));
    // Only grips and handles take the touch from scrolling.
    for (const selector of blocked) expect(selector).toMatch(/-(handle|header)$/);
  });
});
