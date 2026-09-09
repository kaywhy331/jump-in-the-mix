import { getCurrentSession } from "@/lib/auth";
import { browserScope } from "@/lib/browser-scope";
import { env } from "@/lib/env";

export function pushResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });
}

export async function pushRequestContext(request: Request) {
  const session = await getCurrentSession();
  if (!session) return { error: pushResponse({ error: "Sign in to manage this device's reminders." }, 401) };
  if (session.impersonation) return { error: pushResponse({ error: "View-only session." }, 403) };
  if (env.requireEmailVerification && !session.user.emailVerifiedAt) return { error: pushResponse({ error: "Verify your email first." }, 403) };
  const workspaceId = session.user.memberships[0]?.workspaceId;
  if (!workspaceId) return { error: pushResponse({ error: "Set up your business first." }, 403) };
  if (request.headers.get("x-jitm-browser-scope") !== browserScope(session)) return { error: pushResponse({ error: "Your account changed. Reload before managing reminders." }, 409) };
  return { session, workspaceId, userId: session.user.id };
}
