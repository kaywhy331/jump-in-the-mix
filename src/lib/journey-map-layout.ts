type StagePoint = { x: number; y: number; radius: number; index: number };
type Touchpoint = { id: string; placement?: "below" };

/** Keep the selected touchpoint and the quiet-day node in the bounded map. */
export function journeyVisibleTouchpoints<T extends Touchpoint>(items: T[], selectedId?: string): T[] {
  const selected = items.find(item => item.id === selectedId);
  const required = [...(selected ? [selected] : []), ...items.filter(item => item.placement === "below")];
  const ids = new Set<string>();
  for (const item of [...required, ...items]) {
    if (ids.size === 6) break;
    ids.add(item.id);
  }
  return items.filter(item => ids.has(item.id));
}

/** Space each row independently so sparse and lower-only rows stay centered. */
export function journeyTouchpointPositions(items: Touchpoint[], width: number, stageY: number) {
  let upperCount = 0;
  const below = items.map(item => item.placement === "below" || upperCount++ >= 3);
  const counts = [below.filter(value => !value).length, below.filter(Boolean).length];
  const placed = [0, 0];
  return below.map(lower => {
    const row = Number(lower), index = placed[row]++;
    return {
      x: counts[row] === 1 ? width / 2 : 150 + index * (width - 300) / (counts[row] - 1),
      y: lower ? stageY + 230 : 80,
      below: lower
    };
  });
}

/** Stop outside the rings (and selection halo), so direction stays visible. */
export function journeyMovePath(from: StagePoint, to: StagePoint) {
  const direct = to.index === from.index + 1;
  const control = {
    x: (from.x + to.x) / 2,
    y: from.y + (direct ? 0 : to.index > from.index ? -200 : 200)
  };
  const edge = (point: StagePoint) => {
    const dx = control.x - point.x, dy = control.y - point.y;
    const scale = (point.radius + 12) / Math.hypot(dx, dy);
    return { x: point.x + dx * scale, y: point.y + dy * scale };
  };
  const start = edge(from), end = edge(to);
  return {
    direct,
    path: `M${start.x} ${start.y} Q${control.x} ${control.y} ${end.x} ${end.y}`,
    start, end,
    label: {
      x: (start.x + 2 * control.x + end.x) / 4,
      y: (start.y + 2 * control.y + end.y) / 4 - 12
    }
  };
}
