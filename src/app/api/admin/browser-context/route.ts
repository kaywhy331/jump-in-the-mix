import { getCurrentSession } from "@/lib/auth";
import { adminBrowserScope } from "@/lib/admin-browser-scope";
import { prisma } from "@/lib/prisma";
export async function GET() {
  const session = await getCurrentSession();
  const staff = session && !session.impersonation && session.authUser.emailVerifiedAt && !session.authUser.suspendedAt
    ? await prisma.staffMembership.findUnique({ where: { userId: session.authUser.id }, select: { status: true } }) : null;
  return Response.json({ scope: staff?.status === "ACTIVE" && session ? adminBrowserScope(session.id) : null }, { headers: { "Cache-Control": "private, no-store" } });
}
