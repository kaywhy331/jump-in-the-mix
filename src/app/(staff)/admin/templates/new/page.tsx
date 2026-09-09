import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { LibraryDraftForm } from "@/components/LibraryDraftForm";
import { Notice } from "@/components/Notice";
import { EMPTY_LIBRARY_CONTENT } from "@/lib/library-content";
import { prisma } from "@/lib/prisma";
import { snapshotWorkspaceMix } from "@/lib/shared-mix-service";

export const metadata: Metadata = { title: "Admin · New library draft" };
export default async function NewLibraryDraftPage({ searchParams }: { searchParams: Promise<{ error?: string; sourceMixId?: string }> }) {
  const { user } = await requirePlatformAdmin("mixes.edit"); const query = await searchParams;
  let content = EMPTY_LIBRARY_CONTENT;
  let sourceIssue = false;
  const source = query.sourceMixId && await prisma.mix.findFirst({ where: { id: query.sourceMixId.slice(0, 100), workspace: { ownerId: user.id }, status: { not: "ARCHIVED" } }, select: { id: true, workspaceId: true } });
  if (source) {
    try {
    const snapshot = await snapshotWorkspaceMix(source.workspaceId, source.id);
    content = { ...content, title: snapshot.name, description: snapshot.description ?? "", category: snapshot.category ?? content.category,
      industry: snapshot.industry ?? content.industry, framework: snapshot.framework, triggerMode: snapshot.triggerMode, dateTypeName: snapshot.dateTypeName, dateTypeSlug: snapshot.dateTypeSlug, steps: snapshot.steps };
    } catch { sourceIssue = true; }
  }
  return <div className="page admin-template-editor-page">
    <header className="page-header"><div><h1>Create a library draft</h1><p>Prepare a useful starting point customers can adapt to their own relationships.</p></div><Link className="button" href="/admin/templates">Back to mixes</Link></header>
    {query.error && <Notice type="error">{query.error}</Notice>}
    {query.sourceMixId && (!source || sourceIssue) && <Notice type="error">This source mix cannot be copied. Choose an available mix from your own account, or start a new draft below.</Notice>}
    <LibraryDraftForm revision={0} content={content} />
  </div>;
}
