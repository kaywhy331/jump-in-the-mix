import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const TODAY_PAGE_SIZE = 30;
type Cursor = { pending: boolean; scheduledAt: string; id: string };
type Direction = "after" | "before";
type GroupFilters = { pending?: Prisma.JumpWhereInput; completed?: Prisma.JumpWhereInput };

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
  // The OR alone is only a row filter, so an ordered scan walks every record on
  // the far side of the cursor before it can stop; the empty first/last-page
  // probe then reads a whole populated history group. The inclusive bound is
  // implied by the OR and lets the planner start the scan at the cursor.
  return { AND: [
    { scheduledAt: { [direction === "after" ? "gte" : "lte"]: scheduledAt } },
    { OR: [{ scheduledAt: { [comparison]: scheduledAt } }, { scheduledAt, id: { [comparison]: cursor.id } }] }
  ] };
}

const select = {
  appointmentBinding: { select: { automaticDelivery: true } },
  accessInvite: { select: { recipientEmail: true, recipientPhone: true, acceptedAt: true, revokedAt: true } },
  manualOnly: true, id: true, contactId: true, mixId: true, mixStepId: true, jumpDateId: true, appointmentBindingId: true,
  mixStep: { select: { dayOffset: true, plannedAt: true } },
  scheduledAt: true, baseScheduledAt: true, createdAt: true, status: true, updatedAt: true, reason: true, renderedSnapshot: true, templateSnapshot: true, stepVersionId: true, completedAt: true, completionMethod: true, selectedFamily: true,
  // The contact fields the message tokens resolve from, so an owner's draft renders on the card.
  contact: { select: {
    journey: { select: { stage: { select: { name: true } } } },
    jumps: { where: { status: "PENDING" }, orderBy: [{ scheduledAt: "asc" }, { id: "asc" }], take: 6, select: {
      id: true, scheduledAt: true, reason: true, mixId: true, mixStepId: true, jumpDateId: true,
      appointmentBindingId: true, templateSnapshot: true, mixStep: { select: { dayOffset: true, plannedAt: true } }
    } },
    displayName: true, updatedAt: true, firstName: true, lastName: true, company: true, publicNotes: true, privateNotes: true,
    emails: { select: { email: true, isPrimary: true } }, phones: { select: { phone: true, isPrimary: true } },
    addresses: { select: { street1: true, street2: true, city: true, state: true, postalCode: true, country: true, isPrimary: true } },
    customFieldValues: { select: { value: true, definition: { select: { key: true } } } },
    // The person's stated preference decides whether a text alternative goes by WhatsApp; it is never inferred.
    relationshipState: { select: { preferredChannel: true } }
  } },
  mix: { select: { name: true, source: true } },
  stepVersion: { select: { stepTemplate: { select: { channel: true } } } }
} satisfies Prisma.JumpSelect;

/** Cursor values describe an ordering position, never a workspace or authority.
 * Open work precedes completed history; both groups sort by time and stable ID.
 * Fill from one group before reading the next, including boundary-spanning pages. */
export async function readTodayPage(workspaceId: string, filters: Prisma.JumpWhereInput, input: { after?: unknown; before?: unknown } = {}, groupFilters: GroupFilters = {}) {
  const after = parseTodayCursor(input.after);
  const before = after ? null : parseTodayCursor(input.before);
  const cursor = after ?? before;
  const direction: Direction = before ? "before" : "after";
  const base: Prisma.JumpWhereInput = { AND: [{ workspaceId }, { status: { in: ["PENDING", "DONE", "SKIPPED"] } }, filters] };

  // These additive constraints expose each branch of a daily date filter to
  // the planner without replacing workspace or shared filter boundaries.
  const groupWhere = (pending: boolean): Prisma.JumpWhereInput => ({ AND: [
    base,
    pending ? { status: "PENDING" } : { status: { in: ["DONE", "SKIPPED"] } },
    (pending ? groupFilters.pending : groupFilters.completed) ?? {}
  ] });

  const read = async (position: Cursor | null, order: Direction) => {
    const sort = order === "after" ? "asc" as const : "desc" as const;
    const items: Array<Prisma.JumpGetPayload<{ select: typeof select }>> = [];
    for (const pending of order === "after" ? [true, false] : [false, true]) {
      if (position && pending !== position.pending && (order === "after" ? pending : !pending)) continue;
      const remaining = TODAY_PAGE_SIZE - items.length;
      if (!remaining) break;
      items.push(...await prisma.jump.findMany({
        where: { AND: [groupWhere(pending), ...(position?.pending === pending ? [withinGroup(position, order)] : [])] },
        select, orderBy: [{ scheduledAt: sort }, { id: sort }], take: remaining
      }));
    }
    return order === "before" ? items.reverse() : items;
  };

  let items = await read(cursor, direction);
  let reset = false;
  if (!items.length && cursor) { items = await read(null, "after"); reset = items.length > 0; }
  const first = items[0], last = items.at(-1);
  // Probe each ordering group separately. Combining them with OR can make an
  // empty first/last-page probe scan all follow-ups on a populated database.
  const hasBeyond = async (position: Cursor, order: Direction) => {
    const sort = order === "after" ? "asc" as const : "desc" as const;
    const same = await prisma.jump.findFirst({
      where: { AND: [groupWhere(position.pending), withinGroup(position, order)] },
      select: { id: true }, orderBy: [{ scheduledAt: sort }, { id: sort }]
    });
    if (same) return true;
    const crossesGroup = order === "after" ? position.pending : !position.pending;
    if (!crossesGroup) return false;
    return Boolean(await prisma.jump.findFirst({ where: groupWhere(!position.pending), select: { id: true } }));
  };
  const [previous, next] = first && last ? await Promise.all([
    hasBeyond(cursorFor(first), "before"),
    hasBeyond(cursorFor(last), "after")
  ]) : [false, false];
  return { items, previous: previous && first ? todayCursor(first) : null, next: next && last ? todayCursor(last) : null, reset };
}
