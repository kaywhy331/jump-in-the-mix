/** Mix status words and filter values, safe for client components (JITM-09 §2.76, JITM-05 §2.2). */
export type ContactMixStatus = "in-mix" | "no-mix" | "no-mix-needed" | "do-not-contact";
export const CONTACT_MIX_FILTERS = { "in-mix": "In a Mix", "no-mix": "No Mix", "no-mix-needed": "No Mix needed" } as const;
export type ContactMixFilter = keyof typeof CONTACT_MIX_FILTERS;
export type ContactMixCounts = Record<ContactMixStatus, number>;
export function contactMixFilter(value: string | null | undefined): ContactMixFilter | "" {
  return value && Object.hasOwn(CONTACT_MIX_FILTERS, value) ? value as ContactMixFilter : "";
}
