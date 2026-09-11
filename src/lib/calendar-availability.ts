// Shared by the server-side booking check and the appointment time grid, so a
// slot the picker grays out is exactly one the save would reject.

export type AvailabilityKind = string;
export type BookedInterval = { id: string; title: string; kind: AvailabilityKind; start: number; end: number };
export type SlotState = "free" | "busy" | "buffer";
export type SlotAvailability = { time: number; state: SlotState; title?: string };

export const APPOINTMENT_BUFFER_CHOICES = [0, 10, 15, 30, 45, 60, 90, 120] as const;
export const MAX_APPOINTMENT_BUFFER_MINUTES = 240;

export function normalizeBufferMinutes(value: unknown): number {
  const minutes = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isInteger(minutes) || minutes < 0) return 0;
  return Math.min(minutes, MAX_APPOINTMENT_BUFFER_MINUTES);
}

// Time blocks are free time the person protected; only appointments need travel or prep room around them.
export function bufferApplies(candidateKind: AvailabilityKind, existingKind: AvailabilityKind): boolean {
  return candidateKind !== "BLOCK" && existingKind !== "BLOCK";
}

export function findConflict<T extends BookedInterval>(candidate: { kind: AvailabilityKind; start: number; end: number }, entries: readonly T[], buffer = 0): { entry: T; withinBuffer: boolean } | null {
  let direct: T | null = null;
  let padded: T | null = null;
  for (const entry of entries) {
    if (entry.start < candidate.end && entry.end > candidate.start) {
      if (!direct || entry.start < direct.start) direct = entry;
      continue;
    }
    if (buffer > 0 && bufferApplies(candidate.kind, entry.kind) && entry.start < candidate.end + buffer && entry.end > candidate.start - buffer) {
      if (!padded || entry.start < padded.start) padded = entry;
    }
  }
  if (direct) return { entry: direct, withinBuffer: false };
  if (padded) return { entry: padded, withinBuffer: true };
  return null;
}

export function conflictMessage(conflict: { entry: { title: string }; withinBuffer: boolean }, bufferMinutes: number): string {
  return conflict.withinBuffer
    ? `This is inside the ${bufferMinutes}-minute buffer around “${conflict.entry.title}”. Choose another time, or allow an overlap if it is intentional.`
    : `This overlaps “${conflict.entry.title}”. Choose another time, or allow an overlap if it is intentional.`;
}

// One state per grid slot: taken by an appointment, kept free by the buffer, or free.
export function slotAvailability(slots: readonly number[], stepMinutes: number, entries: readonly BookedInterval[], bufferMinutes: number, candidateKind: AvailabilityKind): SlotAvailability[] {
  return slots.map(time => {
    const conflict = findConflict({ kind: candidateKind, start: time, end: time + stepMinutes }, entries, bufferMinutes);
    if (!conflict) return { time, state: "free" };
    return { time, state: conflict.withinBuffer ? "buffer" : "busy", title: conflict.entry.title };
  });
}
