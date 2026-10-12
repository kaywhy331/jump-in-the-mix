import { contactDueLabel } from "@/lib/contact-profile-view";
import { formatDateTime, type DisplayFormatPreferences } from "@/lib/format";

/**
 * The profile's Mixes section (D77, JITM-09 §2.32): one row per Mix the person is in, was stopped in, or has
 * work to come from, whatever placed them there. Pure, so the server builds the rows and a test can check them.
 */
export type ContactMixRowInput = {
  /** The person's Mixes that still exist: not archived, and not a one-time follow-up. */
  mixes: Array<{ id: string; name: string; status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED" }>;
  /** Their own active starts; `everyone` for a place in a Mix for Everyone, whose Remove stops the Mix for them (D64). */
  starts: Array<{ assignmentId: string; mixId: string; everyone?: boolean }>;
  /** Shown tags of theirs that a Mix runs for. */
  tags: Array<{ mixId: string; tag: string }>;
  /** `stageExit`: the stop a stage change writes on the old stage's Mix (src/lib/journey.ts), lifted again if they return.
   * `everyonePlace`: the stop Remove wrote on their place in a Mix that is still for Everyone, which Resume gives back. */
  stops: Array<{ mixId: string; planLimit: boolean; stageExit: boolean; everyonePlace?: boolean }>;
  /** The earliest pending Beat per Mix. */
  pending: Array<{ mixId: string; at: Date }>;
  /** Preparation still to run for them: in these Mixes, or (`all`) in any. */
  preparing: { mixIds: string[]; all: boolean };
  /** Their open Journey work, with the Mixes it is still running, and whether a connection started each one. */
  work: Array<{ id: string; paused: boolean; runs: Array<{ mixId: string; viaConnection: boolean }> }>;
};

export type ContactMixRow = {
  mixId: string; name: string; mixStatus: ContactMixRowInput["mixes"][number]["status"];
  /** Their own start, which Remove ends; `everyoneStart` when it is their place in a Mix for Everyone (D64). */
  assignmentId: string | null;
  everyoneStart: boolean;
  tags: string[];
  stop: "stopped" | "plan-limit" | "stage-exit" | null;
  /** The stop came from removing their Everyone place, and Resume gives that place back (D64). */
  everyoneRemoved: boolean;
  nextBeatAt: Date | null;
  preparing: boolean;
  workIds: string[];
  workPaused: boolean;
  /** A Journey connection started the work, rather than the owner from the Journey page. */
  workViaConnection: boolean;
};

export function buildContactMixRows(input: ContactMixRowInput): ContactMixRow[] {
  const rows = new Map<string, ContactMixRow>();
  const row = (mixId: string) => {
    const mix = input.mixes.find(item => item.id === mixId);
    if (!mix || mix.status === "ARCHIVED") return null;
    let found = rows.get(mixId);
    if (!found) rows.set(mixId, found = { mixId, name: mix.name, mixStatus: mix.status, assignmentId: null, everyoneStart: false, tags: [], stop: null, everyoneRemoved: false, nextBeatAt: null, preparing: false, workIds: [], workPaused: false, workViaConnection: false });
    return found;
  };
  for (const start of input.starts) { const found = row(start.mixId); if (found && !found.assignmentId) { found.assignmentId = start.assignmentId; found.everyoneStart = Boolean(start.everyone); } }
  for (const tag of input.tags) { const found = row(tag.mixId); if (found && !found.tags.includes(tag.tag)) found.tags.push(tag.tag); }
  for (const stop of input.stops) { const found = row(stop.mixId); if (found) { found.stop = stop.planLimit ? "plan-limit" : stop.stageExit ? "stage-exit" : "stopped"; found.everyoneRemoved = found.stop === "stopped" && Boolean(stop.everyonePlace); } }
  for (const beat of input.pending) { const found = row(beat.mixId); if (found && (!found.nextBeatAt || beat.at < found.nextBeatAt)) found.nextBeatAt = beat.at; }
  for (const work of input.work) for (const run of work.runs) {
    const found = row(run.mixId);
    if (!found) continue;
    found.workViaConnection ||= run.viaConnection;
    if (found.workIds.includes(work.id)) continue;
    found.workIds.push(work.id);
    found.workPaused ||= work.paused;
  }
  for (const found of rows.values()) found.preparing = !found.stop && (input.preparing.all || input.preparing.mixIds.includes(found.mixId));
  // Work to come first, soonest first; then the rest by how much is still going on, then by name.
  const rank = (item: ContactMixRow) => item.nextBeatAt ? 0 : item.stop ? 3 : item.preparing ? 1 : 2;
  return [...rows.values()].sort((a, b) => rank(a) - rank(b) || (a.nextBeatAt && b.nextBeatAt ? a.nextBeatAt.getTime() - b.nextBeatAt.getTime() : 0) || a.name.localeCompare(b.name) || a.mixId.localeCompare(b.mixId));
}

export type ContactMixRowStatus = { label: string; tone: "late" | "running" | "paused" | "stopped" | "idle" };

/** What the row says about the Mix for this person, in the order the Mix itself decides it. */
export function contactMixRowStatus(row: ContactMixRow, now: Date, preferences: DisplayFormatPreferences): ContactMixRowStatus {
  if (row.stop === "plan-limit") return { label: "Not started: plan limit", tone: "stopped" };
  if (row.stop === "stage-exit") return { label: "Ended at a stage change", tone: "stopped" };
  if (row.stop) return { label: "Stopped", tone: "stopped" };
  if (row.mixStatus === "DRAFT") return { label: "Draft", tone: "paused" };
  if (row.mixStatus === "PAUSED") return { label: "Mix paused", tone: "paused" };
  if (row.workPaused) return { label: "Journey work paused", tone: "paused" };
  if (row.nextBeatAt) return { label: `Next Beat · ${contactDueLabel(row.nextBeatAt, now, preferences)}`, tone: row.nextBeatAt < now ? "late" : "running" };
  if (row.preparing) return { label: "Getting follow-ups ready", tone: "running" };
  return { label: "No follow-ups to come", tone: "idle" };
}

/** How the person came to be in the Mix, when it isn't their own start. */
export function contactMixRowRoute(row: ContactMixRow): string | null {
  if (row.assignmentId) return null;
  if (row.tags.length) return `Through the ${row.tags.length === 1 ? "tag" : "tags"} ${row.tags.join(", ")}`;
  if (row.workIds.length) return row.workViaConnection ? "Started by a Journey connection" : "Started in Journey";
  return null;
}

/** The row menu's one sentence on where the Mix stands for the person. */
export function contactMixRowSummary(row: ContactMixRow, name: string, now: Date, preferences: DisplayFormatPreferences): string {
  if (row.stop === "plan-limit") return `Not started for ${name}: your plan’s people limit was reached.`;
  if (row.stop) {
    // Resume brings back what the stop removed, for whatever still places them in the Mix: their start, a tag, or
    // their Journey work (src/lib/mix-stop-actions.ts). With nothing left, it only lifts the stop. A stage change's own
    // cancellations never come back (src/lib/journey.ts), so Resume only lifts that stop too. A stop from removing their
    // Everyone place gives that place back (D64), and with it their follow-ups once the Mix is on.
    if (row.everyoneRemoved) return `Stopped for ${name} when you removed them from this Mix for Everyone, so saving or starting it again won’t add them back. Resuming gives them their place in it back${row.mixStatus !== "ACTIVE" ? ", and it prepares their follow-ups once the Mix is on" : ""}.`;
    const placed = row.stop !== "stage-exit" && Boolean(row.assignmentId || row.tags.length || row.workIds.length);
    const resume = !placed ? "Resuming only lifts the stop: add them to the Mix to restart it."
      : row.mixStatus !== "ACTIVE" ? "Resuming lets it prepare their follow-ups once the Mix is on."
      : !row.assignmentId && !row.tags.length && row.workPaused ? "Resuming brings back their follow-ups from it once their Journey work is resumed."
      : `Resuming brings back their follow-ups from it${row.assignmentId || !row.tags.length ? "" : " through the tag"}; any already due wait for you on Today.`;
    return row.stop === "stage-exit" ? `Ended when ${name}’s stage changed. It starts again if they return to that stage. ${resume}` : `Stopped for ${name}. ${resume}`;
  }
  if (row.mixStatus === "DRAFT") return "This Mix is a draft, so it prepares nothing until it’s turned on.";
  if (row.mixStatus === "PAUSED") return `This Mix is paused for everyone, so ${name}’s follow-ups from it wait until it’s turned back on.`;
  if (row.workPaused) return `${name}’s Journey work in this Mix is paused.`;
  if (row.nextBeatAt) return `Next Beat ${row.nextBeatAt < now ? "was due" : "is due"} ${formatDateTime(row.nextBeatAt, preferences)}.`;
  if (row.preparing) return `${name}’s follow-ups from this Mix are being prepared.`;
  return `No follow-ups to come for ${name} from this Mix.`;
}
