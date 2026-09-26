export const QUICK_ADD_SHORTCUT_KEY = "jitm-quick-add-shortcut";
export const QUICK_ADD_SHORTCUT_EVENT = "jitm:quick-add-shortcut";

// This visit's choice when the browser blocks storage, so the switch still applies until the tab closes.
let unsaved: boolean | null = null;

/** The stored switch state. Only an explicit "off" turns the shortcut off; anything else keeps the default. */
export function quickAddShortcutEnabled(stored: string | null | undefined) {
  return stored !== "off";
}

/** Whether the single-key shortcut is on in this browser. */
export function readQuickAddShortcut() {
  if (unsaved !== null) return unsaved;
  try { return quickAddShortcutEnabled(localStorage.getItem(QUICK_ADD_SHORTCUT_KEY)); } catch { return true; }
}

/** Remembers the switch for this browser; returns false when it could only be kept for this visit. */
export function writeQuickAddShortcut(enabled: boolean) {
  try { localStorage.setItem(QUICK_ADD_SHORTCUT_KEY, enabled ? "on" : "off"); unsaved = null; return true; }
  catch { unsaved = enabled; return false; }
}

type FieldLike = { isContentEditable?: boolean; closest?: (selectors: string) => Element | null };

/** The keyboard event fields the shortcut reads, so tests can pass plain objects. */
export type ShortcutKeyEvent = Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "isComposing" | "repeat"> & { target: EventTarget | FieldLike | null };

/** A plain "n", pressed once outside any text field while no modal dialog is open, opens Quick Add. */
export function shouldOpenQuickAdd(event: ShortcutKeyEvent, dialogOpen: boolean) {
  if (event.key.toLowerCase() !== "n" || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  if (event.isComposing || event.repeat || dialogOpen) return false;
  const target = event.target as FieldLike | null;
  return !(target?.isContentEditable || target?.closest?.("input, textarea, select"));
}
