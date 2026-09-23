/** Client-safe helpers for forms whose server action may fail in flight (weak phone signal, expired session). */
export const UNCONFIRMED_SAVE = "We couldn’t confirm this save. Your entries are kept. Check your connection, then try again.";

/** Next.js redirects and not-found are thrown signals that must keep propagating. */
export function isNavigationSignal(cause: unknown): boolean {
  return Boolean(cause && typeof cause === "object" && "digest" in cause && String((cause as { digest: unknown }).digest).startsWith("NEXT_"));
}
