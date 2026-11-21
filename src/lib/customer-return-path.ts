import { inAppShell } from "@/lib/app-shell-routes";

/** Accept only known in-app paths, the app shell's pages (`inAppShell`); never redirect a sign-in to an external origin. */
export function customerReturnPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000 || /[\\\x00-\x20]/.test(value)) return null;
  if (!inAppShell(value)) return null;
  const url = new URL(value, "https://return.invalid");
  return url.origin === "https://return.invalid" && inAppShell(url.pathname) ? `${url.pathname}${url.search}${url.hash}` : null;
}
