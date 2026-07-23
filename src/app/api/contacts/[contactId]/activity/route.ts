import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { ContactActivityKind, ContactActivityVisibility, Prisma } from "@/generated/prisma/client";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";

const NOTE_KINDS: ContactActivityKind[] = ["CUSTOMER_NOTE", "PRIVATE_UPDATE"];

type NotePayload = {
  kind?: string;
  summary?: string;
  requestId?: string;
};

type NoteResponse = {
  id: string;
  kind: ContactActivityKind;
  visibility: ContactActivityVisibility;
  summary: string;
  occurredAt: string;
};

function clean(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function storedNote(value: Prisma.JsonValue | null): NoteResponse | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const object = value as Record<string, unknown>;
  if (!NOTE_KINDS.includes(object.kind as ContactActivityKind)) return null;
  return {
    id: String(object.id ?? ""),
    kind: object.kind as ContactActivityKind,
    visibility: object.visibility === "PRIVATE" ? "PRIVATE" : "WORKSPACE",
    summary: String(object.summary ?? ""),
    occurredAt: String(object.occurredAt ?? "")
  };
}

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function authenticatedContact(contactId: string) {
  const session = await getCurrentSession();
  const membership = session?.user.memberships[0];
  if (!session || !membership) return { error: NextResponse.json({ error: "Authentication required." }, { status: 401 }) } as const;
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, workspaceId: membership.workspaceId },
    select: { id: true, displayName: true, archivedAt: true }
  });
  if (!contact) return { error: NextResponse.json({ error: "Contact not found." }, { status: 404 }) } as const;
  return { session, membership, contact } as const;
}

export async function GET(_request: Request, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const scoped = await authenticatedContact(contactId);
  if ("error" in scoped) return scoped.error;

  const activities = await prisma.contactActivity.findMany({
    where: { workspaceId: scoped.membership.workspaceId, contactId },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 150
  });
  const linkedJumpIds = new Set(activities.flatMap((activity) => activity.jumpId ? [activity.jumpId] : []));
  const completedJumps = await prisma.jump.findMany({
    where: {
      workspaceId: scoped.membership.workspaceId,
      contactId,
      status: { in: ["DONE", "SENT", "SKIPPED"] },
      completedAt: { not: null }
    },
    include: { mix: { select: { name: true } }, stepVersion: { include: { stepTemplate: { select: { channel: true } } } } },
    orderBy: { completedAt: "desc" },
    take: 100
  });

  const items = [
    ...activities.map((activity) => ({
      id: activity.id,
      source: "activity" as const,
      kind: activity.kind,
      outcome: activity.outcome,
      channel: activity.channel,
      visibility: activity.visibility,
      summary: activity.summary,
      nextCommitmentAt: activity.nextCommitmentAt?.toISOString() ?? null,
      occurredAt: activity.occurredAt.toISOString()
    })),
    ...completedJumps.filter((jump) => !linkedJumpIds.has(jump.id)).map((jump) => ({
      id: `jump:${jump.id}`,
      source: "jump" as const,
      kind: "JUMP_OUTCOME" as const,
      outcome: jump.status === "SKIPPED" ? "SKIPPED" as const : "COMPLETED" as const,
      channel: jump.stepVersion.stepTemplate.channel,
      visibility: "WORKSPACE" as const,
      summary: `${jump.mix.name} · ${jump.reason}`,
      nextCommitmentAt: null,
      occurredAt: jump.completedAt!.toISOString()
    }))
  ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)).slice(0, 150);

  return NextResponse.json({ contact: scoped.contact, items });
}

export async function POST(request: Request, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const scoped = await authenticatedContact(contactId);
  if ("error" in scoped) return scoped.error;
  if (scoped.session.impersonation) return NextResponse.json({ error: "Administrator support sessions are view-only." }, { status: 403 });
  if (scoped.contact.archivedAt) return NextResponse.json({ error: "Restore this Contact before adding updates." }, { status: 409 });

  const requestMetadata = await getRequestMetadata();
  const rateLimit = await consumeRateLimit({
    scope: "api.contact-activity",
    identifiers: [scoped.membership.workspaceId, scoped.session.user.id, requestMetadata.ipAddress],
    limit: 60,
    windowMs: 60 * 1000,
    blockMs: 5 * 60 * 1000
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many updates. Try again shortly." }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
  }

  const payload = await request.json().catch(() => null) as NotePayload | null;
  const kind = clean(payload?.kind, 40).toUpperCase() as ContactActivityKind;
  const summary = clean(payload?.summary, 4000);
  if (!NOTE_KINDS.includes(kind)) return NextResponse.json({ error: "Choose Customer note or Private relationship update." }, { status: 400 });
  if (!summary) return NextResponse.json({ error: "Add a note before saving." }, { status: 400 });

  const requestId = clean(payload?.requestId, 120) || randomUUID();
  const key = `contact-activity:${contactId}:${requestId}`;
  const existing = await prisma.idempotencyKey.findUnique({
    where: { workspaceId_key: { workspaceId: scoped.membership.workspaceId, key } },
    select: { response: true }
  });
  const replay = storedNote(existing?.response ?? null);
  if (replay) return NextResponse.json({ item: replay, duplicate: true });

  try {
    const item = await prisma.$transaction(async (tx): Promise<NoteResponse> => {
      const duplicate = await tx.idempotencyKey.findUnique({
        where: { workspaceId_key: { workspaceId: scoped.membership.workspaceId, key } },
        select: { response: true }
      });
      const duplicateResponse = storedNote(duplicate?.response ?? null);
      if (duplicateResponse) return duplicateResponse;

      const visibility: ContactActivityVisibility = kind === "PRIVATE_UPDATE" ? "PRIVATE" : "WORKSPACE";
      const activity = await tx.contactActivity.create({
        data: {
          workspaceId: scoped.membership.workspaceId,
          contactId,
          actorUserId: scoped.session.user.id,
          kind,
          visibility,
          summary,
          metadata: { userAgent: requestMetadata.userAgent }
        }
      });
      await tx.auditLog.create({
        data: {
          workspaceId: scoped.membership.workspaceId,
          actorType: "USER",
          actorUserId: scoped.session.user.id,
          action: kind === "PRIVATE_UPDATE" ? "contact.private-update.add" : "contact.customer-note.add",
          entityType: "Contact",
          entityId: contactId,
          source: "contact.timeline",
          metadata: { activityId: activity.id, summaryLength: summary.length }
        }
      });
      const response: NoteResponse = {
        id: activity.id,
        kind,
        visibility,
        summary,
        occurredAt: activity.occurredAt.toISOString()
      };
      await tx.idempotencyKey.create({
        data: {
          workspaceId: scoped.membership.workspaceId,
          key,
          response: inputJson(response),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      });
      return response;
    });
    return NextResponse.json({ item });
  } catch (error) {
    const duplicate = await prisma.idempotencyKey.findUnique({
      where: { workspaceId_key: { workspaceId: scoped.membership.workspaceId, key } },
      select: { response: true }
    });
    const replayAfterRace = storedNote(duplicate?.response ?? null);
    if (replayAfterRace) return NextResponse.json({ item: replayAfterRace, duplicate: true });
    return NextResponse.json({ error: error instanceof Error ? error.message : "The update could not be saved." }, { status: 409 });
  }
}
