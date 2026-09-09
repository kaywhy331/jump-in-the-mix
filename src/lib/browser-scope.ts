import { createHash } from "node:crypto";

type BrowserIdentity = {
  authUser: { id: string };
  user: { id: string; memberships: Array<{ workspaceId: string }> };
  impersonation: { id: string } | null;
};

// A non-authorizing storage namespace, stable across same-account reauthentication.
// Never accept this value as proof of access to a workspace or record.
export function browserScope(session: BrowserIdentity): string | null {
  const workspaceId = session.user.memberships[0]?.workspaceId;
  if (!workspaceId) return null;
  return createHash("sha256").update(JSON.stringify([
    "browser-v1", session.authUser.id, session.user.id, workspaceId, session.impersonation?.id ?? null
  ])).digest("hex");
}
