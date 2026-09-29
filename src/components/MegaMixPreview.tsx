import type { MegaMix } from "@/lib/mega-mixes";
import { AppIcon } from "@/components/AppIcon";
import { MergeFieldText } from "@/components/MergeFieldText";
import { timeOfDayLabel } from "@/lib/display-labels";
import styles from "./MegaMix.module.css";

export function MegaMixPreview({ blueprint }: { blueprint: MegaMix }) {
  return <div className={styles.preview}>
    <p className={styles.eyebrow}>A connected starting point</p>
    <h2>{blueprint.name} Mega-Mix</h2><p>{blueprint.description}</p>
    <div className={styles.facts}><span>{blueprint.nodes.length} Mixes</span><span>{blueprint.nodes.reduce((n, item) => n + item.steps.length, 0)} Beats</span><span>Editable connections</span></div>
    <p className={styles.explanation}>Start someone where they are. Their recorded decisions guide the next follow-up.</p>
    <details className={styles.how}><summary>Coverage and how it works</summary><p>{blueprint.coverage}</p><p>Start someone at the Mix that fits their situation. After its Beats finish, record the decision to continue along a connected path. {blueprint.nodes.some(node => node.paths.some(route => route.on === "FINISHED")) && "Paths labeled Follow-up finished continue automatically when the source Beats are done or skipped. "}You can change any wording, timing or path in your own Journey.</p></details>
    <ol className={styles.nodes} aria-label="Included Mixes and connections">{blueprint.nodes.map((node, index) => <li key={node.key}>
      <span className={styles.number} aria-hidden="true">{index + 1}</span><div className={styles.node}>
        <h3>{node.name}</h3>{blueprint.roots.includes(node.key) && <span className={styles.root}>Suggested starting point</span>}
        <p>{node.purpose}</p>
        <details><summary>{node.steps.length} {node.steps.length === 1 ? "Beat" : "Beats"} · View wording and timing</summary><ol className={styles.beats}>{node.steps.map((step, stepIndex) => <li key={stepIndex}><strong>{step.name}</strong><small>Day {step.dayOffset} after this Mix starts · {step.channel === "SMS" ? "Text" : step.channel === "EMAIL" ? "Email" : "Phone call"} · {timeOfDayLabel(step.sendTimeMinutes)}</small>{step.subject && <strong>{step.subject}</strong>}<p className={styles.wording}><MergeFieldText text={step.body || step.script || ""} /></p></li>)}</ol></details>
        <ul className={styles.paths} aria-label={`${node.name} connections`}>{node.paths.map((route, routeIndex) => <li key={routeIndex}><AppIcon name={route.to ? "journey" : "check"} /><span>{route.label} <span aria-hidden="true">→</span><span className="sr-only"> leads to </span> <strong>{route.to ? blueprint.nodes.find(item => item.key === route.to)?.name : "Journey ends"}</strong>{Boolean(route.afterDays) && <small>Wait {route.afterDays} days before starting the next Mix.</small>}{route.maxVisits && <small>Up to {route.maxVisits} repeats of this path per journey.</small>}</span></li>)}</ul>
      </div>
    </li>)}</ol>
    <p className={styles.explanation}>Timing is relative to each Mix’s start, in your timezone, and follows your scheduling preferences. At decision points, the journey waits for your recorded choice. Completing a follow-up does not confirm a sale or completed work.</p>
    <p className={styles.boundary}>{blueprint.boundary}</p>
  </div>;
}
