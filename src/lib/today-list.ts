import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const TODAY_PAGE_SIZE = 30;
type Cursor = { pending: boolean; scheduledAt: string; id: string };
type Direction = "after" | "before";

export function parseTodayCursor(value: unknown): Cursor | null {
  if (typeof value !== "string" || value.length > 600 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const cursor: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!cursor || typeof cursor !== "object") return null;
    const { pending, scheduledAt, id } = cursor as Partial<Cursor>;
    if (typeof pending !== "boolean" || typeof id !== "string" || !/^[A-Za-z0-9_-]{1,180}$/.test(id)) return null;
    if (typeof scheduledAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(scheduledAt)) return null;
    if (Number(scheduledAt.slice(0, 4)) < 1) return null;
    if (new Date(scheduledAt).toISOString() !== scheduledAt) return null;
    return { pending, scheduledAt, id };
  } catch { return null; }
}

function cursorFor(item: { id: string; status: string; scheduledAt: Date }): Cursor {
  return { pending: item.status === "PENDING", scheduledAt: item.scheduledAt.toISOString(), id: item.id };
}

export function todayCursor(item: { id: string; status: string; scheduledAt: Date }): string {
  return Buffer.from(JSON.stringify(cursorFor(item))).toString("base64url");
}

function withinGroup(cursor: Cursor, direction: Direction): Prisma.JumpWhereInput {
  const comparison = direction === "after" ? "gt" : "lt";
  const scheduledAt = new Date(cursor.scheduledAt);
  return { OR: [{ scheduledAt: { [comparison]: scheduledAt } }, { scheduledAt, id: { [comparison]: cursor.id } }] };
}

function beyond(cursor: Cursor, direction: Direction): Prisma.JumpWhereInput {
  const sameGroup: Prisma.JumpWhereInput = cursor.pending ? { status: "PENDING" } : { status: { in: ["DONE", "SKIPPED"] } };
  const crossesGroup = direction === "after" ? cursor.pending : !cursor.pending;
  const otherGroup: Prisma.JumpWhereInput = cursor.pending ? { status: { in: ["DONE", "SKIPPED"] } } : { status: "PENDING" };
  const same: Prisma.JumpWhereInput = { AND: [sameGroup, withinGroup(cursor, direction)] };
  return crossesGroup ? { OR: [same, otherGroup] } : same;
}

const select = {
  id: true, contactId: true, mixId: true, scheduledAt: true, status: true, updatedAt: true, reason: true, renderedSnapshot: true,
  contact: { select: { displayName: true, emails: { select: { email: true, isPrimary: true } }, phones: { select: { phone: true, isPrimary: true } } } },
  mix: { select: { name: true, source: true } },
  stepVersion: { select: { stepTemplate: { select: { channel: true } } } }
} satisfies Prisma.JumpSelect;

/** Cursor values describe an ordering position, never a workspace or authority.
 * Open work precedes completed history; both groups sort by time and stable ID.
 * Reading both bounded groups also handles a page spanning their boundary. */
export async function readTodayPage(workspaceId: string, filters: Prisma.JumpWhereInput, input: { after?: unknown; before?: unknown } = {}) {
  const after = parseTodayCursor(input.after);
  const before = after ? null : parseTodayCursor(input.before);
  const cursor = after ?? before;
  const direction: Direction = before ? "before" : "after";
  const base: Prisma.JumpWhereInput = { AND: [{ workspaceId }, { status: { in: ["PENDING", "DONE", "SKIPPED"] } }, filters] };

  const read = async (position: Cursor | null, order: Direction) => {
    const sort = order === "after" ? "asc" as const : "desc" as const;
    const groups = await Promise.all([true, false].map(pending => {
      if (position && pending !== position.pending && (order === "after" ? pending : !pending)) return [];
      return prisma.jump.findMany({
        where: { AND: [base, pending ? { status: "PENDING" } : { status: { in: ["DONE", "SKIPPED"] } }, ...(position?.pending === pending ? [withinGroup(position, order)] : [])] },
        select, orderBy: [{ scheduledAt: sort }, { id: sort }], take: TODAY_PAGE_SIZE
      });
    }));
    const items = (order === "after" ? groups.flat() : [...groups].reverse().flat()).slice(0, TODAY_PAGE_SIZE);
    return order === "before" ? items.reverse() : items;
  };

  let items = await read(cursor, direction);
  let reset = false;
  if (!items.length && cursor) { items = await read(null, "after"); reset = items.length > 0; }
  const first = items[0], last = items.at(-1);
  const [previous, next] = first && last ? await Promise.all([
    prisma.jump.findFirst({ where: { AND: [base, beyond(cursorFor(first), "before")] }, select: { id: true } }),
    prisma.jump.findFirst({ where: { AND: [base, beyond(cursorFor(last), "after")] }, select: { id: true } })
  ]) : [null, null];
  return { items, previous: previous && first ? todayCursor(first) : null, next: next && last ? todayCursor(last) : null, reset };
}
