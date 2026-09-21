import Link from "next/link";
import type { CSSProperties } from "react";
import { journeyMovePath, journeyTouchpointPositions, journeyVisibleTouchpoints } from "@/lib/journey-map-layout";

export type JourneyMapStage = { id: string; name: string; count: number; late: number; soon: number };
export type JourneyMapTouchpoint = { id: string; name: string; count: number; timing: string; stages: string[]; href?: string; placement?: "below" };
export function JourneyMap({ stages, touchpoints, moves, selectedStage, selectedMix, href }: {
  stages: JourneyMapStage[];
  touchpoints: JourneyMapTouchpoint[];
  moves: { from: string; to: string; count: number }[];
  selectedStage?: string;
  selectedMix?: string;
  href: (stage?: string, mix?: string) => string;
}) {
  const width = Math.max(760, stages.length * 180);
  const visibleTouchpoints = journeyVisibleTouchpoints(touchpoints, selectedMix);
  const max = Math.max(1, ...stages.map(stage => stage.count));
  const hasSkippedMoves = moves.some(move => {
    const from = stages.findIndex(stage => stage.id === move.from);
    const to = stages.findIndex(stage => stage.id === move.to);
    return from >= 0 && to > from + 1 && move.count > 0;
  });
  const stageY = visibleTouchpoints.some(item => item.placement !== "below") ? 270 : hasSkippedMoves ? 180 : 130;
  const positions = new Map(stages.map((stage, index) => [stage.id, {
    x: stages.length === 1 ? width / 2 : 100 + index * (width - 200) / (stages.length - 1),
    y: stageY, radius: (84 + 54 * Math.sqrt(stage.count / max)) / 2, index, name: stage.name
  }]));
  const movements = moves.flatMap(move => {
    const from = positions.get(move.from), to = positions.get(move.to);
    return !from || !to || from === to || move.count <= 0 ? [] : [{
      ...move, fromName: from.name, toName: to.name, ...journeyMovePath(from, to)
    }];
  });
  // Empty touchpoint rows don't take space; return arrows still fit below stages.
  const hasReturnMoves = movements.some(move => positions.get(move.to)!.index < positions.get(move.from)!.index);
  const touchPositions = journeyTouchpointPositions(visibleTouchpoints, width, stageY);
  const height = touchPositions.some(point => point.below) ? stageY + 320 : stageY + (hasReturnMoves ? 180 : 120);
  return <>
    <div className="journey-map-scroll" tabIndex={0} role="region" aria-label="Journey map. Select a stage or touchpoint to see its people.">
      <div className="journey-map" style={{ width, height }}>
        <svg className="journey-connections" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
          <defs><marker id="journey-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="var(--text-3)" /></marker></defs>
          {visibleTouchpoints.flatMap((mix, i) => mix.stages.map(id => { const stage = positions.get(id), point = touchPositions[i]; return stage && <path key={`${mix.id}-${id}`} d={`M${point.x} ${point.y} C${point.x} ${(point.y + stage.y)/2}, ${stage.x} ${(point.y + stage.y)/2}, ${stage.x} ${stage.y}`} className={selectedMix === mix.id ? "selected" : ""} />; }))}
          {movements.map(move => <g key={`${move.from}-${move.to}`}><path className={`journey-move-path${move.direct ? " direct" : ""}`} d={move.path} markerEnd="url(#journey-arrow)"/><text x={move.label.x} y={move.label.y} textAnchor="middle">{move.count.toLocaleString()} moved</text></g>)}
        </svg>
        {stages.map(stage => { const position = positions.get(stage.id)!; const diameter = position.radius * 2; const late = stage.count ? stage.late/stage.count*100 : 0; const soon = stage.count ? stage.soon/stage.count*100 : 0;
          return <Link key={stage.id} href={href(stage.id)} className={`journey-node${selectedStage === stage.id ? " selected" : ""}`} aria-current={selectedStage === stage.id ? "page" : undefined} aria-label={`${stage.name}: ${stage.count} people, ${stage.late} late, ${stage.soon} due in the next seven days`} style={{ left: position.x, top: position.y, width: diameter, height: diameter, "--node-ring": `conic-gradient(var(--late) 0 ${late}%, var(--violet-mark) ${late}% ${late+soon}%, var(--quiet) ${late+soon}% 100%)` } as CSSProperties}><span><strong>{stage.count.toLocaleString()}</strong><span>{stage.name}</span></span></Link>;
        })}
        {visibleTouchpoints.map((mix, i) => <Link className={`journey-touch-node${touchPositions[i].y < stageY ? " above" : " below"}${selectedMix === mix.id ? " selected" : ""}`} key={mix.id} href={mix.href ?? href(undefined, mix.id)} aria-current={selectedMix === mix.id ? "page" : undefined} style={{ left: touchPositions[i].x, top: touchPositions[i].y }}><span className="touch-node-count">{mix.count.toLocaleString()}</span><span className="touch-node-caption"><strong>{mix.name}</strong><small>{mix.timing}</small></span></Link>)}
      </div>
      {movements.length > 0 && <ul className="sr-only" aria-label="Recorded stage moves in the last 30 days">{movements.map(move => <li key={`${move.from}-${move.to}`}>{move.fromName} to {move.toName}: {move.count.toLocaleString()} {move.count === 1 ? "move" : "moves"}.</li>)}</ul>}
    </div>
    <nav className="journey-mobile-stages" aria-label="Customer stages">{stages.map(stage => <Link key={stage.id} href={href(stage.id)} aria-current={selectedStage === stage.id ? "page" : undefined}><strong>{stage.count.toLocaleString()}</strong><span>{stage.name}</span><i aria-hidden="true" /></Link>)}</nav>
    <p className="journey-map-key"><span><i className="late" />Late</span><span><i className="soon" />Due in seven days</span><span><i />Later or unscheduled</span></p>
    <p className="journey-map-caption">Bigger circles mean more people. Arrows show recorded stage moves in the last 30 days.</p>
  </>;
}
