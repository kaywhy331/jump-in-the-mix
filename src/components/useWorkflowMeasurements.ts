"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import type { WorkflowMeasurements } from "@/lib/workflow-connection-layout";

/** Read unscaled boxes, including late pane visibility, font loads and text resizing. */
export function useWorkflowMeasurements(graphRef: RefObject<HTMLDivElement | null>, zoom: number) {
  const [sizes, setSizes] = useState<WorkflowMeasurements>({ nodes: {}, labels: {}, ports: {}, gap: 0, padding: 0 });
  useLayoutEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const measure = () => {
      if (!graph.getBoundingClientRect().width) return;
      const style = getComputedStyle(graph), origin = graph.getBoundingClientRect();
      const next: WorkflowMeasurements = { nodes: {}, labels: {}, ports: {}, gap: parseFloat(style.columnGap), padding: parseFloat(style.paddingTop), viewportHeight: graph.parentElement!.parentElement!.clientHeight };
      graph.querySelectorAll<HTMLElement>("[data-workflow-node], [data-workflow-edge-label]").forEach(element => {
        const id = element.dataset.workflowNode ?? element.dataset.workflowEdgeLabel!;
        if (element.offsetWidth && element.offsetHeight) (element.dataset.workflowNode ? next.nodes : next.labels)[id] = { width: element.offsetWidth, height: element.offsetHeight };
      });
      graph.querySelectorAll<HTMLElement>("[data-workflow-beat], [data-workflow-node] > button").forEach(element => {
        const port = element.dataset.workflowBeat ? null : element.parentElement!.querySelector<HTMLElement>('[data-workflow-port="output"][data-workflow-step=""]');
        const rect = (port ?? element).getBoundingClientRect();
        if (rect.width && rect.height) next.ports[element.dataset.workflowBeat ?? element.parentElement!.dataset.workflowNode!] = (rect.top - origin.top + rect.height / 2) / zoom;
      });
      // Overview labels are hidden, so retain their last measured boxes until they show again.
      setSizes(previous => {
        next.labels = { ...previous.labels, ...next.labels };
        return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(graph);
    observer.observe(graph.parentElement!.parentElement!);
    graph.querySelectorAll("[data-workflow-node], [data-workflow-edge-label]").forEach(element => observer.observe(element));
    document.fonts.addEventListener("loadingdone", measure);
    return () => { observer.disconnect(); document.fonts.removeEventListener("loadingdone", measure); };
  });
  return sizes;
}
