import { z } from "zod";
import type { MegaMix } from "@/lib/mega-mixes";

export const WORK_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const COMMUNICATION_CHOICES = { RECOMMENDED: "Recommended mix", SMS: "Prefer texts", EMAIL: "Prefer emails", PHONE_CALL: "Prefer phone calls" } as const;
export const journeyPreferencesSchema = z.object({
  version: z.literal(1), communication: z.enum(["RECOMMENDED", "SMS", "EMAIL", "PHONE_CALL"]),
  pace: z.enum(["RECOMMENDED", "RELAXED"]), workDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  workStart: z.number().int().min(0).max(1439), workEnd: z.number().int().min(1).max(1440),
  avoidAppointments: z.boolean(), reviewedAt: z.string().optional(), draftBlueprintId: z.string().max(160).optional(), draftSetupMode: z.enum(["journey", "individual"]).optional()
}).refine(value => value.workStart < value.workEnd, { message: "Choose closing hours after opening hours." });
export type JourneyPreferences = z.infer<typeof journeyPreferencesSchema>;
export type JourneySetupValues = { preferences: JourneyPreferences; timezone: string; defaultFollowUpMinutes: number; quietHoursStart: number; quietHoursEnd: number; appointmentBufferMinutes: number };
export const DEFAULT_JOURNEY_PREFERENCES: JourneyPreferences = { version: 1, communication: "RECOMMENDED", pace: "RECOMMENDED", workDays: [1, 2, 3, 4, 5], workStart: 540, workEnd: 1020, avoidAppointments: true };
export function readJourneyPreferences(value: unknown): JourneyPreferences | null {
  const result = journeyPreferencesSchema.safeParse(value);
  return result.success ? result.data : null;
}
export function initialJourneySetup(row: { journeyPreferences?: unknown; defaultFollowUpMinutes: number; quietHoursStart: number; quietHoursEnd: number; appointmentBufferMinutes: number; weekendScheduling: string } | null, timezone: string): JourneySetupValues {
  return { preferences: readJourneyPreferences(row?.journeyPreferences) ?? { ...DEFAULT_JOURNEY_PREFERENCES, workDays: row?.weekendScheduling === "KEEP" ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5] }, timezone,
    defaultFollowUpMinutes: row?.defaultFollowUpMinutes ?? 600, quietHoursStart: row?.quietHoursStart ?? 1200, quietHoursEnd: row?.quietHoursEnd ?? 480, appointmentBufferMinutes: row?.appointmentBufferMinutes ?? 15 };
}
export function quietAt(minutes: number, start: number, end: number): boolean {
  return start !== end && (start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end);
}
export function validateJourneySetup(value: JourneySetupValues): string | null {
  const parsed = journeyPreferencesSchema.safeParse(value.preferences);
  if (!parsed.success) return "Choose at least one working day and closing hours after opening hours.";
  try { new Intl.DateTimeFormat("en-US", { timeZone: value.timezone }).format(); } catch { return "Choose a valid timezone."; }
  if (![value.defaultFollowUpMinutes, value.quietHoursStart, value.quietHoursEnd].every(n => Number.isInteger(n) && n >= 0 && n < 1440)) return "Enter valid follow-up and quiet-hour times.";
  if (!Number.isInteger(value.appointmentBufferMinutes) || value.appointmentBufferMinutes < 0 || value.appointmentBufferMinutes > 240) return "Choose an appointment buffer between 0 and 240 minutes.";
  const p = parsed.data;
  if (!Array.from({ length: p.workEnd - p.workStart }, (_, i) => i + p.workStart).some(n => !quietAt(n, value.quietHoursStart, value.quietHoursEnd))) return "Your quiet times cover all your working hours. Leave some time available for follow-ups.";
  return null;
}
export function parseJourneySetup(data: FormData): JourneySetupValues {
  const time = (name: string) => { const raw = String(data.get(name) ?? ""); return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(raw) ? Number(raw.slice(0, 2)) * 60 + Number(raw.slice(3)) : NaN; };
  const preferences = journeyPreferencesSchema.safeParse({ version: 1, communication: data.get("communication"), pace: data.get("pace"), workDays: [...new Set(data.getAll("workDay").map(Number))], workStart: time("workStart"), workEnd: time("workEnd"), avoidAppointments: data.get("avoidAppointments") === "on" });
  if (!preferences.success) throw new Error("Choose your communication preference, at least one working day, and closing hours after opening hours.");
  const result = { preferences: preferences.data, timezone: String(data.get("timezone") ?? ""), defaultFollowUpMinutes: time("defaultFollowUpTime"), quietHoursStart: time("quietHoursStart"), quietHoursEnd: time("quietHoursEnd"), appointmentBufferMinutes: Number(data.get("appointmentBufferMinutes")) };
  const error = validateJourneySetup(result); if (error) throw new Error(error);
  return result;
}

/** The same transformation is used by the preview and the atomic installation. */
export function tailorMegaMix(blueprint: MegaMix, setup: JourneySetupValues): MegaMix {
  const p = setup.preferences, multiplier = p.pace === "RELAXED" ? 2 : 1;
  return { ...blueprint, nodes: blueprint.nodes.map(node => ({ ...node,
    steps: node.steps.map(step => {
      const timing = { dayOffset: step.dayOffset > 0 ? step.dayOffset * multiplier : step.dayOffset, sendTimeMinutes: setup.defaultFollowUpMinutes };
      if (p.communication === "RECOMMENDED" || step.channel === "PHONE_CALL") return { ...step, ...timing };
      const text = (step.body || step.script || "").replaceAll("{{Email Signature}}", "{{SMS Signature}}");
      return { ...step, ...timing, channel: p.communication,
        subject: p.communication === "EMAIL" ? step.subject || step.name : undefined,
        body: p.communication === "PHONE_CALL" ? undefined : p.communication === "EMAIL" ? text.replaceAll("{{SMS Signature}}", "{{Email Signature}}") : text,
        script: p.communication === "PHONE_CALL" ? `Use this as a conversation guide:\n\n${text.replace(/\{\{(?:SMS|Email) Signature\}\}/g, "").trim()}` : undefined };
    }), paths: node.paths.map(path => ({ ...path, label: multiplier === 2 && path.afterDays ? path.label.replace(" in six months", "") : path.label, afterDays: (path.afterDays ?? 0) * multiplier }))
  })) };
}
