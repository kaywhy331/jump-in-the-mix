"use client";

import { useEffect, useState, type RefObject } from "react";

/** Where a plain left drag must stay a click, a connection drag or text entry instead of moving the map. */
const INTERACTIVE = "button, a, input, select, textarea, summary, label, [role=button], [data-workflow-path], [data-workflow-edge-label], [contenteditable=true]";

/**
 * Flowchart-style panning for a scrollable canvas. Drag the empty background, hold Space and
 * drag anywhere, or drag with the middle mouse button. Touch keeps the browser's own drag
 * scrolling, which already moves the map, so connection points keep their touch drag. A drag
 * that moved never also counts as a click.
 */
export function useCanvasPan(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  const [mode, setMode] = useState<"" | "ready" | "active">("");
  useEffect(() => {
    const canvas = ref.current; if (!canvas || !enabled) return;
    let drag: { id: number; x: number; y: number; left: number; top: number; moved: boolean; immediate: boolean } | null = null;
    let space = false, over = false, suppressClick = false;
    const typing = () => Boolean(document.activeElement?.closest("input, textarea, select, [contenteditable=true]"));
    const show = () => setMode(drag?.moved ? "active" : space ? "ready" : "");
    const keydown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || (!over && !drag) || typing()) return;
      event.preventDefault(); // Space would otherwise scroll the page or press the focused button.
      if (!space) { space = true; show(); }
    };
    const keyup = (event: KeyboardEvent) => { if (event.code === "Space" && space) { space = false; show(); } };
    const down = (event: PointerEvent) => {
      if (event.pointerType === "touch" || !event.isPrimary || drag) return;
      const middle = event.button === 1, withSpace = event.button === 0 && space;
      const background = event.button === 0 && !(event.target as Element).closest(INTERACTIVE);
      if (!middle && !withSpace && !background) return;
      if (middle || withSpace) { event.preventDefault(); event.stopPropagation(); } // No autoscroll, click or connection drag.
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: canvas.scrollLeft, top: canvas.scrollTop, moved: false, immediate: middle || withSpace };
    };
    const move = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.moved && (drag.immediate || Math.hypot(dx, dy) > 4)) { drag.moved = true; canvas.setPointerCapture(event.pointerId); show(); }
      if (!drag.moved) return;
      event.preventDefault();
      canvas.scrollLeft = drag.left - dx; canvas.scrollTop = drag.top - dy;
    };
    const end = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return;
      if (drag.moved) suppressClick = true;
      drag = null; show();
    };
    const click = (event: MouseEvent) => { if (suppressClick) { suppressClick = false; event.preventDefault(); event.stopPropagation(); } };
    const auxclick = (event: MouseEvent) => { if (event.button === 1) event.preventDefault(); };
    const enter = () => { over = true; }, leave = () => { over = false; };
    const blur = () => { space = false; drag = null; show(); };
    canvas.addEventListener("pointerdown", down, true); canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("click", click, true); canvas.addEventListener("auxclick", auxclick); canvas.addEventListener("pointerenter", enter); canvas.addEventListener("pointerleave", leave);
    window.addEventListener("keydown", keydown); window.addEventListener("keyup", keyup); window.addEventListener("blur", blur);
    return () => {
      canvas.removeEventListener("pointerdown", down, true); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", end); canvas.removeEventListener("pointercancel", end);
      canvas.removeEventListener("click", click, true); canvas.removeEventListener("auxclick", auxclick); canvas.removeEventListener("pointerenter", enter); canvas.removeEventListener("pointerleave", leave);
      window.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup); window.removeEventListener("blur", blur);
    };
  }, [ref, enabled]);
  return mode;
}
