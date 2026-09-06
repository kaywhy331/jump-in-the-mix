import { getCurrentSession } from "@/lib/auth";
import { browserScope } from "@/lib/browser-scope";
import { env } from "@/lib/env";

export async function GET() {
  const session = await getCurrentSession();
  const allowed = session && (session.impersonation || !env.requireEmailVerification || session.user.emailVerifiedAt);
  return Response.json({ scope: allowed ? browserScope(session) : null }, {
    headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" }
  });
}
