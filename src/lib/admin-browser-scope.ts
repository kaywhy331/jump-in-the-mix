import { createHash } from "node:crypto";
export function adminBrowserScope(sessionId: string) {
  return createHash("sha256").update(`admin-draft:${sessionId}`).digest("hex");
}
