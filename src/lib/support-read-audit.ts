import { createHash, randomUUID } from "node:crypto";

export type SupportReadContext = { requestId: string; resource: string; resourceId?: string };

// Never retain query strings, search text, URLs containing tokens, or arbitrary
// client-supplied paths. The proxy replaces both internal headers on each request.
export function supportReadContext(headers: Pick<Headers, "get">): SupportReadContext {
  const requestId = headers.get("x-jitm-request-id") ?? "";
  const path = headers.get("x-jitm-support-path") ?? "";
  const match = /^\/(?:api\/)?(contacts|mixes|jumps|jump-dates|account|settings|journey|help|more|templates)(?:\/([a-z0-9_-]{1,100}))?(?:\/[a-z-]+)?$/.exec(path);
  return { requestId: /^[a-f0-9-]{36}$/.test(requestId) ? requestId : randomUUID(), resource: match?.[1] ?? "other", ...(match?.[2] ? { resourceId: match[2] } : {}) };
}

export function supportReadReceipt(input: { actorUserId: string; actorSessionId: string; ticketId: string; grantId?: string; read: SupportReadContext }) {
  return {
    id: `support-read-${createHash("sha256").update(JSON.stringify([input.actorSessionId, input.ticketId, input.grantId ?? "thread", input.read.requestId])).digest("hex")}`,
    actorUserId: input.actorUserId,
    action: input.grantId ? "support.view.read" : "support.case.read",
    entityType: "SupportTicket",
    entityId: input.ticketId,
    afterData: { actorSessionId: input.actorSessionId, grantId: input.grantId ?? null, resource: input.read.resource, resourceId: input.read.resourceId ?? null }
  };
}
