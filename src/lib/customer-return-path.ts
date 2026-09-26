/** Accept only known in-app paths; never redirect a sign-in to an external origin. */
export function customerReturnPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000 || /[\\\x00-\x20]/.test(value)) return null;
  if (!/^\/(jumps|contacts|mixes|templates|journey|calendar|more|settings|account|help)(?:[/?#]|$)/.test(value)) return null;
  const url = new URL(value, "https://return.invalid");
  return url.origin === "https://return.invalid" && /^\/(jumps|contacts|mixes|templates|journey|calendar|more|settings|account|help)(?:[/?#]|$)/.test(url.pathname) ? `${url.pathname}${url.search}${url.hash}` : null;
}
