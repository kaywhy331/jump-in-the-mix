/** Channel families for prepared content. A follow-up's draft is kept per family, not per channel. */
export type PreparationFamily = "TEXT" | "EMAIL" | "CALL";

export const PREPARATION_FAMILIES: PreparationFamily[] = ["TEXT", "EMAIL", "CALL"];

export function preparationFamilyForChannel(channel: string): PreparationFamily {
  if (channel === "EMAIL") return "EMAIL";
  if (channel === "PHONE_CALL" || channel === "VOICEMAIL") return "CALL";
  return "TEXT";
}

export function isPreparationFamily(value: unknown): value is PreparationFamily {
  return typeof value === "string" && (PREPARATION_FAMILIES as string[]).includes(value);
}

/** The same bounds the step editor enforces on a beat. */
export const DRAFT_LIMITS = { subject: 300, body: 20_000, script: 20_000 } as const;

export type DraftContent = { subject: string | null; body: string | null; script: string | null };

/** Keeps only the fields a family uses, so a text draft never carries a subject or a call script. */
export function draftFieldsForFamily(family: PreparationFamily, input: Partial<DraftContent>): DraftContent {
  return {
    subject: family === "EMAIL" ? input.subject ?? null : null,
    body: family === "TEXT" || family === "EMAIL" ? input.body ?? null : null,
    script: family === "CALL" ? input.script ?? null : null
  };
}
