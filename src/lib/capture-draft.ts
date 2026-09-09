import { privateStorageKey } from "@/lib/private-browser-state";
import type { QuickAddInterpretation } from "@/lib/quick-add-capture";

const lifetime = 10 * 60_000;
const validId = (id: string) => /^[a-f0-9-]{36}$/.test(id);
function validDraft(value: unknown): value is QuickAddInterpretation {
  if (!value || typeof value !== "object") return false;
  const draft = value as Record<string, unknown>;
  return ["original", "timing", "reason", "confidence"].every(key => typeof draft[key] === "string" && draft[key].length <= 2000)
    && ["name", "phone", "email"].every(key => draft[key] === null || typeof draft[key] === "string" && draft[key].length <= 254)
    && (draft.dateValue === null || typeof draft.dateValue === "string" && /^\d{4}-\d{2}-\d{2}$/.test(draft.dateValue));
}

// One short-lived draft per signed-in browser scope and tab. No contact data is
// placed in URLs, localStorage, server logs or a new persistent database table.
export function saveCaptureDraft(scope: string | null, draft: QuickAddInterpretation, now = Date.now()): string | null {
  if (!scope || !validDraft(draft)) return null;
  try {
    const id = crypto.randomUUID();
    window.sessionStorage.setItem(privateStorageKey(scope, "capture-draft"), JSON.stringify({ id, expiresAt: now + lifetime, draft }));
    return id;
  } catch { return null; }
}

export function takeCaptureDraft(scope: string | null, id: string, now = Date.now()): QuickAddInterpretation | null {
  if (!scope || !validId(id)) return null;
  try {
    const key = privateStorageKey(scope, "capture-draft");
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const record: unknown = JSON.parse(raw);
    if (!record || typeof record !== "object") { window.sessionStorage.removeItem(key); return null; }
    const entry = record as Record<string, unknown>;
    if (typeof entry.expiresAt !== "number" || entry.expiresAt <= now || entry.expiresAt > now + lifetime || !validDraft(entry.draft)) { window.sessionStorage.removeItem(key); return null; }
    if (entry.id !== id) return null;
    window.sessionStorage.removeItem(key);
    return entry.draft;
  } catch { return null; }
}
