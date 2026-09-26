"use client";

import { useId, type ReactNode } from "react";
import { connectionDirection, type ConnectionPath, type layoutWorkflowConnections } from "@/lib/workflow-connection-layout";
import styles from "./WorkflowJourney.module.css";

type Edge = ConnectionPath & { enabled: boolean; selected: boolean; description: string; progress?: string; health: string; result?: string };
export function WorkflowGraphEdges({ edges, geometry, width, selectedMix, onSelect, preview }: {
  edges: Edge[]; geometry: ReturnType<typeof layoutWorkflowConnections>; width: number; selectedMix: string;
  onSelect: (id: string) => void; preview: ReactNode;
}) {
  const id = useId().replace(/:/g, "");
  const colors: Record<string, string> = { neutral: "var(--text-3)", incoming: "var(--journey-incoming)", outgoing: "var(--journey-outgoing)", strong: "var(--status-success-ink)", weak: "var(--danger)", active: "var(--violet-mark)" };
  const ordered = [...edges].sort((a, b) => Number(connectionDirection(a, selectedMix) !== "unrelated") - Number(connectionDirection(b, selectedMix) !== "unrelated"));
  return <svg className={styles.edges} width={width} height={geometry.height} aria-label="Configured connections">
    <defs>{Object.entries(colors).map(([name, fill]) => <marker key={name} id={`${id}-${name}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill={fill} /></marker>)}</defs>
    {ordered.map(edge => {
      const shape = geometry.edges.find(item => item.id === edge.id); if (!shape) return null;
      const direction = connectionDirection(edge, selectedMix);
      const color = direction === "return" ? "incoming" : direction === "incoming" || direction === "outgoing" ? direction : edge.selected ? "active" : edge.health === "strong" || edge.health === "weak" ? edge.health : edge.progress === "HELD" ? "weak" : edge.progress ? "active" : "neutral";
      return <g key={edge.id} className={styles.edge} data-workflow-path={edge.id} data-direction={direction} data-selected={edge.selected} data-progress={edge.progress} data-health={edge.health} data-enabled={edge.enabled} role="button" tabIndex={0} aria-pressed={edge.selected} aria-label={edge.description} onClick={() => onSelect(edge.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(edge.id); } }}>
        <title>{edge.description}</title><path d={shape.line} className={styles.edgeHit} /><path d={shape.line} markerEnd={`url(#${id}-${color})`} />
      </g>;
    })}
    {preview}
    <g aria-hidden="true">{ordered.map(edge => {
      const shape = geometry.edges.find(item => item.id === edge.id); if (!shape) return null;
      const direction = connectionDirection(edge, selectedMix), { x, y, width, height } = shape.label;
      return <g key={edge.id} className={styles.edgeLabel} data-workflow-edge-label={edge.id} data-direction={direction} data-selected={edge.selected} onClick={() => onSelect(edge.id)}>
        <rect x={x} y={y} width={width} height={height} rx={7} />
        <text x={x + width / 2} y={y + 20} textAnchor="middle">{shape.lines.map((line, index) => <tspan key={index} x={x + width / 2} dy={index ? 16 : 0}>{line}</tspan>)}{shape.resultLines.map((line, index) => <tspan key={`result-${index}`} className={styles.edgeResult} x={x + width / 2} dy={index ? 16 : 22}>{line}</tspan>)}</text>
      </g>;
    })}</g>
  </svg>;
}
