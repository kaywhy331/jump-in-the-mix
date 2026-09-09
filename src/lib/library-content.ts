import { z } from "zod";
import { MIX_TEMPLATE_CATEGORIES, MIX_TEMPLATE_INDUSTRIES, normalizeSharedMixSteps } from "@/lib/shared-mix";
import { slugify } from "@/lib/slug";

const text = (max: number) => z.string().trim().max(max).nullable();
const schema = z.object({
  title: z.string().trim().min(1).max(160), description: z.string().trim().min(20).max(1200),
  category: z.string().refine(v => (MIX_TEMPLATE_CATEGORIES as readonly string[]).includes(v), "Choose a supported category."),
  industry: z.string().refine(v => (MIX_TEMPLATE_INDUSTRIES as readonly string[]).includes(v), "Choose a supported industry."),
  framework: text(160), triggerMode: z.enum(["MANUAL_START", "DATE_TRIGGERED", "BROADCAST"]),
  dateTypeName: text(120), dateTypeSlug: text(120), featured: z.boolean(),
  steps: z.array(z.object({ name: z.string().trim().min(1).max(160), channel: z.enum(["SMS", "EMAIL", "PHONE_CALL", "VOICEMAIL", "WHATSAPP"]),
    dayOffset: z.number().int().min(-3650).max(3650), sendTimeMinutes: z.number().int().min(0).max(1439).nullable(),
    subject: text(300), body: text(20_000), script: text(20_000), longSms: z.boolean(), includeOptOut: z.boolean()
  }).strict()).min(1).max(50)
}).strict();
export type LibraryContent = z.infer<typeof schema>;

export class LibraryError extends Error {
  constructor(message: string, readonly needsMfa = false) { super(message); }
}
export function validateLibraryContent(value: unknown): LibraryContent {
  const result = schema.safeParse(value);
  if (!result.success) throw new LibraryError(result.error.issues[0]?.message ?? "Check the mix content.");
  const content = result.data;
  if (content.triggerMode === "DATE_TRIGGERED") {
    content.dateTypeSlug = slugify(content.dateTypeSlug || content.dateTypeName || "");
    if (!content.dateTypeName || !content.dateTypeSlug) throw new LibraryError("Date-based mixes must identify the saved date that starts them.");
  } else { content.dateTypeName = null; content.dateTypeSlug = null; }
  content.steps = normalizeSharedMixSteps(content.steps);
  return content;
}
export const EMPTY_LIBRARY_CONTENT: LibraryContent = {
  title: "", description: "", category: "Relationships", industry: "Any business", framework: null,
  triggerMode: "MANUAL_START", dateTypeName: null, dateTypeSlug: null, featured: false,
  steps: [{ name: "Follow up", channel: "SMS", dayOffset: 0, sendTimeMinutes: null, subject: null, body: "", script: null, longSms: false, includeOptOut: false }]
};
