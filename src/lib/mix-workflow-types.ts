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
  pendingChoices?: Array<{ requestId: string; visitId: string; sourceCompletedAt: string; decisions: Array<{ ruleId: string; outcome: string }> }>;
  context?: { timezone: string; appointmentBindingId: string | null; calendarEntryId?: string; completionCutoff?: string; occurrenceKey?: string; admissionAlias?: string };
};
export const emptyWorkflowState = (): WorkflowState => ({ sequence: 0, runs: [], visits: [], evaluations: [], transitions: [], commands: [], issue: null });
export const workflowNodeKey = (target: WorkflowTarget) => target.stepId ? `beat:${target.stepId}` : `mix:${target.mixId}`;
