import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const { user, workspace, impersonation } = await requireWorkspace();
  if (impersonation) return NextResponse.json({ error: "Personal data export is unavailable during a support session." }, { status: 403 });
  const workspaceId = workspace.id;
  const [
    profile,
    userPreference,
    schedulingPreference,
    contacts,
    activities,
    groups,
    dateTypes,
    templates,
    mixes,
    jumps,
    imports
  ] = await Promise.all([
    prisma.workspaceProfile.findUnique({ where: { workspaceId } }),
    prisma.userPreference.findUnique({ where: { userId: user.id } }),
    prisma.workspacePreference.findUnique({ where: { workspaceId } }),
    prisma.contact.findMany({ where: { workspaceId }, include: { emails: true, phones: true, addresses: true, jumpDates: true, customFieldValues: { include: { definition: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.contactActivity.findMany({ where: { workspaceId }, orderBy: { occurredAt: "asc" } }),
    prisma.group.findMany({ where: { workspaceId }, include: { memberships: true }, orderBy: { createdAt: "asc" } }),
    prisma.dateType.findMany({ where: { OR: [{ workspaceId }, { workspaceId: null, isSystem: true }] }, orderBy: { createdAt: "asc" } }),
    prisma.stepTemplate.findMany({ where: { workspaceId }, include: { versions: { orderBy: { version: "asc" } } }, orderBy: { createdAt: "asc" } }),
    prisma.mix.findMany({ where: { workspaceId }, include: { steps: true, assignments: true }, orderBy: { createdAt: "asc" } }),
    prisma.jump.findMany({ where: { workspaceId }, orderBy: { scheduledAt: "asc" } }),
    prisma.contactImportBatch.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } })
  ]);
  const document = {
    format: "jump-in-the-mix-personal-export",
    exportedAt: new Date().toISOString(),
    account: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt, updatedAt: user.updatedAt },
    preferences: { profile, userPreference, schedulingPreference },
    contacts,
    activities,
    groups,
    dateTypes,
    templates,
    mixes,
    jumps,
    imports,
    excludedSecurityMaterial: ["password hashes", "session tokens", "provider credentials", "webhook payloads and secrets"]
  };
  return new NextResponse(JSON.stringify(document, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="jump-in-the-mix-personal-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store"
    }
  });
}
