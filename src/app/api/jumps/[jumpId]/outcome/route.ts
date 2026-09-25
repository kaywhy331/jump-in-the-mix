import { applyJourneyEvent } from "@/lib/journey";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { NextResponse } from "next/server";
import { timezoneForUser } from "@/lib/display-preferences";
import type { ContactActivityVisibility, JumpOutcome, Prisma } from "@/generated/prisma/client";
import { getCurrentSession } from "@/lib/auth";
import { attachAttemptOutcome, parseAttemptPayload, recordJumpAttempt } from "@/lib/jump-attempts";
import { logicalDateKey, zonedDateTimeToUtc } from "@/lib/jump-schedule";
import { prisma } from "@/lib/prisma";
import { queueWorkflowForJump, workflowDefinition, workflowState } from "@/lib/mix-workflow";
import { workflowDecisionRulesForVisit } from "@/lib/mix-workflow-engine";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";

const OUTCOMES: JumpOutcome[] = [
  "COMPLETED",
  "CONNECTED",
  "LEFT_VOICEMAIL",
  "NO_ANSWER",
  "NOT_SENT",
  "WRONG_NUMBER",
  "RESCHEDULED",
  "SKIPPED",
  "REOPENED"
];

const COMPLETE_OUTCOMES: JumpOutcome[] = [
  "COMPLETED",
  "CONNECTED",
  "LEFT_VOICEMAIL",
  "NO_ANSWER",
  "WRONG_NUMBER",
  "RESCHEDULED"
];

type OutcomePayload = {
  outcome?: string;
  note?: string;
  visibility?: string;
  nextDate?: string;
  nextTime?: string;
  requestId?: string;
  attemptId?: unknown;
  attempt?: unknown;
  workflowDecisions?: Array<{ ruleId: string; outcome: string }>;
};

// What the recorded outcome can say about the preparation behind it. "attempt" links the exact
// content that was opened; "unavailable" means nothing was recorded or recoverable; "mismatch"
// means the device held a different payload than the stored attempt, which is left untouched.
type PreparationEvidence = "attempt" | "unavailable" | "mismatch";
const EVIDENCE: PreparationEvidence[] = ["attempt", "unavailable", "mismatch"];
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type StoredResponse = {
  status: "PENDING" | "DONE" | "SKIPPED";
  activityId: string;
  nextCommitmentAt: string | null;
  jumpDateId: string | null;
  attempt?: { id: string; evidence: PreparationEvidence };
};

function clean(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function validLogicalDate(value: string): { year: number; month: number; day: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) return null;
  return { year, month, day };
}

function timeMinutes(value: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function jsonResponse(value: Prisma.JsonValue | null): StoredResponse | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const object = value as Record<string, unknown>;
  if (!["PENDING", "DONE", "SKIPPED"].includes(String(object.status))) return null;
  const attempt = object.attempt && typeof object.attempt === "object" && !Array.isArray(object.attempt) ? object.attempt as Record<string, unknown> : null;
  return {
    status: object.status as StoredResponse["status"],
    activityId: String(object.activityId ?? ""),
    nextCommitmentAt: typeof object.nextCommitmentAt === "string" ? object.nextCommitmentAt : null,
    jumpDateId: typeof object.jumpDateId === "string" ? object.jumpDateId : null,
    ...(attempt && typeof attempt.id === "string" && EVIDENCE.includes(attempt.evidence as PreparationEvidence)
      ? { attempt: { id: attempt.id, evidence: attempt.evidence as PreparationEvidence } }
      : {})
  };
}

function responseJson(value: StoredResponse): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function POST(request: Request, { params }: { params: Promise<{ jumpId: string }> }) {
  const session = await getCurrentSession();
  const membership = session?.user.memberships[0];
  if (!session || !membership) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (session.impersonation) return NextResponse.json({ error: "Administrator support sessions are view-only." }, { status: 403 });

  const requestMetadata = await getRequestMetadata();
  const limit = await consumeRateLimit({
    scope: "api.jump-outcome",
    identifiers: [membership.workspaceId, session.user.id, requestMetadata.ipAddress],
    limit: 90,
    windowMs: 60 * 1000,
    blockMs: 5 * 60 * 1000
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many follow-up updates. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const payload = await request.json().catch(() => null) as OutcomePayload | null;
  const outcome = clean(payload?.outcome, 40).toUpperCase() as JumpOutcome;
  if (!OUTCOMES.includes(outcome)) return NextResponse.json({ error: "Choose a valid outcome." }, { status: 400 });

  const note = clean(payload?.note, 4000) || null;
  const visibility: ContactActivityVisibility = payload?.visibility === "PRIVATE" ? "PRIVATE" : "WORKSPACE";
  const requestId = clean(payload?.requestId, 120) || randomUUID();
  const { jumpId } = await params;
  const idempotencyKey = `jump-outcome:${jumpId}:${requestId}`;

  const existingResponse = await prisma.idempotencyKey.findUnique({
    where: { workspaceId_key: { workspaceId: membership.workspaceId, key: idempotencyKey } },
    select: { response: true }
  });
  const replay = jsonResponse(existingResponse?.response ?? null);
  if (replay) return NextResponse.json({ ...replay, duplicate: true });

  const jump = await prisma.jump.findFirst({
    where: { id: jumpId, workspaceId: membership.workspaceId },
    include: {
      contact: { select: { id: true, displayName: true } },
      workspace: { include: { profile: true } },
      stepVersion: { include: { stepTemplate: true } }
    }
  });
  if (!jump) return NextResponse.json({ error: "Follow-up not found." }, { status: 404 });
  // A refusal carries the follow-up's current status so a retry after a lost response can tell
  // "already recorded" apart from a real conflict.
  if (jump.status === "CANCELED") return NextResponse.json({ error: "This follow-up is no longer active.", status: jump.status }, { status: 409 });
  const decisionInput = z.array(z.object({ ruleId: z.string().min(1).max(160), outcome: z.string().min(1).max(160) }).strict()).max(50).safeParse(payload?.workflowDecisions ?? []);
  if (!decisionInput.success) return NextResponse.json({ error: "Choose valid journey outcomes." }, { status: 400 });
  const decisions = decisionInput.data;
  if (decisions.length) {
    const instance = jump.workflowInstanceId ? await prisma.mixWorkflowInstance.findFirst({ where: { id: jump.workflowInstanceId, workspaceId: membership.workspaceId } }) : null;
    const state = instance ? workflowState(instance.state) : null, definition = instance ? workflowDefinition(instance.definition) : null;
    const rules = definition && state ? workflowDecisionRulesForVisit(definition, state, jump.workflowVisitId) : [];
    if (!instance || instance.status !== "ACTIVE" || new Set(decisions.map(item => item.ruleId)).size !== decisions.length || decisions.some(choice => !rules.some(rule => rule.id === choice.ruleId && rule.routes.some(route => route.when === "OUTCOME" && route.outcome === choice.outcome)))) return NextResponse.json({ error: "These outcomes do not belong to this active Beat. Refresh its journey choices." }, { status: 400 });
  }

  const timezone = await timezoneForUser(session.user.id);
  const rawNextDate = clean(payload?.nextDate, 10);
  const rawNextTime = clean(payload?.nextTime, 5) || "10:00";
  const nextLogicalDate = rawNextDate ? validLogicalDate(rawNextDate) : null;
  const nextMinutes = rawNextDate ? timeMinutes(rawNextTime) : null;
  if (rawNextDate && (!nextLogicalDate || nextMinutes === null)) {
    return NextResponse.json({ error: "Choose a valid next follow-up date and time." }, { status: 400 });
  }
  if (outcome === "RESCHEDULED" && !nextLogicalDate) {
    return NextResponse.json({ error: "Choose when the rescheduled follow-up should happen." }, { status: 400 });
  }
  const nextCommitmentAt = nextLogicalDate && nextMinutes !== null
    ? zonedDateTimeToUtc(nextLogicalDate, nextMinutes, timezone)
    : null;
  if (nextCommitmentAt && nextCommitmentAt <= new Date()) {
    return NextResponse.json({ error: "The next follow-up must be in the future." }, { status: 400 });
  }

  // The tray records against the attempt it opened. When that attempt was never acknowledged the
  // same payload travels again and is created or acknowledged under the create-once rule; a
  // refused mismatch still records the owner's outcome, marked, with the stored row untouched.
  const attemptId = typeof payload?.attemptId === "string" && UUID_V4.test(payload.attemptId) ? payload.attemptId.toLowerCase() : null;
  let evidence: PreparationEvidence = "unavailable";
  if (attemptId) {
    if (payload?.attempt !== undefined && payload?.attempt !== null) {
      try {
        const attemptPayload = parseAttemptPayload(payload.attempt);
        if (attemptPayload.id !== attemptId) throw new RangeError("The attempt does not match its id.");
        const recorded = await recordJumpAttempt({ workspaceId: membership.workspaceId, jumpId: jump.id, payload: attemptPayload });
        evidence = recorded.ok ? "attempt" : recorded.reason === "mismatch" ? "mismatch" : "unavailable";
      } catch {
        evidence = "unavailable";
      }
    } else {
      const known = await prisma.jumpAttempt.findFirst({ where: { id: attemptId, workspaceId: membership.workspaceId, jumpId: jump.id }, select: { id: true } });
      evidence = known ? "attempt" : "unavailable";
    }
  }

  try {
    const result = await prisma.$transaction(async (tx): Promise<StoredResponse> => {
      const already = await tx.idempotencyKey.findUnique({
        where: { workspaceId_key: { workspaceId: membership.workspaceId, key: idempotencyKey } },
        select: { response: true }
      });
      const duplicate = jsonResponse(already?.response ?? null);
      if (duplicate) return duplicate;

      let nextStatus: StoredResponse["status"];
      if (outcome === "REOPENED") {
        const updated = await tx.jump.updateMany({
          where: { id: jump.id, workspaceId: membership.workspaceId, status: { in: ["DONE", "SKIPPED"] } },
          data: { status: "PENDING", completedAt: null, completionMethod: null }
        });
        if (updated.count !== 1) throw new Error("This follow-up is not available to reopen.");
        nextStatus = "PENDING";
      } else if (outcome === "RESCHEDULED" && jump.workflowInstanceId && nextCommitmentAt) {
        const updated = await tx.jump.updateMany({ where: { id: jump.id, workspaceId: membership.workspaceId, status: "PENDING" }, data: { scheduledAt: nextCommitmentAt, snoozedUntil: nextCommitmentAt, completedAt: null, completionMethod: null } });
        if (updated.count !== 1) throw new Error("This follow-up is no longer pending.");
        nextStatus = "PENDING";
      } else if (outcome === "NOT_SENT") {
        if (jump.status !== "PENDING") throw new Error("This follow-up is no longer pending.");
        nextStatus = "PENDING";
      } else if (outcome === "SKIPPED") {
        const updated = await tx.jump.updateMany({
          where: { id: jump.id, workspaceId: membership.workspaceId, status: "PENDING" },
          data: { status: "SKIPPED", completedAt: new Date(), completionMethod: "outcome:skipped" }
        });
        if (updated.count !== 1) throw new Error("This follow-up is no longer pending.");
        nextStatus = "SKIPPED";
      } else {
        const updated = await tx.jump.updateMany({
          where: { id: jump.id, workspaceId: membership.workspaceId, status: "PENDING" },
          data: { status: "DONE", completedAt: new Date(), completionMethod: `outcome:${outcome.toLowerCase()}` }
        });
        if (updated.count !== 1 || !COMPLETE_OUTCOMES.includes(outcome)) throw new Error("This follow-up is no longer pending.");
        nextStatus = "DONE";
      }

      if (outcome === "CONNECTED") await applyJourneyEvent(tx, { workspaceId: membership.workspaceId, contactId: jump.contactId, eventKey: `call:${jump.id}:${requestId}`, eventType: "CONVERSATION_STARTED", source: "Connected call", actorUserId: session.user.id });
      await queueWorkflowForJump(tx, membership.workspaceId, jump.id, nextStatus === "DONE" || nextStatus === "SKIPPED" ? decisions : undefined, requestId);

      let jumpDateId: string | null = null;
      if (nextLogicalDate && nextCommitmentAt && nextMinutes !== null && !(outcome === "RESCHEDULED" && jump.workflowInstanceId)) {
        const followUpType = await tx.dateType.findFirst({
          where: { scopeKey: "system", slug: "follow-up", isActive: true },
          select: { id: true }
        });
        if (!followUpType) throw new Error("The follow-up date type is unavailable.");
        const jumpDate = await tx.jumpDate.create({
          data: {
            workspaceId: membership.workspaceId,
            contactId: jump.contactId,
            dateTypeId: followUpType.id,
            dateValue: new Date(Date.UTC(nextLogicalDate.year, nextLogicalDate.month - 1, nextLogicalDate.day, 12)),
            month: nextLogicalDate.month,
            day: nextLogicalDate.day,
            timeMinutes: nextMinutes,
            recurrence: "NONE",
            timezone,
            label: note ? `Next commitment · ${note.slice(0, 180)}` : "Next follow-up"
          }
        });
        jumpDateId = jumpDate.id;
        await tx.job.create({
          data: { workspaceId: membership.workspaceId, task: "generate-jumps", payload: { contactId: jump.contactId } }
        });
      }

      const activity = await tx.contactActivity.create({
        data: {
          workspaceId: membership.workspaceId,
          contactId: jump.contactId,
          jumpId: jump.id,
          actorUserId: session.user.id,
          kind: "JUMP_OUTCOME",
          outcome,
          channel: jump.stepVersion.stepTemplate.channel,
          visibility,
          summary: note,
          nextCommitmentAt,
          metadata: {
            jumpReason: jump.reason,
            ...(decisions.length && ["DONE", "SKIPPED"].includes(nextStatus) ? { workflowDecisions: decisions } : {}),
            contactName: jump.contact.displayName,
            previousStatus: jump.status,
            nextStatus,
            userAgent: requestMetadata.userAgent,
            ...(attemptId ? { attemptId, preparationEvidence: evidence } : {})
          }
        }
      });
      if (attemptId && evidence === "attempt") {
        await attachAttemptOutcome(tx, { workspaceId: membership.workspaceId, jumpId: jump.id, attemptId, outcomeActivityId: activity.id, recordedAt: new Date() });
      }

      await tx.auditLog.create({
        data: {
          workspaceId: membership.workspaceId,
          actorType: "USER",
          actorUserId: session.user.id,
          action: outcome === "REOPENED" ? "jump.reopen" : "jump.outcome",
          entityType: "Jump",
          entityId: jump.id,
          source: "today.outcome",
          metadata: { outcome, nextStatus, activityId: activity.id, jumpDateId, logicalDate: nextLogicalDate ? logicalDateKey(nextLogicalDate) : null }
        }
      });

      const response: StoredResponse = {
        status: nextStatus,
        activityId: activity.id,
        nextCommitmentAt: nextCommitmentAt?.toISOString() ?? null,
        jumpDateId,
        ...(attemptId ? { attempt: { id: attemptId, evidence } } : {})
      };
      await tx.idempotencyKey.create({
        data: {
          workspaceId: membership.workspaceId,
          key: idempotencyKey,
          response: responseJson(response),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      });
      return response;
    });

    return NextResponse.json(result);
  } catch (error) {
    const duplicate = await prisma.idempotencyKey.findUnique({
      where: { workspaceId_key: { workspaceId: membership.workspaceId, key: idempotencyKey } },
      select: { response: true }
    });
    const replayAfterRace = jsonResponse(duplicate?.response ?? null);
    if (replayAfterRace) return NextResponse.json({ ...replayAfterRace, duplicate: true });
    // The status read before the transaction can be stale when another request finished first; the
    // refusal reports what the follow-up is now, falling back to that read if the lookup fails.
    const current = await prisma.jump.findFirst({ where: { id: jump.id, workspaceId: membership.workspaceId }, select: { status: true } }).catch(() => null);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The follow-up outcome could not be saved.", status: current?.status ?? jump.status },
      { status: 409 }
    );
  }
}
