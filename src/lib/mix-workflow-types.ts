export type WorkflowTarget = { mixId: string; stepId: string | null };
export type WorkflowRoute = {
  id: string;
  label: string;
  when: "FINISHED" | "OUTCOME" | "TIMEOUT";
  outcome: string;
  delayMinutes: number;
  target: WorkflowTarget | null;
  maxVisits: number | null;
  replace: boolean;
};
export type WorkflowRule = {
  id: string;
  source: WorkflowTarget;
  name: string;
  enabled: boolean;
  mode: "CHOICE" | "PARALLEL";
  routes: WorkflowRoute[];
  join: { mode: "ALL" | "ANY"; target: WorkflowTarget; cancelRemaining: boolean } | null;
};
export type WorkflowConfiguration = { rules: WorkflowRule[]; gatedStepIds: string[]; intentionalEnds: string[] };
export const emptyWorkflow = (): WorkflowConfiguration => ({ rules: [], gatedStepIds: [], intentionalEnds: [] });
export type WorkflowStep = {
  id: string; versionId: string; name: string; channel: "SMS" | "EMAIL" | "PHONE_CALL" | "VOICEMAIL" | "WHATSAPP";
  dayOffset: number; sendTimeMinutes: number | null; plannedAt: string | null;
  anchor: "CALENDAR_DAY" | "APPOINTMENT_START" | "APPOINTMENT_END" | "VISIT_COMPLETED";
  offsetMinutes: number | null;
  subject: string | null; body: string | null; script: string | null;
  variants?: Record<string, unknown>;
};
export type WorkflowMix = { id: string; name: string; status: string; source: string; triggerMode: string; steps: WorkflowStep[] };
export type WorkflowDefinition = WorkflowConfiguration & { revision: number; publishedAt?: string; mixes: WorkflowMix[] };
export type WorkflowRun = {
  id: string; mixId: string; startedAt: string; completedAt: string | null;
  status: "ACTIVE" | "FINISHED" | "CANCELED";
  parentTransitionId: string | null; legacy: boolean;
  resolution?: { updateId: string; kind: "OUTCOME" | "WAIT" };
};
export type WorkflowVisit = {
  id: string; runId: string; stepId: string; readyAt: string;
  status: "PENDING" | "DONE" | "SKIPPED" | "HELD" | "CANCELED";
  completedAt: string | null; outcome: string | null; reason: string | null;
  parentTransitionId: string | null;
};
export type WorkflowEvaluation = {
  id: string; ruleId: string; runId: string; visitId: string | null;
  occurredAt: string; outcome: string | null; decidedAt: string | null; generation: number;
  status: "WAITING" | "ROUTED" | "CANCELED";
  joined: boolean;
};
export type WorkflowTransition = {
  id: string; evaluationId: string; generation: number; routeId: string;
  dueAt: string; startedAt: string | null;
  status: "WAITING" | "STARTED" | "FINISHED" | "HELD" | "CANCELED";
  reason: string | null; target: WorkflowTarget | null;
  targetRunId: string | null; targetVisitId: string | null;
};
export type WorkflowState = {
  sequence: number; runs: WorkflowRun[]; visits: WorkflowVisit[];
  evaluations: WorkflowEvaluation[]; transitions: WorkflowTransition[];
  commands: string[]; issue: string | null;
  commitments?: WorkflowCommitment[];
  updates?: WorkflowUpdateRecord[];
  pendingBusinessUpdate?: { requestId: string; input: WorkflowBusinessUpdate; recordedAt: string };
  pendingChoices?: Array<{ requestId: string; visitId: string; sourceCompletedAt: string; decisions: Array<{ ruleId: string; outcome: string }> }>;
  context?: { timezone: string; appointmentBindingId: string | null; calendarEntryId?: string; completionCutoff?: string; occurrenceKey?: string; admissionAlias?: string; enrollment?: { id: string; updatedAt: string }; enrollmentEnded?: EnrollmentEnded };
};
/** What an ended enrollment took out of its run, so a later start of the same occurrence can put it back (src/lib/enrollment-workflow.ts). */
export type EnrollmentEnded = {
  at: string; status: string; reason: string;
  runs: Array<{ id: string; status: WorkflowRun["status"]; completedAt: string | null }>;
  visits: Array<{ id: string; status: WorkflowVisit["status"]; reason: string | null }>;
  evaluations: Array<{ id: string; status: WorkflowEvaluation["status"] }>;
  transitions: Array<{ id: string; status: WorkflowTransition["status"]; reason: string | null }>;
  pendingChoices: NonNullable<WorkflowState["pendingChoices"]>;
};
export const emptyWorkflowState = (): WorkflowState => ({ sequence: 0, runs: [], visits: [], evaluations: [], transitions: [], commands: [], issue: null });
export const workflowNodeKey = (target: WorkflowTarget) => target.stepId ? `beat:${target.stepId}` : `mix:${target.mixId}`;

/** An owner-reviewed change applies to one run, never every Mix for a person. */
export type WorkflowBusinessUpdate = {
  kind: "OUTCOME" | "WAIT"; runId: string; scope: "SOURCE_MIX_REMAINDER";
  ruleId?: string; outcome?: string;
  dueAt?: string; timezone?: string; source?: "CUSTOMER" | "OWNER";
};
export type WorkflowCommitment = {
  id: string; updateId: string; runId: string; dueAt: string; timezone: string;
  source: "CUSTOMER" | "OWNER"; recordedAt: string; status: "OPEN" | "RESOLVED" | "CANCELED";
};
export type WorkflowCheckpoint = Pick<WorkflowState, "runs" | "visits" | "evaluations" | "transitions" | "pendingChoices" | "commitments" | "issue">;
export type WorkflowUpdateRecord = {
  id: string; runId: string; kind: "OUTCOME" | "WAIT" | "UNDO"; at: string; summary: string;
  ruleId?: string; outcome?: string; reverses?: string; reversedAt?: string;
  before?: WorkflowCheckpoint; afterFingerprint?: string; canUndo?: boolean;
};
