import { initialJourneySetup } from "@/lib/journey-preferences";
import { timezoneForUser } from "@/lib/display-preferences";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { installedMegaMixKeys, megaMixById, suggestedMegaMix } from "@/lib/mega-mixes";
import { MegaMixLibrary } from "@/components/MegaMixLibrary";

export const metadata = { title: "Mega-Mixes" };
export default async function MegaMixPage({ searchParams }: { searchParams: Promise<{ journey?: string; added?: string }> }) {
  const [{ workspace, user, impersonation }, query] = await Promise.all([requireWorkspace(), searchParams]);
  const selectedId = query.journey ?? suggestedMegaMix(workspace.profile?.industry);
  if (!megaMixById(selectedId)) notFound();
  const [receipts, mixes, scheduling, timezone, stages, stagePreference] = await Promise.all([
    prisma.megaMixInstallation.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "asc" } }),
    prisma.mix.findMany({ where: { workspaceId: workspace.id, source: { startsWith: "MEGA_MIX:" } }, select: { id: true, name: true, status: true } }),
    prisma.workspacePreference.findUnique({ where: { workspaceId: workspace.id } }), timezoneForUser(user.id),
    prisma.journeyStage.findMany({ where: { workspaceId: workspace.id }, select: { name: true } }),
    prisma.journeyPreference.findUnique({ where: { workspaceId: workspace.id }, select: { workspaceId: true } })
  ]);
  const installed = receipts.map(receipt => {
    const ids = receipt.mixIds as Record<string, string>;
    const keys = installedMegaMixKeys({ blueprintId: receipt.blueprintId, version: receipt.version, mixIds: ids });
    return { blueprintId: receipt.blueprintId, version: receipt.version,
      mixes: keys.flatMap(key => { const mix = mixes.find(item => item.id === ids[key]); return mix ? [mix] : []; }) };
  });
  return <div className="page mix-workspace-page"><MegaMixLibrary initialSetup={initialJourneySetup(scheduling, timezone)} key={`${selectedId}:${query.added ?? ""}`} selectedId={selectedId} installed={installed} added={query.added === "1"} canEdit={!impersonation} contactStages={{ names: stages.map(stage => stage.name), on: Boolean(stagePreference) }} /></div>;
}
