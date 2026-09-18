import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma, type ContactActivityKind, type ContactActivityVisibility } from "@/generated/prisma/client";
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

export async function GET(request: Request, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const scoped = await authenticatedContact(contactId);
  if ("error" in scoped) return scoped.error;
  const query = new URL(request.url).searchParams;
  const filter = query.get("filter");
  let cursor: { at: Date; key: string } | null = null;
  try {
    if (query.has("cursor")) {
      const raw = query.get("cursor")!;
      if (raw.length > 1000) throw new Error();
      const value = JSON.parse(Buffer.from(raw, "base64url").toString());
      if (typeof value.at !== "string" || typeof value.key !== "string" || value.key.length > 180 || !/^(activity|jump):/.test(value.key)) throw new Error();
      cursor = { at: new Date(value.at), key: value.key };
      if (Number.isNaN(+cursor.at)) throw new Error();
    }
  } catch { return NextResponse.json({ error: "The history position is invalid. Refresh the timeline." }, { status: 400 }); }
  const kind = filter === "NOTES" ? Prisma.sql`AND a.kind IN ('CUSTOMER_NOTE', 'PRIVATE_UPDATE')` : filter === "COMMUNICATIONS" ? Prisma.sql`AND a.kind = 'JUMP_OUTCOME'` : Prisma.empty;
  const workspaceId = scoped.membership.workspaceId;
  const keys = await prisma.$queryRaw<Array<{ id: string; key: string; source: string; occurredAt: Date }>>(Prisma.sql`
    SELECT * FROM (
      SELECT a.id, 'activity:' || a.id AS key, 'activity' AS source, a."occurredAt" FROM "ContactActivity" a
      WHERE a."workspaceId" = ${workspaceId} AND a."contactId" = ${contactId} ${kind}
      UNION ALL
      SELECT j.id, 'jump:' || j.id AS key, 'jump' AS source, j."completedAt" AS "occurredAt" FROM "Jump" j
      WHERE j."workspaceId" = ${workspaceId} AND j."contactId" = ${contactId} AND j.status IN ('DONE', 'SKIPPED') AND j."completedAt" IS NOT NULL
      AND ${filter !== "NOTES"} AND NOT EXISTS (SELECT 1 FROM "ContactActivity" a WHERE a."workspaceId" = ${workspaceId} AND a."contactId" = ${contactId} AND a."jumpId" = j.id)
    ) history
    ${cursor ? Prisma.sql`WHERE ("occurredAt" < ${cursor.at} OR ("occurredAt" = ${cursor.at} AND key COLLATE "C" < ${cursor.key}))` : Prisma.empty}
    ORDER BY "occurredAt" DESC, key COLLATE "C" DESC LIMIT 51
  `);
  const selected = keys.slice(0, 50);
  const [activities, completedJumps] = await Promise.all([
    prisma.contactActivity.findMany({ where: { workspaceId, contactId, id: { in: selected.filter(row => row.source === "activity").map(row => row.id) } } }),
    prisma.jump.findMany({ where: { workspaceId, contactId, id: { in: selected.filter(row => row.source === "jump").map(row => row.id) } }, include: { mix: { select: { name: true } }, stepVersion: { include: { stepTemplate: { select: { channel: true } } } } } })
  ]);
  const items = selected.flatMap(row => {
    const activity = activities.find(item => row.source === "activity" && item.id === row.id);
    if (activity) return [{ id: activity.id, source: "activity", kind: activity.kind, outcome: activity.outcome, channel: activity.channel, visibility: activity.visibility, summary: activity.summary, nextCommitmentAt: activity.nextCommitmentAt?.toISOString() ?? null, occurredAt: activity.occurredAt.toISOString() }];
    const jump = completedJumps.find(item => row.source === "jump" && item.id === row.id);
    return jump ? [{ id: `jump:${jump.id}`, source: "jump", kind: "JUMP_OUTCOME" as const, outcome: jump.status === "SKIPPED" ? "SKIPPED" as const : "COMPLETED" as const, channel: jump.stepVersion.stepTemplate.channel, visibility: "WORKSPACE" as const, summary: `${jump.mix.name} · ${jump.reason}`, nextCommitmentAt: null, occurredAt: jump.completedAt!.toISOString() }] : [];
  });
  const last = selected.at(-1);
  const nextCursor = keys.length > 50 && last ? Buffer.from(JSON.stringify({ at: last.occurredAt.toISOString(), key: last.key })).toString("base64url") : null;
  return NextResponse.json({ contact: scoped.contact, items, nextCursor }, { headers: { "Cache-Control": "private, no-store" } });
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
  if (!NOTE_KINDS.includes(kind)) return NextResponse.json({ error: "Choose a regular or private note." }, { status: 400 });
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

export async function PATCH(request: Request, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const scoped = await authenticatedContact(contactId);
  if ("error" in scoped) return scoped.error;
  if (scoped.session.impersonation) return NextResponse.json({ error: "Administrator support sessions are view-only." }, { status: 403 });
  const rate = await consumeRateLimit({ scope: "api.contact-note-edit", identifiers: [scoped.membership.workspaceId, scoped.session.user.id], limit: 60, windowMs: 60_000, blockMs: 5 * 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many note changes. Try again shortly." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  const input = await request.json().catch(() => null) as { id?: unknown; summary?: unknown; expectedSummary?: unknown; remove?: unknown } | null;
  const id = clean(input?.id, 120), summary = clean(input?.summary, 4000);
  const remove = input?.remove === true;
  if (!id || (!remove && !summary) || typeof input?.expectedSummary !== "string") return NextResponse.json({ error: "Choose a note and provide the corrected text." }, { status: 400 });
  const workspaceId = scoped.membership.workspaceId;
  const changed = await prisma.$transaction(async tx => {
    const where = { id, workspaceId, contactId, kind: { in: NOTE_KINDS }, summary: input.expectedSummary as string };
    const result = remove ? await tx.contactActivity.deleteMany({ where }) : await tx.contactActivity.updateMany({ where, data: { summary } });
    if (result.count) await tx.auditLog.create({ data: { workspaceId, actorType: "USER", actorUserId: scoped.session.user.id, action: remove ? "contact.note.remove" : "contact.note.correct", entityType: "Contact", entityId: contactId, source: "contact.timeline", metadata: { activityId: id, summaryLength: remove ? 0 : summary.length } } });
    return result.count;
  });
  if (!changed) return NextResponse.json({ error: "This note changed or is no longer available. Refresh and review it before trying again." }, { status: 409 });
  return NextResponse.json({ saved: true });
}
