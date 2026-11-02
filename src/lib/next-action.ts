import { formatDateTime, type DisplayFormatPreferences } from "@/lib/format";

export type NextActionKind = "follow-up" | "outcome" | "commitment" | "appointment" | "repair";
export type NextActionCandidate = {
  /** The obligation's identity, shared by every representation of that obligation. */
  id: string; contactId: string; contactName: string; kind: NextActionKind;
  title: string; detail: string; href: string; action: string;
  dueAt: string | null; updatedAt: string;
  status?: "open" | "done" | "skipped";
  jumpId?: string; workId?: string; mixId?: string;
  inView?: boolean;
};
export type NextAction = NextActionCandidate & { timing: "overdue" | "due" | "future" | "attention" };
export type NextActionProjection = {
  items: NextAction[]; observedAt: string; timeZone: string;
  state: "ready" | "preparing" | "failed" | "unavailable";
  attentionCount: number; futureCount: number;
};

const kindOrder: Record<NextActionKind, number> = { outcome: 0, commitment: 1, "follow-up": 2, repair: 3, appointment: 4 };
// Browser-safe calendar arithmetic: no elapsed-hour assumption across DST boundaries.
function dayNumber(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(date);
  const value = (type: string) => Number(parts.find(part => part.type === type)!.value);
  return Date.UTC(value("year"), value("month") - 1, value("day")) / 86_400_000;
}
const closed = (item: NextActionCandidate) => item.status === "done" || item.status === "skipped";
const dueOrder = (a: NextActionCandidate, b: NextActionCandidate) => a.dueAt && b.dueAt
  ? Date.parse(a.dueAt) - Date.parse(b.dueAt) : a.dueAt ? 1 : b.dueAt ? -1 : 0;

/** Pure, deterministic projection; deduplicate obligations before counting or choosing a primary action. */
export function resolveNextActions(candidates: NextActionCandidate[], options: {
  now: Date; timeZone: string; state?: NextActionProjection["state"];
}): NextActionProjection {
  const unique = new Map<string, NextActionCandidate>();
  for (const candidate of candidates) {
    const previous = unique.get(candidate.id);
    // A newer Undo may reopen work. At equal versions a settled receipt beats an old open representation.
    const replace = !previous || candidate.updatedAt > previous.updatedAt
      || (candidate.updatedAt === previous.updatedAt && (closed(candidate) && !closed(previous)
        || !closed(previous) && !closed(candidate) && (candidate.kind === "repair" && previous.kind !== "repair"
          || previous.kind !== "repair" && kindOrder[candidate.kind] < kindOrder[previous.kind])));
    const selected = replace ? candidate : previous;
    unique.set(candidate.id, previous ? { ...selected, inView: previous.inView !== false || candidate.inView !== false } : selected);
  }
  const today = dayNumber(options.now, options.timeZone);
  let state = options.state ?? "ready";
  const items: NextAction[] = [];
  for (const item of unique.values()) {
    if (closed(item)) continue;
    const date = item.dueAt === null ? null : new Date(item.dueAt);
    if (date && !Number.isFinite(date.getTime())) { state = "unavailable"; continue; }
    const day = date && dayNumber(date, options.timeZone);
    // Ended appointments are outcome candidates; an appointment still in progress is never late.
    const timing = !date ? "attention" : item.kind === "appointment" && date <= options.now ? "due" : day! < today ? "overdue"
      : (item.kind === "follow-up" ? day! > today : date > options.now) ? "future" : "due";
    items.push({ ...item, timing });
  }
  items.sort((a, b) => Number(a.timing === "future") - Number(b.timing === "future")
    || (a.timing === "future" && b.timing === "future" ? dueOrder(a, b) : kindOrder[a.kind] - kindOrder[b.kind])
    || dueOrder(a, b) || a.id.localeCompare(b.id));
  return { items, state, observedAt: options.now.toISOString(), timeZone: options.timeZone,
    attentionCount: items.filter(item => item.timing !== "future").length,
    futureCount: items.filter(item => item.timing === "future").length };
}

/** Filtering is a view of one complete snapshot; the default Next card can still explain future-only work. */
export function nextActionsInView(projection: NextActionProjection): NextActionProjection {
  const items = projection.items.filter(item => item.inView !== false);
  return { ...projection, items, attentionCount: items.filter(item => item.timing !== "future").length,
    futureCount: items.filter(item => item.timing === "future").length };
}

/** Apply local completion and Undo to the same server projection without changing its source snapshot. */
export function withoutSettledActions(projection: NextActionProjection, settledJumpIds: ReadonlySet<string>): NextActionProjection {
  const items = projection.items.filter(item => !item.jumpId || !settledJumpIds.has(item.jumpId));
  return { ...projection, items, attentionCount: items.filter(item => item.timing !== "future").length,
    futureCount: items.filter(item => item.timing === "future").length };
}

/** A later read cannot revive a settled version; a newer server version can reopen it. */
export function withoutSettledActionVersions(projection: NextActionProjection, settledVersions: ReadonlyMap<string, string | null>): NextActionProjection {
  const settledIds = new Set(projection.items.flatMap(item => {
    if (!item.jumpId || !settledVersions.has(item.jumpId)) return [];
    const version = settledVersions.get(item.jumpId);
    const newer = version && Date.parse(item.updatedAt) > Date.parse(version) && Date.parse(projection.observedAt) > Date.parse(version);
    return newer ? [] : [item.jumpId];
  }));
  return withoutSettledActions(projection, settledIds);
}

export function nextActionTime(item: NextAction, projection: Pick<NextActionProjection, "observedAt" | "timeZone">, preferences: DisplayFormatPreferences): string {
  if (!item.dueAt) return item.kind === "outcome" ? "Waiting for your outcome" : "Needs your attention";
  const display = { ...preferences, timeZone: projection.timeZone };
  const days = dayNumber(new Date(projection.observedAt), projection.timeZone) - dayNumber(new Date(item.dueAt), projection.timeZone);
  return item.timing === "overdue"
    ? `${days} ${days === 1 ? "day" : "days"} late · ${formatDateTime(item.dueAt, display)}`
    : formatDateTime(item.dueAt, display);
}

export function nextActionEmptyText(projection: NextActionProjection): string {
  if (projection.state === "unavailable") return "Your next steps could not be checked.";
  if (projection.state === "failed") return "Follow-up preparation needs another try.";
  if (projection.state === "preparing") return "Your follow-ups are being prepared.";
  return "Nothing scheduled.";
}
