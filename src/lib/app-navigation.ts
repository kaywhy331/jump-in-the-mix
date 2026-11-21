/**
 * The app's main navigation, in its order (JITM-09 §2.3). The phone bottom navigation shows the primary links; the
 * rail shows them all. Section swipe reads its ring from here, so the ring follows the navigation.
 */
export const NAV_LINKS = [
  { href: "/jumps", label: "Today", icon: "home", kind: "primary" },
  { href: "/contacts", label: "Contacts", icon: "contacts", kind: "primary" },
  { href: "/mixes", label: "Mixes", icon: "mixes", kind: "primary" },
  { href: "/journey", label: "Journey", icon: "journey", kind: "desktop" },
  { href: "/calendar", label: "Calendar", icon: "calendar", kind: "desktop" },
  { href: "/more", label: "More", icon: "more", kind: "primary" }
] as const;

/** The section ring (JITM-07 §2.33): the bottom navigation's destinations, in its order. Quick Add is an action, not a stop. */
export const SECTION_RING: readonly string[] = NAV_LINKS.filter(link => link.kind === "primary").map(link => link.href);

/**
 * The navigation's name for the page at `path`, a path with or without its query, or null where the navigation has no
 * link to it. A Back control whose destination varies is named with it, so it names the page it goes to (JITM-BACK-02).
 */
export function navigationLabel(path: string): string | null {
  const { pathname } = new URL(path, "https://navigation.invalid");
  return NAV_LINKS.find(link => link.href === pathname)?.label ?? null;
}

const MIXES = "/mixes";
/**
 * The Back control of the pages of the Mixes family that are reached from several places (Ready-made Mixes, Marketplace,
 * Mega-Mixes, Create a Mix): back to the page of the app shell the owner came from, otherwise Mixes, named by the
 * navigation (`BackLink`'s origin mode; JITM-BACK-03).
 */
export const MIXES_FAMILY_BACK = { href: MIXES, label: navigationLabel(MIXES)!, returns: "origin" } as const;

/** The ready-made Mix library's name (`/templates`), which the navigation has no link to: its page title, and the label of a Back control to it. */
export const READY_MADE_MIXES = "Ready-made Mixes";

const SECTION_SWIPE_KEY = "jitm-section-swipe";
export const SECTION_SWIPE_EVENT = "jitm:section-swipe";
// This visit's choice when the browser blocks storage, so the switch still applies until the tab closes.
let unsaved: boolean | null = null;

/** Whether section swipe is on in this browser (JITM-08 §2.49). Only an explicit "off" turns it off. */
export function readSectionSwipe() {
  if (unsaved !== null) return unsaved;
  try { return localStorage.getItem(SECTION_SWIPE_KEY) !== "off"; } catch { return true; }
}

/** Remembers the switch for this browser, as the Quick Add shortcut's is; returns false when it could only be kept for this visit. */
export function writeSectionSwipe(enabled: boolean) {
  try { localStorage.setItem(SECTION_SWIPE_KEY, enabled ? "on" : "off"); unsaved = null; return true; }
  catch { unsaved = enabled; return false; }
  finally { window.dispatchEvent(new Event(SECTION_SWIPE_EVENT)); }
}
