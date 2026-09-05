import { NextResponse } from "next/server";
import { timezoneForUser } from "@/lib/display-preferences";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";
import {
  cancelContactImportBatch,
  getContactImportBatch,
  listRecentContactImportBatches,
  queueContactImportBatch
} from "@/lib/contact-import-jobs";
import { stableKey } from "@/lib/contact-import-shared";
import { commitContactImportBatch, findImportMatches } from "@/lib/contact-import-service";
import { activeGroupIdsForWorkspace } from "@/lib/group-activity";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";

const MAX_BODY_BYTES = 12 * 1024 * 1024;
const nullableText = (length: number) => z.string().max(length).nullable();
const recurrenceSchema = z.enum(["NONE", "MONTHLY", "YEARLY"]);
const importRecordSchema = z.object({
  rowId: z.string().min(1).max(160),
  sourceRow: z.number().int().positive(),
  source: z.enum(["CSV", "VCF"]),
  firstName: nullableText(120),
  lastName: nullableText(120),
  displayName: nullableText(240),
  company: nullableText(240),
  publicNotes: nullableText(20_000),
  emails: z.array(z.object({ value: z.string().min(1).max(320), label: nullableText(80), isPrimary: z.boolean() })).max(20),
  phones: z.array(z.object({ value: z.string().min(1).max(80), label: nullableText(80), isPrimary: z.boolean() })).max(20),
  addresses: z.array(z.object({
    label: nullableText(80),
    street1: nullableText(240),
    street2: nullableText(240),
    city: nullableText(120),
    state: nullableText(120),
    postalCode: nullableText(40),
    country: nullableText(120),
    isPrimary: z.boolean()
  })).max(20),
  groupIds: z.array(z.string().min(1).max(100)).max(30),
  customFields: z.array(z.object({ definitionId: z.string().min(1).max(100), value: z.string().max(2000) })).max(100),
  jumpDates: z.array(z.object({
    dateTypeId: nullableText(100),
    dateTypeName: nullableText(100),
    label: nullableText(160),
    dateValue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    month: z.number().int().min(1).max(12).nullable(),
    day: z.number().int().min(1).max(31).nullable(),
    recurrence: recurrenceSchema
  })).max(30)
}).strict();

const resolutionSchema = z.object({
  rowId: z.string().min(1).max(160),
  action: z.enum(["CREATE", "MERGE", "REPLACE", "SKIP"]),
  targetContactId: nullableText(100)
}).strict();

const commitItemSchema = z.object({ record: importRecordSchema, resolution: resolutionSchema }).strict();
const resultSchema = z.object({
  rowId: z.string().min(1).max(160),
  sourceRow: z.number().int().positive(),
  status: z.enum(["CREATED", "MERGED", "REPLACED", "SKIPPED", "FAILED"]),
  contactId: nullableText(100),
  message: z.string().max(2000)
}).strict();

const requestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("match"), records: z.array(importRecordSchema).min(1).max(100) }).strict(),
  z.object({
    mode: z.literal("commit"),
    importId: z.string().regex(/^[a-zA-Z0-9_-]{8,120}$/),
    items: z.array(commitItemSchema).min(1).max(50)
  }).strict(),
  z.object({
    mode: z.literal("queue"),
    importId: z.string().regex(/^[a-zA-Z0-9_-]{8,120}$/),
    sourceFileName: z.string().max(240).nullable().optional(),
    items: z.array(commitItemSchema).max(5000),
    initialResults: z.array(resultSchema).max(5000).default([])
  }).strict()
]);

type CommitItems = Extract<z.infer<typeof requestSchema>, { mode: "commit" | "queue" }>["items"];

async function reuseAvailableDateTypes(workspaceId: string, items: CommitItems): Promise<CommitItems> {
  const available = await prisma.dateType.findMany({
    where: { OR: [{ workspaceId }, { workspaceId: null, isSystem: true }] },
    select: { id: true, name: true }
  });
  const byName = new Map(available.map((type) => [stableKey(type.name), type.id]));
  return items.map((item) => ({
    ...item,
    record: {
      ...item.record,
      jumpDates: item.record.jumpDates.map((jumpDate) => {
        if (jumpDate.dateTypeId || !jumpDate.dateTypeName) return jumpDate;
        const existingId = byName.get(stableKey(jumpDate.dateTypeName));
        return existingId ? { ...jumpDate, dateTypeId: existingId, dateTypeName: null } : jumpDate;
      })
    }
  }));
}

async function assertActiveGroupReferences(workspaceId: string, items: CommitItems): Promise<void> {
  const requestedIds = [...new Set(items.flatMap((item) => item.record.groupIds))];
  if (!requestedIds.length) return;
  const activeIds = await activeGroupIdsForWorkspace(workspaceId, requestedIds);
  if (activeIds.length !== requestedIds.length) {
    throw new Error("One or more selected tags are hidden. Choose an active tag from Contacts before importing.");
  }
}

async function context(request: Request) {
  const session = await getCurrentSession();
  const membership = session?.user.memberships[0];
  if (!session || !membership) return { error: NextResponse.json({ error: "Authentication required." }, { status: 401 }) } as const;
  if (session.impersonation) return { error: NextResponse.json({ error: "Administrator support sessions are view-only." }, { status: 403 }) } as const;
  const metadata = await getRequestMetadata();
  const rateLimit = await consumeRateLimit({
    scope: "api.contact-import",
    identifiers: [membership.workspaceId, session.authUser.id, metadata.ipAddress],
    limit: 240,
    windowMs: 60 * 60 * 1000,
    blockMs: 15 * 60 * 1000
  });
  if (!rateLimit.allowed) {
    return { error: NextResponse.json({ error: "Too many import requests. Try again shortly." }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }) } as const;
  }
  return { session, membership } as const;
}

export async function GET(request: Request) {
  const scoped = await context(request);
  if ("error" in scoped) return scoped.error;
  const url = new URL(request.url);
  const batchId = url.searchParams.get("batchId")?.trim();
  if (batchId) {
    const batch = await getContactImportBatch(scoped.membership.workspaceId, batchId);
    return batch ? NextResponse.json({ batch }) : NextResponse.json({ error: "Import batch not found." }, { status: 404 });
  }
  return NextResponse.json({ batches: await listRecentContactImportBatches(scoped.membership.workspaceId) });
}

export async function DELETE(request: Request) {
  const scoped = await context(request);
  if ("error" in scoped) return scoped.error;
  const batchId = new URL(request.url).searchParams.get("batchId")?.trim();
  if (!batchId) return NextResponse.json({ error: "Choose the import to cancel." }, { status: 400 });
  const canceled = await cancelContactImportBatch(scoped.membership.workspaceId, batchId);
  return canceled
    ? NextResponse.json({ canceled: true })
    : NextResponse.json({ error: "This import can no longer be canceled." }, { status: 409 });
}

export async function POST(request: Request) {
  const scoped = await context(request);
  if ("error" in scoped) return scoped.error;
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "The import request is too large. Split the file into smaller batches." }, { status: 413 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "The import payload is invalid.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    if (parsed.data.mode === "match") {
      const result = await findImportMatches(scoped.membership.workspaceId, parsed.data.records);
      return NextResponse.json(result);
    }
    await assertActiveGroupReferences(scoped.membership.workspaceId, parsed.data.items);
    const items = await reuseAvailableDateTypes(scoped.membership.workspaceId, parsed.data.items);
    if (parsed.data.mode === "queue") {
      const batch = await queueContactImportBatch({
        workspaceId: scoped.membership.workspaceId,
        actorUserId: scoped.session.authUser.id,
        importId: parsed.data.importId,
        sourceFileName: parsed.data.sourceFileName,
        items,
        initialResults: parsed.data.initialResults
      });
      return NextResponse.json({ batch }, { status: batch.status === "QUEUED" ? 202 : 200 });
    }
    const results = await commitContactImportBatch({
      workspaceId: scoped.membership.workspaceId,
      actorUserId: scoped.session.authUser.id,
      timezone: await timezoneForUser(scoped.session.user.id),
      importId: parsed.data.importId,
      items
    });
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The Contact import could not be processed." },
      { status: 400 }
    );
  }
}
