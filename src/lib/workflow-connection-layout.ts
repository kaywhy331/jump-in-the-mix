export type ConnectionNode = { id: string; x: number; y: number; width: number; height: number };
export type ConnectionPath = { id: string; source: string; destination: string; sourceStep: string | null; destinationStep: string | null; label: string; result?: string };
type Box = { x: number; y: number; width: number; height: number };
export type WorkflowMeasurements = {
  nodes: Record<string, { width: number; height: number }>;
  labels: Record<string, { width: number; height: number }>;
  ports: Record<string, number>;
  gap: number;
  padding: number;
  viewportHeight?: number;
};

export function connectionDirection(path: Pick<ConnectionPath, "source" | "destination">, selected: string) {
  if (!selected) return "neutral";
  if (path.source === selected && path.destination === selected) return "return";
  if (path.destination === selected) return "incoming";
  return path.source === selected ? "outgoing" : "unrelated";
}

function wrap(text: string, columns: number): string[] {
  const words = text.split(/\s+/), lines: string[] = [];
  for (const word of words) {
    if (lines.length && lines.at(-1)!.length + word.length + 1 <= columns) lines[lines.length - 1] += ` ${word}`;
    else if (word.length <= columns) lines.push(word);
    else for (let index = 0; index < word.length; index += columns) lines.push(word.slice(index, index + columns));
  }
  return lines;
}

export function connectionBoxesOverlap(a: Box, b: Box, padding = 6): boolean {
  return a.x < b.x + b.width + padding && a.x + a.width + padding > b.x && a.y < b.y + b.height + padding && a.y + a.height + padding > b.y;
}

/** Give every label its own free rectangle; return paths also receive distinct lanes. */
export function layoutWorkflowConnections(nodes: ConnectionNode[], paths: ConnectionPath[], ports: Record<string, number>, baseHeight: number, results = false, measured?: { labels: Record<string, { width: number; height: number }>; gap: number }) {
  const gap = measured?.gap ?? 16;
  const boxes: Box[] = [...nodes], bottom = Math.max(baseHeight - (measured ? gap : 40), ...nodes.map(node => node.y + node.height + (measured ? gap : 30)));
  let returnLane = bottom, height = baseHeight;
  // Place forward labels in endpoint order so a taller label cannot force an
  // earlier path behind a later one. Returns retain their distinct bottom lanes.
  const midpoint = (path: ConnectionPath) => {
    const source = nodes.find(node => node.id === path.source), destination = nodes.find(node => node.id === path.destination);
    if (!source || !destination || destination.x <= source.x + source.width) return Infinity;
    return ((ports[path.sourceStep ?? source.id] ?? source.y + source.height / 2) + (ports[path.destinationStep ?? destination.id] ?? destination.y + destination.height / 2)) / 2;
  };
  const ordered = measured ? [...paths].sort((a, b) => midpoint(a) - midpoint(b)) : paths;
  const edges = ordered.flatMap(path => {
    const source = nodes.find(node => node.id === path.source), destination = nodes.find(node => node.id === path.destination);
    if (!source || !destination) return [];
    const x1 = source.x + source.width, y1 = ports[path.sourceStep ?? source.id] ?? source.y + source.height / 2;
    const x2 = destination.x, y2 = ports[path.destinationStep ?? destination.id] ?? destination.y + destination.height / 2;
    const forward = x2 > x1;
    const width = measured ? measured.labels[path.id]?.width ?? source.width : forward ? Math.max(80, Math.min(224, x2 - x1 - 16)) : 224;
    const lines = wrap(path.label, Math.max(10, Math.floor((width - 16) / 6.5)));
    const resultLines = results && path.result ? wrap(path.result, Math.max(10, Math.floor((width - 16) / 6))) : [];
    const labelHeight = measured ? measured.labels[path.id]?.height ?? 0 : 16 + lines.length * 16 + (resultLines.length ? 6 + resultLines.length * 16 : 0);
    const x = (x1 + x2) / 2 - width / 2;
    let y = forward ? Math.max(measured ? gap : 8, (y1 + y2) / 2 - labelHeight / 2) : returnLane + gap;
    const box = { x, y, width, height: labelHeight };
    // Moving labels downward is deterministic and independent of selection/zoom.
    while (boxes.some(other => connectionBoxesOverlap(box, other, measured?.gap))) {
      box.y = Math.max(...boxes.filter(other => connectionBoxesOverlap(box, other, measured?.gap)).map(other => other.y + other.height + (measured?.gap ?? 16)));
    }
    boxes.push(box);
    const middle = box.y + box.height / 2, center = x + width / 2;
    let line: string;
    if (forward) line = `M${x1},${y1} C${center},${y1} ${center},${middle} ${center},${middle} C${center},${middle} ${center},${y2} ${x2},${y2}`;
    else {
      const lane = middle;
      const bend = measured ? gap : 35, inset = measured ? gap : 45, corner = measured ? gap / 2 : 20;
      line = `M${x1},${y1} C${x1 + bend},${y1} ${x1 + bend},${lane} ${x1},${lane} L${x2 - inset + corner},${lane} Q${x2 - inset},${lane} ${x2 - inset},${lane - corner} L${x2 - inset},${y2 + corner} Q${x2 - inset},${y2} ${x2},${y2}`;
      returnLane = box.y + box.height + gap;
    }
    height = Math.max(height, box.y + box.height + (measured ? gap : 40));
    return [{ id: path.id, line, label: box, lines, resultLines }];
  });
  return { edges, height };
}
