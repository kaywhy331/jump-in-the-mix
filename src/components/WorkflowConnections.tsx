"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { workflowNodeKey, type WorkflowTarget } from "@/lib/mix-workflow-types";
import styles from "@/components/WorkflowJourney.module.css";

type Port = { target: WorkflowTarget; direction: "input" | "output"; label: string };
type Point = { x: number; y: number };
type Selection = { port: Port; element: HTMLButtonElement };

function readPort(element: Element | null, graph: HTMLElement): Selection | null {
  const button = element?.closest<HTMLButtonElement>("button[data-workflow-port]");
  if (!button || button.disabled || !graph.contains(button)) return null;
  return { element: button, port: {
    direction: button.dataset.workflowPort as Port["direction"],
    target: { mixId: button.dataset.workflowMix!, stepId: button.dataset.workflowStep || null },
    label: button.dataset.workflowLabel!,
  } };
}

/** Pointer capture keeps a wire attached while scrolling, even outside its original node. */
export function useWorkflowConnections({ graphRef, canvasRef, enabled, zoom, onConnect }: {
  graphRef: RefObject<HTMLDivElement | null>; canvasRef: RefObject<HTMLDivElement | null>;
  enabled: boolean; zoom: number;
  onConnect: (source: WorkflowTarget, target: WorkflowTarget, origin: HTMLButtonElement) => void;
}) {
  const hintId = useId();
  const [selection, setSelection] = useState<Port | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ from: Point; to: Point } | null>(null);
  const [message, setMessage] = useState("");
  const cancelRef = useRef<() => void>(() => {});

  useEffect(() => {
    const graph = graphRef.current, canvas = canvasRef.current;
    if (!enabled || !graph || !canvas) return;
    let pending: Selection | null = null;
    let drag: { start: Selection; pointerId: number; x: number; y: number; startX: number; startY: number; moved: boolean } | null = null;
    let frame = 0, suppressClick = false;
    const release = () => {
      cancelAnimationFrame(frame); frame = 0;
      const active = drag; drag = null;
      if (active?.start.element.hasPointerCapture(active.pointerId)) active.start.element.releasePointerCapture(active.pointerId);
    };
    const clear = () => { release(); pending = null; setSelection(null); setHover(null); setPreview(null); };
    const cancel = () => { const origin = pending?.element ?? drag?.start.element; clear(); setMessage("Connection canceled. Nothing was changed."); origin?.focus({ preventScroll: true }); };
    cancelRef.current = cancel;
    const choose = (value: Selection) => {
      pending = value; setSelection(value.port);
      setMessage(value.port.direction === "output" ? `From ${value.port.label}. Choose an input point on the left of a Mix or Beat. Escape cancels.` : `To ${value.port.label}. Choose an output point on the right of a Mix or Beat. Escape cancels.`);
    };
    const complete = (start: Selection, finish: Selection) => {
      const source = start.port.direction === "output" ? start.port.target : finish.port.target;
      const target = start.port.direction === "input" ? start.port.target : finish.port.target;
      clear(); setMessage("Connection selected. Review its settings and save.");
      onConnect(source, target, start.element);
    };
    const hit = (x: number, y: number, start: Selection) => {
      const candidate = readPort(document.elementFromPoint(x, y), graph);
      return candidate && candidate.port.direction !== start.port.direction ? candidate : null;
    };
    const draw = () => {
      if (!drag?.moved) return;
      const bounds = canvas.getBoundingClientRect();
      // Only pan when the pointer is inside the canvas, so an outside drop always cancels.
      if (!hit(drag.x, drag.y, drag.start) && drag.x >= bounds.left && drag.x <= bounds.right && drag.y >= bounds.top && drag.y <= bounds.bottom) {
        const speed = (value: number, low: number, high: number) => value < low + 32 ? -Math.min(12, (low + 32 - value) / 2) : value > high - 32 ? Math.min(12, (value - high + 32) / 2) : 0;
        canvas.scrollLeft += speed(drag.x, bounds.left, bounds.right);
        canvas.scrollTop += speed(drag.y, bounds.top, bounds.bottom);
      }
      const finish = hit(drag.x, drag.y, drag.start);
      const origin = graph.getBoundingClientRect(), a = drag.start.element.getBoundingClientRect(), b = finish?.element.getBoundingClientRect();
      const start = { x: (a.left + a.width / 2 - origin.left) / zoom, y: (a.top + a.height / 2 - origin.top) / zoom };
      const end = { x: ((b ? b.left + b.width / 2 : drag.x) - origin.left) / zoom, y: ((b ? b.top + b.height / 2 : drag.y) - origin.top) / zoom };
      setPreview(drag.start.port.direction === "output" ? { from: start, to: end } : { from: end, to: start });
      setHover(finish ? `${finish.port.direction}:${workflowNodeKey(finish.port.target)}` : null);
      frame = requestAnimationFrame(draw);
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary || drag) return;
      const start = readPort(event.target as Element, graph); if (!start) return;
      suppressClick = false;
      drag = { start, pointerId: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
      start.element.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.x = event.clientX; drag.y = event.clientY;
      if (!drag.moved && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 6) {
        drag.moved = true; choose(drag.start); frame = requestAnimationFrame(draw);
      }
      if (drag.moved) event.preventDefault();
    };
    const up = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const { start, moved } = drag;
      if (!moved) { release(); return; } // A normal click is also the touch/keyboard alternative.
      suppressClick = true;
      const finish = hit(event.clientX, event.clientY, start);
      if (finish) complete(start, finish); else cancel();
    };
    const click = (event: MouseEvent) => {
      const next = readPort(event.target as Element, graph); if (!next) return;
      if (suppressClick && event.detail > 0) { suppressClick = false; event.preventDefault(); return; }
      if (pending && next.port.direction !== pending.port.direction) complete(pending, next);
      else if (pending?.element === next.element) cancel();
      else choose(next);
    };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && (pending || drag)) { event.preventDefault(); suppressClick = true; cancel(); } };
    const interrupted = (event: PointerEvent) => { if (drag?.pointerId === event.pointerId) { suppressClick = true; cancel(); } };
    const blur = () => { if (pending || drag) cancel(); };
    graph.addEventListener("pointerdown", down); graph.addEventListener("pointermove", move); graph.addEventListener("pointerup", up);
    graph.addEventListener("pointercancel", interrupted); graph.addEventListener("lostpointercapture", interrupted); graph.addEventListener("click", click);
    window.addEventListener("keydown", key); window.addEventListener("blur", blur);
    return () => {
      graph.removeEventListener("pointerdown", down); graph.removeEventListener("pointermove", move); graph.removeEventListener("pointerup", up);
      graph.removeEventListener("pointercancel", interrupted); graph.removeEventListener("lostpointercapture", interrupted); graph.removeEventListener("click", click);
      window.removeEventListener("keydown", key); window.removeEventListener("blur", blur);
      clear(); cancelRef.current = () => {};
    };
  }, [enabled, zoom, graphRef, canvasRef, onConnect]);

  const port = (target: WorkflowTarget, label: string, direction: Port["direction"]) => <button
    type="button" className={styles.connectionPort} disabled={!enabled}
    data-workflow-port={direction} data-workflow-mix={target.mixId} data-workflow-step={target.stepId ?? ""} data-workflow-label={label}
    data-chosen={selection?.direction === direction && workflowNodeKey(selection.target) === workflowNodeKey(target)}
    data-compatible={Boolean(selection && selection.direction !== direction)}
    data-hover={hover === `${direction}:${workflowNodeKey(target)}`}
    aria-label={`Connect ${direction === "output" ? "from" : "to"} ${label}`} aria-describedby={hintId}
    aria-pressed={selection?.direction === direction && workflowNodeKey(selection.target) === workflowNodeKey(target)}
    title={`${direction === "output" ? "Output" : "Input"}: ${label}. Drag or select to connect.`}
  ><span aria-hidden="true">{direction === "output" ? "+" : "→"}</span></button>;

  return {
    port, active: Boolean(selection),
    hint: <div className={styles.connectionHint} data-active={Boolean(selection)}>
      <span id={hintId}>{enabled ? "Drag points to connect." : "Save or cancel to connect again."}</span>
      <button type="button" className="text-button" style={{ visibility: selection ? "visible" : "hidden" }} disabled={!selection} onClick={() => cancelRef.current()}>Cancel connection</button>
      <span className="sr-only" role="status" aria-live="polite">{message}</span>
    </div>,
    preview: preview && <path className={styles.connectionPreview} data-ready={Boolean(hover)} aria-hidden="true"
      d={`M${preview.from.x},${preview.from.y} C${preview.from.x + 70},${preview.from.y} ${preview.to.x - 70},${preview.to.y} ${preview.to.x},${preview.to.y}`} />,
  };
}
