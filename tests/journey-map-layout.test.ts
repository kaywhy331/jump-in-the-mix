import { describe, expect, it } from "vitest";
import { layoutWorkflow } from "@/lib/mix-workflow-layout";
import { connectionBoxesOverlap, layoutWorkflowConnections, type WorkflowMeasurements } from "@/lib/workflow-connection-layout";
import { fixtureMixes, fixturePaths, journeyMapFixtures } from "./journey-map-fixtures";
import measured from "./journey-map-measurements.json";

type Point = { x: number; y: number };
const fixtures: Record<string, Record<string, WorkflowMeasurements & { before: { crossings: number; nodeOverlaps: number; labelNodeOverlaps: number; labelOverlaps: number } }>> = measured;
// Sample the actual SVG commands, including return curves; count intersecting pairs,
// excluding shared endpoints and collinear strokes. Browser captures sample by arc length.
function points(line: string) {
  const tokens = line.match(/[MCLQ]|-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g)!;
  const result: Point[] = [];
  let start = { x: 0, y: 0 };
  const read = () => ({ x: Number(tokens.shift()), y: Number(tokens.shift()) });
  while (tokens.length) {
    const command = tokens.shift();
    if (command === "M") { start = read(); result.push(start); continue; }
    const controls = Array.from({ length: command === "C" ? 3 : command === "Q" ? 2 : 1 }, read);
    for (let i = 1; i <= 128; i++) {
      let row = [start, ...controls]; const t = i / 128;
      while (row.length > 1) row = row.slice(1).map((b, j) => ({ x: row[j].x * (1 - t) + b.x * t, y: row[j].y * (1 - t) + b.y * t }));
      result.push(row[0]);
    }
    start = controls.at(-1)!;
  }
  return result;
}
const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function crossings(lines: string[]) {
  const paths = lines.map(points);
  return paths.reduce((sum, path, index) => sum + paths.slice(index + 1).filter(other => path.slice(1).some((b, i) => other.slice(1).some((d, j) => {
    const a = path[i], c = other[j];
    return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
  }))).length, 0);
}

describe("measured Journey map layout", () => {
  for (const [name, rules] of Object.entries(journeyMapFixtures)) for (const [scale, sizes] of Object.entries(fixtures[name])) it(`${name} ${scale}: crossings and overlaps never increase`, () => {
    // Real rendered boxes at 1440px, Instrument Sans, all Beats expanded; same four
    // fixtures also captured at 390px in both themes against origin/main d6fde911.
    const mixes = fixtureMixes(rules);
    const layout = layoutWorkflow(mixes, rules, sizes);
    const routed = layoutWorkflowConnections(layout.nodes, fixturePaths(rules), sizes.ports, layout.height, false, sizes);
    const labels = routed.edges.map(edge => edge.label);
    const overlap = (a: typeof labels[number], b: typeof labels[number]) => connectionBoxesOverlap(a, b, 0);
    const after = {
      crossings: crossings(routed.edges.map(edge => edge.line)),
      nodeOverlaps: layout.nodes.reduce((sum, a, i) => sum + layout.nodes.slice(i + 1).filter(b => overlap(a, b)).length, 0),
      labelNodeOverlaps: labels.reduce((sum, a) => sum + layout.nodes.filter(b => overlap(a, b)).length, 0),
      labelOverlaps: labels.reduce((sum, a, i) => sum + labels.slice(i + 1).filter(b => overlap(a, b)).length, 0),
    };
    console.info(name, scale, { before: sizes.before, after });
    for (const key of Object.keys(after) as Array<keyof typeof after>) expect(after[key]).toBeLessThanOrEqual(sizes.before[key]);
    expect(after.labelNodeOverlaps).toBe(0);
    expect(routed.edges).toHaveLength(fixturePaths(rules).length);
    for (const node of layout.nodes) expect(node.height).toBe(sizes.nodes[node.id as keyof typeof sizes.nodes]?.height);
    // Expansion/text changes must move later cards, and a bounded return cannot
    // collapse the forward chain into a single column.
    if (name === "return") expect(new Set(layout.nodes.map(node => node.x)).size).toBe(3);
    const taller = { ...sizes, nodes: Object.fromEntries(Object.entries(sizes.nodes).map(([id, box]) => [id, { ...box, height: box.height * 2 }])) };
    const grown = layoutWorkflow(mixes, rules, taller);
    expect(grown.nodes.every((node, i) => grown.nodes.slice(i + 1).every(other => !overlap(node, other)))).toBe(true);
  });
});
