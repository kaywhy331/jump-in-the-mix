import type { WorkflowRule } from "@/lib/mix-workflow-types";

/** Collapse strongly connected components before ranking; returns never break layout. */
export function layoutWorkflow(mixes: Array<{ id: string; steps: Array<{ id: string }> }>, rules: WorkflowRule[], expanded: Set<string>, minimumNodeHeight = 0) {
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
  const heights = new Map<number, number>();
  const nodes = mixes.map(mix => {
    const rank = ranks[componentOf.get(mix.id)!], height = Math.max(minimumNodeHeight, 195 + (expanded.has(mix.id) ? mix.steps.length * 62 : 0) + rules.filter(rule => rule.source.mixId === mix.id).length * 28);
    const node = { id: mix.id, x: 60 + rank * 390, y: heights.get(rank) ?? 35, width: 280, height };
    heights.set(rank, node.y + height + 100);
    return node;
  });
  return { nodes, width: Math.max(760, ...nodes.map(node => node.x + node.width + 100)), height: Math.max(350, ...nodes.map(node => node.y + node.height + 90)) };
}
