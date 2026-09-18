import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/** Count a union in the database instead of adding overlapping tag totals. */
export async function GET(request: Request) {
  const session = await getCurrentSession();
  const membership = session?.user.memberships[0];
  const headers = { "Cache-Control": "private, no-store" };
  if (!membership) return NextResponse.json({ error: "Sign in again to check the audience." }, { status: 401, headers });
  const query = new URL(request.url).searchParams;
  const groupIds = [...new Set(query.getAll("group"))];
  if (groupIds.length > 100 || groupIds.some(id => id.length > 120)) return NextResponse.json({ error: "Choose up to 100 tags." }, { status: 400, headers });
  const all = query.get("all") === "1";
  const where: Prisma.ContactWhereInput = { workspaceId: membership.workspaceId, archivedAt: null, ...(!all ? { groupMemberships: { some: { groupId: { in: groupIds }, group: { workspaceId: membership.workspaceId } } } } : {}) };
  const [total, missingEmail, missingPhone] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.count({ where: { ...where, emails: { none: {} } } }),
    prisma.contact.count({ where: { ...where, phones: { none: {} } } })
  ]);
  return NextResponse.json({ total, missingEmail, missingPhone }, { headers });
}
