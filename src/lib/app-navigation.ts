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
