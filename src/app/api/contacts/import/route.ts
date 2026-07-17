import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";
import { stableKey } from "@/lib/contact-import-shared";
import { commitContactImportBatch, findImportMatches } from "@/lib/contact-import-service";
import { activeGroupIdsForWorkspace } from "@/lib/group-activity";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";

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

const requestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("match"), records: z.array(importRecordSchema).min(1).max(100) }).strict(),
  z.object({
    mode: z.literal("commit"),
    importId: z.string().regex(/^[a-zA-Z0-9_-]{8,120}$/),
    items: z.array(z.object({ record: importRecordSchema, resolution: resolutionSchema }).strict()).min(1).max(50)
  }).strict()
]);

type CommitItems = Extract<z.infer<typeof requestSchema>, { mode: "commit" }>["items"];

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
    throw new Error("One or more selected Contact Groups are inactive. Choose an active group from Contacts before importing.");
  }
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  const membership = session?.user.memberships[0];
  if (!session || !membership) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (session.impersonation) return NextResponse.json({ error: "Administrator support sessions are view-only." }, { status: 403 });

  const metadata = await getRequestMetadata();
  const rateLimit = await consumeRateLimit({
    scope: "api.contact-import",
    identifiers: [membership.workspaceId, session.authUser.id, metadata.ipAddress],
    limit: 240,
    windowMs: 60 * 60 * 1000,
    blockMs: 15 * 60 * 1000
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many import requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "The import payload is invalid.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    if (parsed.data.mode === "match") {
      const result = await findImportMatches(membership.workspaceId, membership.workspace.planTier, parsed.data.records);
      return NextResponse.json(result);
    }
    await assertActiveGroupReferences(membership.workspaceId, parsed.data.items);
    const items = await reuseAvailableDateTypes(membership.workspaceId, parsed.data.items);
    const results = await commitContactImportBatch({
      workspaceId: membership.workspaceId,
      actorUserId: session.authUser.id,
      planTier: membership.workspace.planTier,
      timezone: membership.workspace.profile?.timezone ?? "America/New_York",
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
