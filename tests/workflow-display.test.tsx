import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { summarizeWorkflowPeople } from "@/lib/workflow-analytics";
import { WorkflowJourney } from "@/components/WorkflowJourney";
import { emptyWorkflow, emptyWorkflowState } from "@/lib/mix-workflow-types";
import type { WorkflowGraphView } from "@/lib/mix-workflow-view";

// Server and browser host zones can differ even when the account has a saved zone.
// Compare the actual initial render so both the map footer and progress cards are covered.
describe("Journey dates across server and browser time zones", () => {
  it("renders the account's dates identically before hydration in different host zones", () => {
    const instant = "2026-01-01T00:30:00.000Z";
    const initial: WorkflowGraphView = {
      analytics: summarizeWorkflowPeople([{ id: "person", displayName: "Example person", stageId: "unassigned", stageName: "No stage", positions: [] }]),
      revision: 1, historical: false, configuration: emptyWorkflow(), mixes: [], canEdit: false,
      metrics: {}, instanceTotal: 1, people: [], issues: [], updatedAt: instant, megaMixes: [],
      instances: [{
        id: "instance", contactId: "person", contactName: "Example person", label: "Example work",
        status: "ACTIVE", revision: 1, definitionRevision: 1, updatedAt: instant,
        state: { ...emptyWorkflowState(), transitions: [{
          id: "transition", evaluationId: "decision", generation: 1, routeId: "route", dueAt: instant,
          startedAt: null, status: "WAITING", reason: null, target: null, targetRunId: null, targetVisitId: null
        }] }, appointments: [], decisions: [],
        beats: [{ visitId: "visit", jumpId: "jump", mixName: "Example Mix", name: "Example Beat", status: "PENDING", scheduledAt: instant }]
      }]
    };
    const old = process.env.TZ;
    try {
      const render = (hostZone: string) => {
        process.env.TZ = hostZone;
        return renderToString(<WorkflowJourney initial={initial} initialContactId="person" displayPreferences={{ locale: "en-US", timeZone: "America/New_York" }} />);
      };
      const server = render("UTC");
      expect(server).toContain("Dec 31, 7:30 PM");
      expect(render("America/Los_Angeles")).toBe(server);
      expect(render("Pacific/Auckland")).toBe(server);
    } finally {
      if (old === undefined) delete process.env.TZ; else process.env.TZ = old;
    }
  });
});
