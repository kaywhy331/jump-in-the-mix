import Link from "next/link";
import type { CSSProperties } from "react";

export type JourneyMapStage = { id: string; name: string; count: number; late: number; soon: number };
export type JourneyMapTouchpoint = { id: string; name: string; count: number; timing: string; stages: string[] };
export function JourneyMap({ stages, touchpoints, moves, selectedStage, selectedMix, href }: {
  stages: JourneyMapStage[];
  touchpoints: JourneyMapTouchpoint[];
  moves: { from: string; to: string; count: number }[];
  selectedStage?: string;
  selectedMix?: string;
  href: (stage?: string, mix?: string) => string;
}) {
  const width = Math.max(760, stages.length * 180);
  const visibleTouchpoints = touchpoints.slice(0, 6);
  // Reserve the lower touchpoint row only when it contains real Mixes.
  const height = visibleTouchpoints.length > 3 ? 550 : visibleTouchpoints.length ? 390 : 350;
  const positions = new Map(stages.map((stage, i) => [stage.id, { x: 100 + i * (width - 200) / Math.max(stages.length - 1, 1), y: 270 }]));
  const touchPositions = visibleTouchpoints.map((_, i) => ({ x: 150 + (i % 3) * (width - 300) / 2, y: i < 3 ? 80 : 460 }));
  const max = Math.max(1, ...stages.map(stage => stage.count));
  return <>
    <div className="journey-map-scroll" tabIndex={0} role="region" aria-label="Journey map. Select a stage or touchpoint to see its people.">
      <div className="journey-map" style={{ width, height }}>
        <svg className="journey-connections" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
          <defs><marker id="journey-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="var(--text-3)" /></marker></defs>
          {visibleTouchpoints.flatMap((mix, i) => mix.stages.map(id => { const stage = positions.get(id), point = touchPositions[i]; return stage && <path key={`${mix.id}-${id}`} d={`M${point.x} ${point.y} C${point.x} ${(point.y + stage.y)/2}, ${stage.x} ${(point.y + stage.y)/2}, ${stage.x} ${stage.y}`} className={selectedMix === mix.id ? "selected" : ""} />; }))}
          {moves.map((move, i) => { const a = positions.get(move.from), b = positions.get(move.to); if (!a || !b || a === b) return null; const forward = b.x > a.x; const y = forward ? 200 - (i % 3)*30 : 350 + (i % 3)*25; return <g key={`${move.from}-${move.to}`}><path className="journey-move-path" d={`M${a.x} ${a.y} Q${(a.x+b.x)/2} ${y} ${b.x} ${b.y}`} markerEnd="url(#journey-arrow)"/><text x={(a.x+b.x)/2} y={(a.y+y)/2-10} textAnchor="middle">{move.count} moved</text></g>; })}
        </svg>
        {stages.map(stage => { const position = positions.get(stage.id)!; const diameter = 84 + 54*Math.sqrt(stage.count/max); const late = stage.count ? stage.late/stage.count*100 : 0; const soon = stage.count ? stage.soon/stage.count*100 : 0;
          return <Link key={stage.id} href={href(stage.id)} className={`journey-node${selectedStage === stage.id ? " selected" : ""}`} aria-current={selectedStage === stage.id ? "page" : undefined} aria-label={`${stage.name}: ${stage.count} people, ${stage.late} late, ${stage.soon} due in the next seven days`} style={{ left: position.x, top: position.y, width: diameter, height: diameter, "--node-ring": `conic-gradient(var(--late) 0 ${late}%, var(--violet-mark) ${late}% ${late+soon}%, var(--quiet) ${late+soon}% 100%)` } as CSSProperties}><span><strong>{stage.count.toLocaleString()}</strong><span>{stage.name}</span></span></Link>;
        })}
        {visibleTouchpoints.map((mix, i) => <Link className={`journey-touch-node${selectedMix === mix.id ? " selected" : ""}`} key={mix.id} href={href(undefined, mix.id)} aria-current={selectedMix === mix.id ? "page" : undefined} style={{ left: touchPositions[i].x, top: touchPositions[i].y }}><span className="touch-node-count">{mix.count}</span><strong>{mix.name}</strong><small>{mix.timing}</small></Link>)}
      </div>
    </div>
    <nav className="journey-mobile-stages" aria-label="Customer stages">{stages.map(stage => <Link key={stage.id} href={href(stage.id)} aria-current={selectedStage === stage.id ? "page" : undefined}><strong>{stage.count.toLocaleString()}</strong><span>{stage.name}</span><i aria-hidden="true" /></Link>)}</nav>
    <p className="journey-map-key"><span><i className="late" />Late</span><span><i className="soon" />Due in seven days</span><span><i />Later or unscheduled</span></p>
    <p className="journey-map-caption">Bigger circles mean more people. Arrows show recorded stage moves in the last 30 days.</p>
  </>;
}
