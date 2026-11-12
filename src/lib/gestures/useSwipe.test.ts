import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real rule, observed: every event path must reach it (JITM-NAV-01-R2, NAV-QA-02).
vi.mock("@/lib/gestures/swipe", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/gestures/swipe")>();
  return { ...actual, arbitrate: vi.fn(actual.arbitrate) };
});
import { SWIPE, arbitrate, scrolledBelowTop, type SwipeNode } from "@/lib/gestures/swipe";
import { bindSwipe, type SwipeOptions } from "@/lib/gestures/useSwipe";

/**
 * The little of the DOM the engine's listeners touch, with capture and bubble propagation, so an event fired on the
 * backdrop reaches the page's capture listeners as it does in a browser. The browser runs are in e2e/sheet-swipe.spec.ts.
 */
type Listener = { listener: EventListener; capture: boolean };
class FakeNode {
  parentNode: FakeNode | null = null;
  readonly listeners = new Map<string, Listener[]>();
  addEventListener(type: string, listener: EventListener, init: AddEventListenerOptions = {}) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), { listener, capture: init.capture === true }]);
  }
  removeEventListener(type: string, listener: EventListener, init: AddEventListenerOptions = {}) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter(entry => entry.listener !== listener || entry.capture !== (init.capture === true)));
  }
  get listenerCount() { return [...this.listeners.values()].reduce((sum, entries) => sum + entries.length, 0); }
}
class FakeDocument extends FakeNode {}
class FakeElement extends FakeNode {
  style = { transform: "" };
  dataset: Record<string, string> = {};
  scrollTop = 0;
  scrollLeft = 0;
  scrollWidth = 0;
  clientWidth = 0;
  offsetHeight = 600;
  constructor(readonly tag: string, parent: FakeNode, readonly ownerDocument: FakeDocument) { super(); this.parentNode = parent; }
  get parentElement(): FakeElement | null { return this.parentNode instanceof FakeElement ? this.parentNode : null; }
  closest(selectors: string): FakeElement | null {
    const tags = selectors.split(",").map(part => part.trim());
    for (let node: FakeElement | null = this; node; node = node.parentElement) if (tags.includes(node.tag)) return node;
    return null;
  }
  setPointerCapture() { /* The engine captures the dragging pointer. */ }
}

/** Fires `type` at `target` through the capture phase, the target and the bubble phase. */
function fire(target: FakeNode, type: string, props: Record<string, unknown> = {}) {
  const path: FakeNode[] = [];
  for (let node: FakeNode | null = target; node; node = node.parentNode) path.unshift(node);
  const event = { type, target, cancelable: true, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...props };
  const run = (node: FakeNode, capture: boolean | null) => {
    for (const entry of node.listeners.get(type) ?? []) if (capture === null || entry.capture === capture) entry.listener(event as unknown as Event);
  };
  for (const node of path.slice(0, -1)) run(node, true);
  run(target, null);
  for (const node of path.slice(0, -1).reverse()) run(node, false);
  return event;
}

// Settle and spring-back durations from the design tokens, as the engine reads them from the page.
const tokens = readFileSync("src/styles/design-tokens.css", "utf8");
const token = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(tokens)?.[1] ?? "";

let page: FakeDocument, body: FakeElement, backdrop: FakeElement, surface: FakeElement, grip: FakeElement, content: FakeElement, frames: Array<() => void>;
let unbind: () => void, onCommit: ReturnType<typeof vi.fn<() => unknown>>, time = 0;
const SIZE = 600;
const x = 200;

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(arbitrate).mockClear();
  frames = [];
  time = 0;
  page = new FakeDocument();
  const html = new FakeElement("html", page, page);
  body = new FakeElement("body", html, page);
  // The sheet's dialog fills the screen: a touch on its backdrop targets the dialog itself.
  backdrop = new FakeElement("dialog", body, page);
  surface = new FakeElement("div", backdrop, page);
  surface.offsetHeight = SIZE;
  grip = new FakeElement("header", surface, page);
  content = new FakeElement("div", surface, page);
  vi.stubGlobal("Element", FakeElement);
  vi.stubGlobal("window", {
    matchMedia: (query: string) => ({ matches: query.includes("coarse") }),
    innerWidth: 400,
    requestAnimationFrame: (callback: () => void) => frames.push(callback),
    cancelAnimationFrame: () => undefined,
    setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms),
    clearTimeout: (id: number) => clearTimeout(id),
    TouchEvent: class {}
  });
  vi.stubGlobal("getComputedStyle", (element: FakeElement) => ({
    transform: element.style.transform || "none",
    overflowX: "visible",
    getPropertyValue: (name: string) => token(name)
  }));
  onCommit = vi.fn<() => unknown>();
  const options: SwipeOptions = {
    axis: "y",
    direction: 1,
    active: () => true,
    // As a sheet does: content below its top scrolls first; the grip never does.
    scrollsFirst: target => (target as unknown as FakeElement).tag !== "header" && scrolledBelowTop(target as unknown as SwipeNode, surface as unknown as SwipeNode),
    size: () => SIZE,
    onCommit
  };
  unbind = bindSwipe(surface as unknown as HTMLElement, { current: options });
});
afterEach(() => {
  unbind();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const point = (y: number, more: Record<string, unknown> = {}) => ({ clientX: x, clientY: y, timeStamp: time += 10, ...more });
const touches = (...ys: number[]) => ys.map(y => ({ clientX: x, clientY: y }));
const paint = () => { const pending = frames; frames = []; for (const frame of pending) frame(); };
const state = () => surface.dataset.swipeState ?? "";
const claims = () => vi.mocked(arbitrate).mock.results.map(result => result.value);

/**
 * The QA's reproduction (NAV-QA-02): a touch on the body, scrolled 80 px, pulls down. Native scrolling takes it, so
 * the browser cancels its pointer; Touch Events follow it to the top, where the same touch drags the sheet.
 * `handOff: false` stops while native scrolling still has the touch.
 */
function pullFromScrolledBody({ handOff = true, travel = 190 } = {}) {
  content.scrollTop = 80;
  let y = 300;
  fire(content, "pointerdown", point(y, { pointerId: 1, isPrimary: true, pointerType: "touch", button: 0 }));
  fire(content, "touchstart", { touches: touches(y), changedTouches: touches(y), timeStamp: time });
  fire(content, "pointercancel", point(y, { pointerId: 1 }));
  for (let step = 10; step <= travel; step += 10) {
    y += 10;
    // Native scrolling moves the content toward its top until it gets there.
    content.scrollTop = Math.max(0, 80 - step);
    if (!handOff && content.scrollTop === 0) { content.scrollTop = 10; break; }
    fire(content, "touchmove", { touches: touches(y), changedTouches: touches(y), timeStamp: time += 10 });
  }
  paint();
  return y;
}
/** A touch on the grip, followed through Pointer Events, dragged 80 px. */
function dragGrip() {
  let y = 100;
  fire(grip, "pointerdown", point(y, { pointerId: 1, isPrimary: true, pointerType: "touch", button: 0 }));
  fire(grip, "touchstart", { touches: touches(y), changedTouches: touches(y), timeStamp: time });
  for (let step = 0; step < 8; step++) fire(grip, "pointermove", point(y += 10, { pointerId: 1 }));
  paint();
}
/** The first finger keeps pulling, then lifts: after a cancel it drives nothing. */
function keepPulling(from: number, by = SIZE) {
  let y = from;
  for (let step = 0; step < by / 10; step++) { y += 10; fire(content, "touchmove", { touches: touches(y), changedTouches: touches(y), timeStamp: time += 10 }); }
  paint();
  fire(content, "touchend", { touches: [], changedTouches: touches(y), timeStamp: time += 200 });
}
/** Springs back with the --motion-cancel token, then rests, and nothing commits. */
function expectSpringBack() {
  expect(state()).toBe("cancel");
  expect(surface.style.transform).toBe("translate3d(0, 0px, 0)");
  vi.runAllTimers();
  expect(state()).toBe("");
  expect(surface.style.transform).toBe("");
  expect(onCommit).not.toHaveBeenCalled();
}

describe("the scroll hand-off the QA reproduced", () => {
  it("follows the touch through native scrolling, past the browser's pointercancel, and drags from the top", () => {
    pullFromScrolledBody();
    expect(state()).toBe("dragging");
    // Native scrolling had the travel up to its last step before the top, 70 px in; the sheet follows 1:1 from there.
    expect(surface.style.transform).toBe(`translate3d(0, ${190 - 70}px, 0)`);
    expect(190 - 70).toBeGreaterThanOrEqual(SWIPE.axisLock);
    // The touch's own pointercancel is the browser taking it for scrolling, not another contact.
    expect(claims()).toEqual(["scroll"]);
  });
});

describe("every event path that reports another contact reaches the one arbitration rule and springs back", () => {
  // Landing spots for the other finger: the backdrop outside the sheet, inside the sheet, and another layer.
  const elsewhere = () => ({ backdrop, panel: content, layer: new FakeElement("div", body, page) });

  for (const travel of [190, 390]) {
    for (const where of ["backdrop", "panel", "layer"] as const) {
      it(`touchstart with two touches and no pointer, on the ${where}, after the hand-off of a ${travel} px pull`, () => {
        const y = pullFromScrolledBody({ travel });
        expect(state()).toBe("dragging");
        vi.mocked(arbitrate).mockClear();
        fire(elsewhere()[where], "touchstart", { touches: touches(y, 5), changedTouches: touches(5), timeStamp: time += 10 });
        expect(vi.mocked(arbitrate).mock.calls[0]?.[0]).toBe("dragging");
        expect(claims()).toEqual(["cancel"]);
        expectSpringBack();
        keepPulling(y);
        expect(state()).toBe("");
        expect(onCommit).not.toHaveBeenCalled();
      });
    }
  }

  for (const where of ["backdrop", "panel", "layer"] as const) {
    it(`touchstart with two touches on the ${where} before the hand-off lets the touch go for good`, () => {
      const y = pullFromScrolledBody({ handOff: false });
      expect(state()).toBe("");
      vi.mocked(arbitrate).mockClear();
      fire(elsewhere()[where], "touchstart", { touches: touches(y, 5), changedTouches: touches(5), timeStamp: time += 10 });
      expect(vi.mocked(arbitrate).mock.calls[0]?.[0]).toBe("pending");
      expect(claims()).toEqual(["cancel"]);
      // The other finger lifts; the first reaches the top and keeps pulling. Nothing moves.
      fire(elsewhere()[where], "touchend", { touches: touches(y), changedTouches: touches(5), timeStamp: time += 10 });
      content.scrollTop = 0;
      keepPulling(y);
      expect(state()).toBe("");
      expect(surface.style.transform).toBe("");
      expect(onCommit).not.toHaveBeenCalled();
    });
  }

  it("touchmove with two touches, when the browser reported no touchstart for the other finger", () => {
    const y = pullFromScrolledBody();
    vi.mocked(arbitrate).mockClear();
    fire(content, "touchmove", { touches: touches(y + 10, 5), changedTouches: touches(y + 10), timeStamp: time += 10 });
    expect(claims()).toEqual(["cancel"]);
    expectSpringBack();
  });

  it("another pointer going down, on the backdrop, after the hand-off and on the grip", () => {
    const y = pullFromScrolledBody();
    vi.mocked(arbitrate).mockClear();
    fire(backdrop, "pointerdown", point(5, { pointerId: 2, isPrimary: false, pointerType: "touch", button: 0 }));
    expect(claims()).toEqual(["cancel"]);
    expectSpringBack();
    keepPulling(y);
    expect(state()).toBe("");

    dragGrip();
    expect(state()).toBe("dragging");
    vi.mocked(arbitrate).mockClear();
    fire(backdrop, "pointerdown", point(5, { pointerId: 3, isPrimary: false, pointerType: "touch", button: 0 }));
    expect(claims()).toEqual(["cancel"]);
    expectSpringBack();
  });

  it("pointercancel of any other pointer after the hand-off, and of the held pointer on the grip", () => {
    pullFromScrolledBody();
    vi.mocked(arbitrate).mockClear();
    fire(backdrop, "pointercancel", point(5, { pointerId: 2 }));
    expect(claims()).toEqual(["cancel"]);
    expectSpringBack();

    dragGrip();
    vi.mocked(arbitrate).mockClear();
    fire(grip, "pointercancel", point(180, { pointerId: 1 }));
    expect(claims()).toEqual(["cancel"]);
    expectSpringBack();
  });

  it("touchcancel, during native scrolling and after the hand-off, wherever it is reported", () => {
    pullFromScrolledBody({ handOff: false });
    vi.mocked(arbitrate).mockClear();
    fire(content, "touchcancel", { touches: [], changedTouches: touches(300), timeStamp: time += 10 });
    expect(claims()).toEqual(["cancel"]);
    expect(state()).toBe("");

    pullFromScrolledBody();
    expect(state()).toBe("dragging");
    vi.mocked(arbitrate).mockClear();
    fire(backdrop, "touchcancel", { touches: [], changedTouches: touches(5), timeStamp: time += 10 });
    expect(claims()).toEqual(["cancel"]);
    expectSpringBack();
  });

  it("springs back once when the browser reports the same finger through both streams", () => {
    const y = pullFromScrolledBody();
    vi.mocked(arbitrate).mockClear();
    fire(backdrop, "pointerdown", point(5, { pointerId: 2, isPrimary: false, pointerType: "touch", button: 0 }));
    fire(backdrop, "touchstart", { touches: touches(y, 5), changedTouches: touches(5), timeStamp: time += 10 });
    fire(content, "touchmove", { touches: touches(y + 10, 5), changedTouches: touches(y + 10), timeStamp: time += 10 });
    // The first report cancels; the rest find nothing held.
    expect(claims()).toEqual(["cancel", "native", "native"]);
    expectSpringBack();
  });
});

describe("what is not another contact", () => {
  it("leaves the held touch's own touchstart, and every report with nothing held, alone", () => {
    fire(backdrop, "touchstart", { touches: touches(5, 6), changedTouches: touches(6), timeStamp: time += 10 });
    fire(backdrop, "pointercancel", point(5, { pointerId: 9 }));
    fire(backdrop, "touchcancel", { touches: [], changedTouches: touches(5), timeStamp: time += 10 });
    expect(claims()).toEqual(["native", "native", "native"]);
    pullFromScrolledBody();
    expect(state()).toBe("dragging");
    expect(claims()).toEqual(["native", "native", "native", "scroll"]);
  });

  it("removes every listener it added when unbound", () => {
    unbind();
    expect(page.listenerCount + surface.listenerCount).toBe(0);
    vi.mocked(arbitrate).mockClear();
    fire(backdrop, "touchstart", { touches: touches(5, 6), changedTouches: touches(6), timeStamp: time += 10 });
    expect(claims()).toEqual([]);
    unbind = () => undefined;
  });
});
