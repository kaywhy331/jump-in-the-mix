import Link from "next/link";
import { requireWorkspace } from "@/lib/auth";
import { readWorkflowGraph } from "@/lib/mix-workflow-view";
import { WorkflowJourney } from "@/components/WorkflowJourney";
import { QuietDaySuggestions } from "@/components/QuietDaySuggestions";
import { readQuietDays } from "@/lib/quiet-days";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import styles from "@/components/WorkflowJourney.module.css";

export default async function JourneyPage({ searchParams }: { searchParams: Promise<{ mix?: string; contactId?: string; touchpoint?: string; q?: string }> }) {
  const [{ workspace, user, impersonation }, query] = await Promise.all([requireWorkspace(), searchParams]);
  const display = await displayPreferencesForUser(user.id);
  const [graph, quietDays] = await Promise.all([
    readWorkflowGraph(workspace.id, { contactId: query.contactId, query: query.q, canEdit: !impersonation }),
    readQuietDays({ workspaceId: workspace.id, timezone: display.timeZone, query: query.q })
  ]);
  return <div className={`page ${styles.page}`}>
    <header className="page-header"><div><h1>Journey</h1></div><div className="page-actions"><Link className="button" href="/mixes">My Mixes</Link>{!impersonation && <Link className="button primary" href="/mixes/new">Create a Mix</Link>}</div></header>
    <WorkflowJourney initial={graph} displayPreferences={display} initialMixId={query.mix} initialContactId={query.contactId} />
    <details className={styles.quietDays} open={query.touchpoint === "quiet-days"}><summary>Just saying hello{quietDays.enabled ? ` · ${quietDays.total} people due` : " · quiet-day check-ins"}</summary><QuietDaySuggestions locale={display.locale} initial={quietDays} canResolve={!impersonation} initialQuery={query.q ?? ""} /></details>
  </div>;
}
