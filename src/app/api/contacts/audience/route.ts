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
  // With a Contact stage, how many people this save starts would move to it: the whole audience when it turns the Mix
  // on, or only Everyone or the tags it adds to an active one (UX-01, UX-02).
  const stageId = query.get("stage"); const mixId = query.get("mix");
  const stageAll = query.get("stageAll") === "1"; const stageGroups = [...new Set(query.getAll("stageGroup"))];
  if ((stageId?.length ?? 0) > 120 || (mixId?.length ?? 0) > 120 || stageGroups.length > 100 || stageGroups.some(id => id.length > 120)) return NextResponse.json({ error: "Choose a stage again." }, { status: 400, headers });
  const [total, missingEmail, missingPhone, stage] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.count({ where: { ...where, emails: { none: {} } } }),
    prisma.contact.count({ where: { ...where, phones: { none: {} } } }),
    stageId ? stageMovesForAudience(prisma, { workspaceId: membership.workspaceId, stageId, all: stageAll, groupIds: stageGroups, mixId }) : Promise.resolve(null)
  ]);
  return NextResponse.json({ total, missingEmail, missingPhone, ...(stage ? { stageMoves: stage.moving, stageMovesFromOtherStages: stage.fromOtherStages } : {}) }, { headers });
}
