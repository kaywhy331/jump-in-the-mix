export type ConnectionNode = { id: string; x: number; y: number; width: number; height: number };
export type ConnectionPath = { id: string; source: string; destination: string; sourceStep: string | null; destinationStep: string | null; label: string; result?: string };
type Box = { x: number; y: number; width: number; height: number };

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
export function layoutWorkflowConnections(nodes: ConnectionNode[], paths: ConnectionPath[], ports: Record<string, number>, baseHeight: number, results = false) {
  const boxes: Box[] = [...nodes], bottom = Math.max(baseHeight - 40, ...nodes.map(node => node.y + node.height + 30));
  let returnLane = bottom, height = baseHeight;
  const edges = paths.flatMap(path => {
    const source = nodes.find(node => node.id === path.source), destination = nodes.find(node => node.id === path.destination);
    if (!source || !destination) return [];
    const x1 = source.x + source.width, y1 = path.sourceStep ? ports[path.sourceStep] ?? source.y + 65 : source.y + 65;
    const x2 = destination.x, y2 = path.destinationStep ? ports[path.destinationStep] ?? destination.y + 65 : destination.y + 65;
    const forward = x2 > x1;
    const width = forward ? Math.max(80, Math.min(224, x2 - x1 - 16)) : 224;
    const lines = wrap(path.label, Math.max(10, Math.floor((width - 16) / 6.5)));
    const resultLines = results && path.result ? wrap(path.result, Math.max(10, Math.floor((width - 16) / 6))) : [];
    const labelHeight = 16 + lines.length * 16 + (resultLines.length ? 6 + resultLines.length * 16 : 0);
    const x = (x1 + x2) / 2 - width / 2;
    let y = forward ? Math.max(8, (y1 + y2) / 2 - labelHeight / 2) : returnLane + 16;
    const box = { x, y, width, height: labelHeight };
    // Moving labels downward is deterministic and independent of selection/zoom.
    while (boxes.some(other => connectionBoxesOverlap(box, other))) box.y += 16;
    boxes.push(box);
    const middle = box.y + box.height / 2, center = x + width / 2;
    let line: string;
    if (forward) line = `M${x1},${y1} C${center},${y1} ${center},${middle} ${center},${middle} C${center},${middle} ${center},${y2} ${x2},${y2}`;
    else {
      const lane = middle;
      line = `M${x1},${y1} C${x1 + 35},${y1} ${x1 + 35},${lane} ${x1},${lane} L${x2 - 25},${lane} Q${x2 - 45},${lane} ${x2 - 45},${lane - 20} L${x2 - 45},${y2 + 20} Q${x2 - 45},${y2} ${x2},${y2}`;
      returnLane = box.y + box.height + 16;
    }
    height = Math.max(height, box.y + box.height + 40);
    return [{ id: path.id, line, label: box, lines, resultLines }];
  });
  return { edges, height };
}
