import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readWorkflowGraph } from "@/lib/mix-workflow-view";
import { processWorkflowInstance, saveWorkflowConfiguration, startWorkflowInstance, workflowDefinition, workflowState } from "@/lib/mix-workflow";
import { wakeWorkerAfterResponse } from "@/lib/worker-dispatch-after";
import { workflowDecisionRulesForVisit } from "@/lib/mix-workflow-engine";
import { consumeRateLimit } from "@/lib/rate-limit";
import { workflowRuleSchema } from "@/lib/mix-workflow-config";
import { removeWorkflowPath, saveWorkflowRule, WorkflowRuleConflict } from "@/lib/mix-workflow-rule-save";

const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("remove-path"), expectedRule: workflowRuleSchema, removal: z.discriminatedUnion("kind", [z.object({ kind: z.literal("route"), routeId: z.string().min(1).max(160) }), z.object({ kind: z.literal("join") }), z.object({ kind: z.literal("rule") })]) }),
  z.object({ action: z.literal("save-rule"), rule: workflowRuleSchema, expectedRule: workflowRuleSchema.nullable() }),
  z.object({ action: z.literal("configure"), configuration: z.unknown(), expectedRevision: z.number().int().min(0) }),
  z.object({ action: z.literal("start"), contactId: z.string().min(1).max(160), mixId: z.string().min(1).max(160), requestId: z.string().uuid(), label: z.string().max(160).optional() }),
  z.object({ action: z.literal("progress"), instanceId: z.string().min(1).max(160), requestId: z.string().uuid(), expectedRevision: z.number().int().min(1), calendarEntryId: z.string().min(1).max(160).optional(), evaluationId: z.string().max(160).optional(), outcome: z.string().max(160).optional(), status: z.enum(["ACTIVE", "PAUSED", "STOPPED"]).optional() })
]);
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: Request) {
  const session = await getCurrentSession(), membership = session?.user.memberships[0];
  if (!session || !membership) return response({ error: "Sign in to view your journey." }, 401);
  const query = new URL(request.url).searchParams;
  const jumpId = query.get("jumpId");
  if (jumpId) {
    const jump = await prisma.jump.findFirst({ where: { id: jumpId, workspaceId: membership.workspaceId }, include: { workflowInstance: true } });
    if (!jump) return response({ error: "Follow-up not found." }, 404);
    const instance = jump.workflowInstance;
    if (!instance) return response({ decisions: [], instanceId: null });
    const definition = workflowDefinition(instance.definition), state = workflowState(instance.state);
    return response({ instanceId: instance.id, label: instance.label, decisions: workflowDecisionRulesForVisit(definition, state, jump.workflowVisitId).map(rule => ({ id: rule.id, name: rule.name, choices: [...new Set(rule.routes.filter(route => route.when === "OUTCOME").map(route => route.outcome))] })).filter(rule => rule.choices.length) });
  }
  try { return response(await readWorkflowGraph(membership.workspaceId, { contactId: query.get("contactId") || undefined, instanceId: query.get("instanceId") || undefined, query: query.get("q")?.slice(0, 160), offset: Math.max(0, Math.min(100000, Math.floor(Number(query.get("offset")) || 0))), days: Number(query.get("days")) || 30, focusedInstance: query.get("focusedInstance")?.slice(0, 160), node: query.get("node")?.slice(0, 180), status: query.get("status")?.slice(0, 30), stage: query.get("stage")?.slice(0, 160), peopleOffset: Math.max(0, Math.min(1000000, Math.floor(Number(query.get("peopleOffset")) || 0))), canEdit: !session.impersonation })); }
  catch { return response({ error: "Journey could not be loaded. Refresh to try again." }, 400); }
}

export async function POST(request: Request) {
  const session = await getCurrentSession(), membership = session?.user.memberships[0];
  if (!session || !membership) return response({ error: "Sign in to update your journey." }, 401);
  if (session.impersonation) return response({ error: "Administrator support sessions are view-only." }, 403);
  const limit = await consumeRateLimit({ scope: "api.mix-workflow", identifiers: [membership.workspaceId, session.user.id], limit: 90, windowMs: 60000, blockMs: 60000 });
  if (!limit.allowed) return response({ error: "Too many journey updates. Try again shortly." }, 429);
  try {
    const raw = await request.text();
    if (raw.length > 1000000) return response({ error: "This configuration is too large." }, 413);
    const input = command.parse(JSON.parse(raw));
    if (input.action === "remove-path") {
      const saved = await prisma.$transaction(db => removeWorkflowPath(db, membership.workspaceId, input.expectedRule, input.removal, session.user.id), { timeout: 30000 });
      wakeWorkerAfterResponse(membership.workspaceId);
      return response(saved);
    }
    if (input.action === "save-rule") {
      const saved = await prisma.$transaction(db => saveWorkflowRule(db, membership.workspaceId, input.rule, input.expectedRule, session.user.id), { timeout: 30000 });
      wakeWorkerAfterResponse(membership.workspaceId);
      return response(saved);
    }
    if (input.action === "configure") {
      const revision = await prisma.$transaction(db => saveWorkflowConfiguration(db, membership.workspaceId, input.configuration, input.expectedRevision, session.user.id), { timeout: 30000 });
      wakeWorkerAfterResponse(membership.workspaceId);
      return response({ revision });
    }
    if (input.action === "start") {
      const instanceId = await startWorkflowInstance({ ...input, workspaceId: membership.workspaceId });
      wakeWorkerAfterResponse(membership.workspaceId);
      return response({ instanceId });
    }
    await processWorkflowInstance(membership.workspaceId, input.instanceId, new Date(), input);
    return response({ saved: true });
  } catch (error) {
    if (error instanceof WorkflowRuleConflict) return response({ error: error.message, code: "CONNECTION_CHANGED", currentRule: error.currentRule }, 409);
    return response({ error: error instanceof z.ZodError ? "Check the connection's fields and try again." : error instanceof Error ? error.message : "The change could not be saved." }, 400);
  }
}
