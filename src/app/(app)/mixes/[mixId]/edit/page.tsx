import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { MixWorkspaceSearchParams } from "@/components/MixWorkspace";
export const metadata: Metadata = { title: "Edit mix" };
export default async function EditMixPage({ params, searchParams }: { params: Promise<{ mixId: string }>; searchParams: Promise<MixWorkspaceSearchParams & { activated?: string }> }) {
  const [{ mixId }, query] = await Promise.all([params, searchParams]);
  const search = new URLSearchParams({ mix: mixId, view: "edit" });
  for (const key of ["activate", "activated", "error", "created", "updated", "imported"] as const) if (query[key]) search.set(key, query[key]!);
  redirect(`/mixes?${search}`);
}
