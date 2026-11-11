/**
 * The one gesture engine every swipe uses (docs/design/NATIVE-NAVIGATION.md §6, JITM-08 §2.46–§2.48).
 * This module holds the thresholds, the state machine and the start rules. It writes nothing to the page,
 * so the rules run in unit tests as they run in `useSwipe`.
 *
 * Touch-action is declared per surface in CSS, not here: a sheet's grip (handle and header) has
 * `touch-action: none`, a surface that owns horizontal swipes has `pan-y`, and a page never has `none`.
 */

/** Thresholds, in one place. */
export const SWIPE = {
  /** Travel before the axis is decided. Nothing moves until then. */
  axisLock: 10,
  /** The left and right screen edges belong to the system's own gestures. */
  edge: 24,
  /** A release at this speed or faster commits whatever the distance, in px/ms… */
  fling: 0.5,
  /** …measured over the last 100 ms before release. */
  flingWindow: 100,
  /** A release past this share of the viewport width (x) or of the sheet's height (y) commits. */
  commit: { x: 0.35, y: 0.3 }
} as const;

export type Axis = "x" | "y";
/** 1: toward the right or down. -1: toward the left or up. */
export type Direction = 1 | -1;
export type SwipePhase = "idle" | "pending" | "dragging" | "settling";
export type SwipeRelease = "commit" | "cancel";

/**
 * Idle → Pending on a touch → Dragging once 10 px of travel locks this gesture's axis and direction →
 * Settling on release (commit or cancel) → Idle. Any other first movement leaves the touch to native
 * scrolling. A second pointer or a cancelled pointer springs back, and a new touch catches a settling surface.
 */
export class SwipeTracker {
  phase: SwipePhase = "idle";
  /** How far the surface has moved in the gesture's direction, in px. Never negative. */
  distance = 0;
  private pointer: number | null = null;
  private origin = { x: 0, y: 0 };
  private delta = { x: 0, y: 0 };
  private base = 0;
  private samples: Array<{ t: number; distance: number }> = [];

  constructor(readonly axis: Axis, readonly direction: Direction) {}

  /** A pointer went down. `at` is where a settling surface is now, when this touch catches it. */
  down(pointer: number, x: number, y: number, t: number, at = this.distance): SwipePhase {
    // A second finger cancels, so pinch zoom stays the browser's.
    if (this.pointer !== null) { this.cancel(this.pointer); return this.phase; }
    const resume = this.phase === "settling";
    this.pointer = pointer;
    this.origin = { x, y };
    this.delta = { x: 0, y: 0 };
    this.base = resume ? Math.max(0, at) : 0;
    this.distance = this.base;
    this.samples = [{ t, distance: this.base }];
    this.phase = resume ? "dragging" : "pending";
    return this.phase;
  }

  move(pointer: number, x: number, y: number, t: number): SwipePhase {
    if (pointer !== this.pointer) return this.phase;
    this.delta = { x: x - this.origin.x, y: y - this.origin.y };
    if (this.phase === "pending") {
      if (Math.max(Math.abs(this.delta.x), Math.abs(this.delta.y)) < SWIPE.axisLock) return this.phase;
      const axis: Axis = Math.abs(this.delta.x) > Math.abs(this.delta.y) ? "x" : "y";
      // Another axis, or this axis the other way, is native scrolling for the rest of the touch.
      if (axis !== this.axis || Math.sign(this.delta[axis]) !== this.direction) return this.reset();
      this.phase = "dragging";
    }
    if (this.phase !== "dragging") return this.phase;
    // Follow the finger 1:1, never past the resting position.
    this.distance = Math.max(0, this.base + this.direction * this.delta[this.axis]);
    this.samples.push({ t, distance: this.distance });
    this.samples = this.samples.filter(sample => t - sample.t <= SWIPE.flingWindow);
    return this.phase;
  }

  /** While Pending, whether the touch so far leans this gesture's way. Used to keep the browser from claiming it. */
  leaning(): boolean {
    const along = this.direction * this.delta[this.axis];
    return this.phase === "dragging" || (this.phase === "pending" && along > 0 && along >= Math.abs(this.delta[this.axis === "x" ? "y" : "x"]));
  }

  /** Speed in the gesture's direction over the last 100 ms, in px/ms. */
  velocity(): number {
    const first = this.samples[0], last = this.samples[this.samples.length - 1];
    return first && last && last.t > first.t ? (last.distance - first.distance) / (last.t - first.t) : 0;
  }

  /** The pointer lifted. Returns how the surface settles, or null when the touch never dragged: a tap does nothing. */
  up(pointer: number, x: number, y: number, t: number, size: number): SwipeRelease | null {
    if (pointer !== this.pointer) return null;
    this.move(pointer, x, y, t);
    if (this.phase !== "dragging") { this.reset(); return null; }
    const speed = this.velocity();
    // Nothing commits before release, and dragging or flinging back cancels (WCAG 2.5.2).
    const commit = speed >= SWIPE.fling || (this.distance >= size * SWIPE.commit[this.axis] && speed > -SWIPE.fling);
    this.pointer = null;
    this.phase = "settling";
    return commit ? "commit" : "cancel";
  }

  /** `pointercancel`, a second finger, or anything else that takes the touch: spring back, nothing happens. */
  cancel(pointer: number): SwipeRelease | null {
    if (pointer !== this.pointer) return null;
    if (this.phase !== "dragging") { this.reset(); return null; }
    this.pointer = null;
    this.phase = "settling";
    return "cancel";
  }

  /** The settle or spring-back ended. */
  settled(): void {
    this.reset();
    this.distance = 0;
  }

  private reset(): SwipePhase {
    this.pointer = null;
    this.samples = [];
    this.phase = "idle";
    return this.phase;
  }
}

/** Never a gesture start: fields, sliders, contenteditable and anything opted out (NATIVE-NAVIGATION.md §4). */
export const SWIPE_IGNORE = "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='slider'], [data-swipe-ignore]";

/** The little of the DOM these rules read, so they run in unit tests without a browser. */
export interface SwipeNode {
  parentElement: SwipeNode | null;
  closest(selectors: string): unknown;
  scrollTop: number;
  scrollWidth: number;
  clientWidth: number;
}

/** Why a touch at `x` on `target` may not start a gesture on `surface`, or null when it may. */
export function blockedStart(target: SwipeNode, surface: SwipeNode, x: number, viewportWidth: number, overflowX: (node: SwipeNode) => string): "ignored" | "edge" | "scroller" | null {
  if (target.closest(SWIPE_IGNORE)) return "ignored";
  if (x < SWIPE.edge || x > viewportWidth - SWIPE.edge) return "edge";
  for (let node: SwipeNode | null = target; node && node !== surface; node = node.parentElement) {
    if (node.scrollWidth > node.clientWidth && /auto|scroll/.test(overflowX(node))) return "scroller";
  }
  return null;
}

/** Inner scroll goes first: whether the target or a scroller around it, up to and including the surface, is scrolled down. */
export function scrolledBelowTop(target: SwipeNode, surface: SwipeNode): boolean {
  for (let node: SwipeNode | null = target; node; node = node === surface ? null : node.parentElement) {
    if (node.scrollTop > 0) return true;
  }
  return false;
}

/** A motion token's duration in ms (JITM-06 §2.39). Under reduced motion every settle is instant. */
export function motionMs(token: string, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  const match = /^\s*([\d.]+)(ms|s)\s*$/.exec(token);
  return match ? Number(match[1]) * (match[2] === "s" ? 1000 : 1) : 0;
}
