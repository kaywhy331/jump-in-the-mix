import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { stageMovesForAudience } from "@/lib/mix-stage";

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
  // With a Contact stage, how many of them turning the Mix on would move to it (UX-01).
  const stageId = query.get("stage"); const mixId = query.get("mix");
  if ((stageId?.length ?? 0) > 120 || (mixId?.length ?? 0) > 120) return NextResponse.json({ error: "Choose a stage again." }, { status: 400, headers });
  const [total, missingEmail, missingPhone, stage] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.count({ where: { ...where, emails: { none: {} } } }),
    prisma.contact.count({ where: { ...where, phones: { none: {} } } }),
    stageId ? stageMovesForAudience(prisma, { workspaceId: membership.workspaceId, stageId, all, groupIds, mixId }) : Promise.resolve(null)
  ]);
  return NextResponse.json({ total, missingEmail, missingPhone, ...(stage ? { stageMoves: stage.moving, stageMovesFromOtherStages: stage.fromOtherStages } : {}) }, { headers });
}
