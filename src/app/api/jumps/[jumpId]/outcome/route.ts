import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { ContactActivityVisibility, JumpOutcome, Prisma } from "@/generated/prisma/client";
import { getCurrentSession } from "@/lib/auth";
import { logicalDateKey, zonedDateTimeToUtc } from "@/lib/jump-schedule";
import { prisma } from "@/lib/prisma";
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
};

type StoredResponse = {
  status: "PENDING" | "DONE" | "SKIPPED";
  activityId: string;
  nextCommitmentAt: string | null;
  jumpDateId: string | null;
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
  return {
    status: object.status as StoredResponse["status"],
    activityId: String(object.activityId ?? ""),
    nextCommitmentAt: typeof object.nextCommitmentAt === "string" ? object.nextCommitmentAt : null,
    jumpDateId: typeof object.jumpDateId === "string" ? object.jumpDateId : null
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
      { error: "Too many Jump updates. Try again shortly." },
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
  if (!jump) return NextResponse.json({ error: "Jump not found." }, { status: 404 });
  if (jump.status === "CANCELED") return NextResponse.json({ error: "This Jump is no longer active." }, { status: 409 });

  const timezone = jump.workspace.profile?.timezone ?? "UTC";
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
          where: { id: jump.id, workspaceId: membership.workspaceId, status: { in: ["DONE", "SENT", "SKIPPED"] } },
          data: { status: "PENDING", completedAt: null, completionMethod: null }
        });
        if (updated.count !== 1) throw new Error("This Jump is not available to reopen.");
        nextStatus = "PENDING";
      } else if (outcome === "NOT_SENT") {
        if (!["PENDING", "COPIED"].includes(jump.status)) throw new Error("This Jump is no longer pending.");
        nextStatus = "PENDING";
      } else if (outcome === "SKIPPED") {
        const updated = await tx.jump.updateMany({
          where: { id: jump.id, workspaceId: membership.workspaceId, status: { in: ["PENDING", "COPIED"] } },
          data: { status: "SKIPPED", completedAt: new Date(), completionMethod: "outcome:skipped" }
        });
        if (updated.count !== 1) throw new Error("This Jump is no longer pending.");
        nextStatus = "SKIPPED";
      } else {
        const updated = await tx.jump.updateMany({
          where: { id: jump.id, workspaceId: membership.workspaceId, status: { in: ["PENDING", "COPIED"] } },
          data: { status: "DONE", completedAt: new Date(), completionMethod: `outcome:${outcome.toLowerCase()}` }
        });
        if (updated.count !== 1 || !COMPLETE_OUTCOMES.includes(outcome)) throw new Error("This Jump is no longer pending.");
        nextStatus = "DONE";
      }

      let jumpDateId: string | null = null;
      if (nextLogicalDate && nextCommitmentAt && nextMinutes !== null) {
        const followUpType = await tx.dateType.findFirst({
          where: { scopeKey: "system", slug: "follow-up", isActive: true },
          select: { id: true }
        });
        if (!followUpType) throw new Error("The Follow-up Important Date type is unavailable.");
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
            contactName: jump.contact.displayName,
            previousStatus: jump.status,
            nextStatus,
            userAgent: requestMetadata.userAgent
          }
        }
      });

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
        jumpDateId
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The Jump outcome could not be saved." },
      { status: 409 }
    );
  }
}
