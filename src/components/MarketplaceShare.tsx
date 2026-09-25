import Link from "next/link";
import { ShareSheet } from "@/components/MarketplaceControls";
import { Notice } from "@/components/Notice";
import { prisma } from "@/lib/prisma";
import { getPlatformStringList } from "@/lib/platform-settings";
import { shareWarnings } from "@/lib/marketplace";
import { exportMegaMixPipeline, exportSingleMix } from "@/lib/mega-mix-pipeline-service";
import { reasonLabel } from "@/lib/marketplace";
import { marketplaceUpdates } from "@/lib/marketplace-service";

/** The Share button for a Mix or Mega-Mix, with its privacy check run on the saved wording. */
export async function MarketplaceShare({ kind, targetId, targetName, workspaceId, canEdit }: { kind: "MIX" | "MEGA_MIX"; targetId: string; targetName: string; workspaceId: string; canEdit: boolean }) {
  const [author, workspace, listing, industries, exported] = await Promise.all([
    prisma.marketplaceAuthor.findUnique({ where: { workspaceId }, select: { publicName: true } }),
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } }),
    prisma.marketplaceListing.findFirst({ where: { workspaceId, ...(kind === "MIX" ? { mixId: targetId } : { pipelineId: targetId }) }, select: { id: true, status: true, summary: true, industry: true } }),
    getPlatformStringList("mix.industries"),
    (kind === "MIX" ? exportSingleMix(prisma, workspaceId, targetId) : exportMegaMixPipeline(prisma, workspaceId, targetId)).catch(() => null)
  ]);
  return <ShareSheet kind={kind} targetId={targetId} targetName={targetName} publicName={author?.publicName ?? workspace?.name ?? ""} listing={listing} industries={industries} canEdit={canEdit}
    warnings={exported ? shareWarnings(exported.package) : []}
    unavailable={exported ? undefined : kind === "MIX" ? "Only an active or draft Mix with Beats and a manual or date start can be shared." : "Add at least one Mix with Beats before sharing this Mega-Mix."} />;
}

/** Tells the owner when a Marketplace original changed after they added their copy, and about reports on their shares. */
export async function MarketplaceNotices({ workspaceId, mixId, pipelineId, reports: showReports = true }: { workspaceId: string; mixId?: string; pipelineId?: string; reports?: boolean }) {
  const [copy, reports] = await Promise.all([
    mixId || pipelineId ? marketplaceUpdates(workspaceId, { mixId, pipelineId }).then(updates => updates[0] ?? null) : null,
    !showReports ? [] : prisma.marketplaceReport.findMany({ where: { authorSeenAt: null, listing: { workspaceId } }, orderBy: { createdAt: "desc" }, take: 3, select: { id: true, reason: true, status: true, autoHidden: true, listing: { select: { id: true, title: true, status: true } } } })
  ]);
  return <>
    {copy && <Notice type="info">The shared original of this has been updated. Your copy stays as it is. <Link href={`/marketplace?section=community&item=${encodeURIComponent(`listing:${copy.listingId}`)}`}>Review the update</Link></Notice>}
    {reports.map(report => <Notice key={report.id} type={report.autoHidden && report.status === "OPEN" ? "error" : "info"}>{report.status === "OPEN" ? `Your shared “${report.listing.title}” was reported: ${reasonLabel(report.reason)}.${report.autoHidden ? " It’s hidden while our team reviews it." : " It stays shared while our team reviews it."}` : `Our team reviewed the report on “${report.listing.title}”: ${report.status === "DISMISSED" ? (report.listing.status === "LIVE" ? "it’s shared on the Marketplace" : "the report was dismissed") : report.listing.status === "HIDDEN" ? "it stays hidden" : "the report was upheld"}.`} <Link href={`/marketplace?section=mine&item=${encodeURIComponent(`listing:${report.listing.id}`)}`}>Review</Link></Notice>)}
  </>;
}
