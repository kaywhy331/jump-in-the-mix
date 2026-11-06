import type { WorkflowRule } from "@/lib/mix-workflow-types";
import type { WorkflowMeasurements } from "@/lib/workflow-connection-layout";

/** Collapse strongly connected components before ranking; returns never break layout. */
export function layoutWorkflow(mixes: Array<{ id: string; steps: Array<{ id: string }> }>, rules: WorkflowRule[], measurements: WorkflowMeasurements) {
  const ids = new Set(mixes.map(mix => mix.id));
  const edges = new Map(mixes.map(mix => [mix.id, [] as string[]]));
  for (const rule of rules) for (const route of rule.routes) {
    // Explicit bounded return edges remain visible but do not pull the whole
    // account into one layout column. Unmarked cycles still use SCC grouping.
    if (route.maxVisits === null && ids.has(rule.source.mixId) && route.target && ids.has(route.target.mixId)) edges.get(rule.source.mixId)!.push(route.target.mixId);
    if (route.target && rule.join && ids.has(route.target.mixId) && ids.has(rule.join.target.mixId)) edges.get(route.target.mixId)!.push(rule.join.target.mixId);
  }
  let index = 0;
  const indices = new Map<string, number>(), low = new Map<string, number>(), stack: string[] = [], pending = new Set<string>(), components: string[][] = [];
  const visit = (node: string) => {
    indices.set(node, index); low.set(node, index++); stack.push(node); pending.add(node);
    for (const next of edges.get(node) ?? []) {
      if (!indices.has(next)) { visit(next); low.set(node, Math.min(low.get(node)!, low.get(next)!)); }
      else if (pending.has(next)) low.set(node, Math.min(low.get(node)!, indices.get(next)!));
    }
    if (low.get(node) === indices.get(node)) { const component: string[] = []; let next: string; do { next = stack.pop()!; pending.delete(next); component.push(next); } while (next !== node); components.push(component); }
  };
  for (const mix of mixes) if (!indices.has(mix.id)) visit(mix.id);
  const componentOf = new Map(components.flatMap((component, i) => component.map(id => [id, i] as const)));
  const ranks = components.map(() => 0);
  for (let pass = 0; pass < components.length; pass++) for (const [source, targets] of edges) for (const target of targets) {
    const a = componentOf.get(source)!, b = componentOf.get(target)!;
    if (a !== b) ranks[b] = Math.max(ranks[b], ranks[a] + 1);
  }
  const { gap, padding } = measurements;
  const columnWidths = new Map<number, number>();
  for (const mix of mixes) {
    const rank = ranks[componentOf.get(mix.id)!];
    columnWidths.set(rank, Math.max(columnWidths.get(rank) ?? 0, measurements.nodes[mix.id]?.width ?? 0));
  }
  const labelWidth = Math.max(0, ...Object.values(measurements.labels).map(label => label.width));
  const columns = new Map<number, number>();
  let x = padding;
  for (const rank of [...columnWidths.keys()].sort((a, b) => a - b)) { columns.set(rank, x); x += columnWidths.get(rank)! + labelWidth + gap * 2; }
  const heights = new Map<number, number>();
  const nodes = mixes.map(mix => {
    const rank = ranks[componentOf.get(mix.id)!], size = measurements.nodes[mix.id] ?? { width: 0, height: 0 };
    const node = { id: mix.id, x: columns.get(rank)!, y: heights.get(rank) ?? padding, ...size };
    heights.set(rank, node.y + node.height + gap * 2);
    return node;
  });
  return { nodes, width: Math.max(0, ...nodes.map(node => node.x + node.width + padding)), height: Math.max(0, ...nodes.map(node => node.y + node.height + padding)) };
}
