import { requireWorkspace } from "@/lib/auth";
import { readWorkflowGraph } from "@/lib/mix-workflow-view";
import { WorkflowJourney } from "@/components/WorkflowJourney";
import { QuietDaySuggestions } from "@/components/QuietDaySuggestions";
import { readQuietDays } from "@/lib/quiet-days";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import styles from "@/components/WorkflowJourney.module.css";

export default async function JourneyPage({ searchParams }: { searchParams: Promise<{ megaMix?: string; mix?: string; contactId?: string; touchpoint?: string; q?: string; start?: string; label?: string; work?: string }> }) {
  const [{ workspace, user, impersonation }, query] = await Promise.all([requireWorkspace(), searchParams]);
  const display = await displayPreferencesForUser(user.id);
  const [graph, quietDays] = await Promise.all([
    readWorkflowGraph(workspace.id, { contactId: query.contactId, focusedInstance: query.work?.slice(0, 160), query: query.q, canEdit: !impersonation }),
    readQuietDays({ workspaceId: workspace.id, timezone: display.timeZone, query: query.q })
  ]);
  return <div className={`page ${styles.page}`}>
    <WorkflowJourney initialInstanceId={query.work?.slice(0, 160)} initialWorkLabel={query.label?.slice(0, 160)} initial={graph} displayPreferences={display} initialMixId={query.mix} initialMegaMixId={query.megaMix?.slice(0, 160)} initialStartOpen={query.start === "1" && !impersonation} initialContactId={query.contactId} showCheckIns={query.touchpoint === "quiet-days"}>
      <details className={styles.quietDays} open={query.touchpoint === "quiet-days"}><summary>Just saying hello{quietDays.enabled ? ` · ${quietDays.total} people due` : " · quiet-day check-ins"}</summary><QuietDaySuggestions locale={display.locale} initial={quietDays} canResolve={!impersonation} initialQuery={query.q ?? ""} /></details>
    </WorkflowJourney>
  </div>;
}
