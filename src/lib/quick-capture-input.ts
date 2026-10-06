import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);
export const quickCaptureSchema = z.object({
  requestId: z.string().uuid(),
  person: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("new"), name: text(200).min(1, "Enter a name."), phone: text(80), email: text(254), allowDuplicate: z.boolean() }).strict(),
    z.object({ mode: z.literal("existing"), id: text(100).min(1) }).strict()
  ]),
  note: text(2000).nullable(),
  event: z.object({ title: text(160).min(1, "Give the event a title."), startsAt: text(16), endsAt: text(16), location: text(500), allowOverlap: z.boolean() }).strict().nullable(),
  followUp: z.object({ reason: text(300).min(1, "Give the follow-up a reason."), when: text(16), channel: z.enum(["PHONE_CALL", "SMS", "EMAIL", "WHATSAPP", "VOICEMAIL"]), subject: text(300), wording: text(5000).min(1, "Add call notes or a draft message.") }).strict().nullable(),
  // The Mix a new person starts (JITM-09 §2.78): an id, null for none, or left out to follow the New contacts setting.
  mixId: text(100).nullable().optional()
}).strict();
export type QuickCaptureInput = z.infer<typeof quickCaptureSchema>;
export type QuickCaptureContact = { id: string; displayName: string; archived: boolean; email: string | null; phone: string | null };
/** `mixName`: the Mix that started for the new person; `mixKept`: the one chosen that already ran for them, so it didn't start again. */
export type QuickCaptureReceipt = { contactId: string; createdPerson: boolean; eventId: string | null; jumpId: string | null; noteId: string | null; mixName?: string | null; mixKept?: string };
