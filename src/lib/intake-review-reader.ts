import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { intakeMatches, parseIntakePayload } from "@/lib/intake";
import type { NextActionCandidate } from "@/lib/next-action";

/** All callers obtain workspaceId from their authenticated workspace session. */
export function intakeReviewWhere(workspaceId: string, query = ""): Prisma.IntakeReceiptWhereInput {
  return { connection: { workspaceId }, status: "REVIEW", ...(query ? {
    OR: ["displayName", "email", "phone", "company"].map(key => ({ payload: { path: [key], string_contains: query, mode: "insensitive" as const } }))
  } : {}) };
}

// Never select connection credentials for daily work, including server-rendered props.
const reviewSelect = { id: true, connectionId: true, contactId: true, payload: true, createdAt: true,
  connection: { select: { name: true } } } satisfies Prisma.IntakeReceiptSelect;
type ReviewReceipt = Prisma.IntakeReceiptGetPayload<{ select: typeof reviewSelect }>;

export function intakeReviewWorkItem(workspaceId: string, receipt: ReviewReceipt): NextActionCandidate {
  const payload = parseIntakePayload(receipt.payload);
  return { id: `${workspaceId}:receipt:${receipt.id}`, receiptId: receipt.id, contactId: receipt.contactId,
    contactName: payload.displayName || payload.email || payload.phone || "Incoming inquiry",
    kind: "intake-review", title: "Needs review", detail: `Inquiry from ${receipt.connection.name}`,
    action: "Review inquiry", href: `/contacts/review?${new URLSearchParams({ receipt: receipt.id })}#receipt-${encodeURIComponent(receipt.id)}`,
    dueAt: null, updatedAt: receipt.createdAt.toISOString() };
}

/** Full receipt set for the shared snapshot: one identity per inquiry, never per possible match. */
export async function readIntakeReviewWorkItems(db: Prisma.TransactionClient, workspaceId: string) {
  const items: NextActionCandidate[] = [];
  let after: string | undefined;
  for (;;) {
    const rows = await db.intakeReceipt.findMany({ where: { ...intakeReviewWhere(workspaceId), ...(after ? { id: { gt: after } } : {}) },
      select: reviewSelect, orderBy: { id: "asc" }, take: 250 });
    items.push(...rows.map(receipt => intakeReviewWorkItem(workspaceId, receipt)));
    if (rows.length < 250) return items;
    after = rows.at(-1)!.id;
  }
}

export async function readIntakeReviewCount(workspaceId: string): Promise<number | null> {
  try { return await prisma.intakeReceipt.count({ where: intakeReviewWhere(workspaceId) }); }
  catch { return null; }
}

export type IntakeReviewQuery = { reviewQ?: string; reviewPage?: string; receipt?: string };
export async function readIntakeReviews(workspaceId: string, query: IntakeReviewQuery = {}) {
  const search = (query.reviewQ ?? "").trim().slice(0, 160);
  return prisma.$transaction(async db => {
    const where = intakeReviewWhere(workspaceId, search);
    const count = await db.intakeReceipt.count({ where });
    const pages = Math.max(1, Math.ceil(count / 10));
    let page = Math.min(pages, Math.max(1, Number.parseInt(query.reviewPage ?? "1", 10) || 1));
    // A stable receipt link opens its actual page; it never guesses or creates a person.
    if (query.receipt) {
      const selected = await db.intakeReceipt.findFirst({ where: { AND: [where, { id: query.receipt }] }, select: { id: true, createdAt: true } });
      if (selected) page = 1 + Math.floor(await db.intakeReceipt.count({ where: { AND: [where, { OR: [
        { createdAt: { lt: selected.createdAt } }, { createdAt: selected.createdAt, id: { lt: selected.id } }
      ] }] } }) / 10);
    }
    const rows = await db.intakeReceipt.findMany({ where, select: reviewSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 10, skip: (page - 1) * 10 });
    const items = await Promise.all(rows.map(async receipt => {
      const payload = parseIntakePayload(receipt.payload);
      return { work: intakeReviewWorkItem(workspaceId, receipt), payload, sourceName: receipt.connection.name,
        matches: await intakeMatches(db, workspaceId, receipt.connectionId, payload) };
    }));
    return { count, page, pages, search, items };
  }, { isolationLevel: "RepeatableRead" });
}
export type IntakeReviews = Awaited<ReturnType<typeof readIntakeReviews>>;
