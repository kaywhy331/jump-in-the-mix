import { describe, expect, it } from "vitest";
import { summarizeWorkflowPeople, workflowStatuses, workflowStatusLabels, type WorkflowPerson, type WorkflowPosition } from "@/lib/workflow-analytics";
import { workflowCountScope, workflowMapScope, workflowPeopleScope } from "@/lib/workflow-count-scope";

const position = (patch: Partial<WorkflowPosition> = {}): WorkflowPosition => ({ mixId: "estimate", stepId: "call", instanceId: "kitchen", status: "active", reason: "Ready", dueAt: null, ...patch });
const person = (positions: WorkflowPosition[]): WorkflowPerson => ({ id: "alex", displayName: "Alex Fixture", stageId: "quote", stageName: "Quote requested", positions });

describe("Journey work items alongside unique people", () => {
  it("counts one person with two separate pieces of work as one person and two work items", () => {
    const result = summarizeWorkflowPeople([person([position(), position({ instanceId: "roof" })])]);
    expect(result.summary).toMatchObject({ total: 1, active: 1, workItems: 2 });
    expect(result.nodes["mix:estimate"].workItems).toBe(2);
  });

  it("counts a handoff, repeat visit and parallel statuses once for the same work", () => {
    const result = summarizeWorkflowPeople([person([position(), position(), position({ mixId: "delivery", status: "waiting" }), position({ status: "completed" })])]);
    expect(result.summary).toMatchObject({ total: 1, active: 1, waiting: 1, workItems: 1 });
    expect(result.nodes["mix:delivery"].workItems).toBe(1);
  });

  it("counts standalone follow-ups by their identity without counting a workflow follow-up twice", () => {
    const standalone = position({ instanceId: null, jumpId: "one-time" });
    const result = summarizeWorkflowPeople([person([position({ jumpId: "workflow-beat" }), position({ stepId: "email" }), standalone, standalone, position({ instanceId: null, jumpId: "past", status: "completed" })])]);
    expect(result.summary).toMatchObject({ total: 1, workItems: 3 });
    expect(summarizeWorkflowPeople([person([])]).summary).toMatchObject({ total: 1, workItems: 0, not_started: 1 });
  });

  it("keeps full totals when the roster is filtered or paginated", () => {
    const people = Array.from({ length: 12 }, (_, index) => ({ ...person([position(), position({ instanceId: "roof" })]), id: `person-${index}`, displayName: `Person ${index}` }));
    const filtered = summarizeWorkflowPeople(people, { query: "missing", node: "mix:estimate", status: "active", stage: "quote", offset: 10 });
    expect(filtered.total).toBe(0);
    expect(filtered.appliedFilters).toEqual({ query: "missing", node: "mix:estimate", status: "active", stage: "quote" });
    expect(filtered.summary).toMatchObject({ total: 12, workItems: 24 });
    expect(summarizeWorkflowPeople(people, { offset: 10 }).summary.workItems).toBe(24);
  });
});

describe("Journey count scopes", () => {
  const all = { status: "all", query: "" };
  it("names the account-wide count scope separately from roster filters", () => {
    expect(workflowCountScope).toBe("Counts: all nonarchived contacts, including past work. People filters narrow the list only.");
    expect(workflowPeopleScope(all)).toBe("People list: All Mixes · All statuses · All contact stages · All names. Archived contacts excluded.");
  });
  it.each(workflowStatuses)("uses the shared label for the %s filter", status => {
    expect(workflowPeopleScope({ ...all, status })).toContain(` · ${workflowStatusLabels[status]} · `);
  });
  it("names Mix or Beat, saved stage and submitted search filters", () => {
    expect(workflowPeopleScope({ nodeLabel: "Call after estimate", status: "waiting", stageLabel: "Quote requested", query: " Alex " })).toBe("People list: Call after estimate · Waiting · Quote requested · Name contains “Alex”. Archived contacts excluded.");
    expect(workflowPeopleScope({ ...all, nodeLabel: "Estimate Mix" })).toContain("People list: Estimate Mix ·");
  });
  it.each(["All Mixes", "Renovation follow-through", "Not in a Mega-Mix"])("describes %s as map-only in both archive settings", label => {
    for (const archived of [false, true]) {
      const scope = workflowMapScope(label, archived);
      expect(scope).toContain(`Map view: ${label} · `);
      expect(scope).toContain(archived ? "archived Mixes included" : "archived Mixes shown only when work remains");
      expect(scope).toContain("Map options do not filter the counts or People.");
      expect(workflowPeopleScope(all)).not.toContain("Map view:");
    }
  });
});
