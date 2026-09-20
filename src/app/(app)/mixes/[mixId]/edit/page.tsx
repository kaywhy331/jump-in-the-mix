import type { Metadata } from "next";
import { MixWorkspace, type MixWorkspaceSearchParams } from "@/components/MixWorkspace";
export const metadata: Metadata = { title: "Edit mix" };
export default async function EditMixPage({ params, searchParams }: { params: Promise<{ mixId: string }>; searchParams: Promise<MixWorkspaceSearchParams> }) {
  const [{ mixId }, query] = await Promise.all([params, searchParams]);
  return <MixWorkspace mixId={mixId} query={query} />;
}
