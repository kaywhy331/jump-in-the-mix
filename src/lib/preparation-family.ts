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

export type DetachedChange = { token: string; label: string; before: string; after: string };

/** Recorded removed tokens whose detail has since changed, for the review notice. Nothing is rewritten. */
export function detachedChanges(detached: Record<string, string> | null | undefined, values: Record<string, string>): DetachedChange[] {
  if (!detached) return [];
  return Object.entries(detached)
    .filter(([token, before]) => (values[token] ?? "") !== before)
    .map(([token, before]) => ({ token, label: tokenLabel(token), before, after: values[token] ?? "" }));
}

/** Customer-facing name for a message token: "{{First Name}}" and "{{contact.first_name}}" both read "first name". */
export function tokenLabel(token: string): string {
  const inner = token.replace(/^{{|}}$/g, "").trim();
  const last = inner.includes(".") ? inner.slice(inner.lastIndexOf(".") + 1) : inner;
  return last.replace(/_/g, " ").toLowerCase();
}

/** Keeps only the fields a family uses, so a text draft never carries a subject or a call script. */
export function draftFieldsForFamily(family: PreparationFamily, input: Partial<DraftContent>): DraftContent {
  return {
    subject: family === "EMAIL" ? input.subject ?? null : null,
    body: family === "TEXT" || family === "EMAIL" ? input.body ?? null : null,
    script: family === "CALL" ? input.script ?? null : null
  };
}
