import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { exportMegaMixPipeline } from "@/lib/mega-mix-pipeline-service";
import { portableFileName } from "@/lib/mix-portable";

export const runtime = "nodejs";

/** Download a Mega-Mix as a file: wording, timing and connections, never people or history. */
export async function GET(_request: Request, { params }: { params: Promise<{ pipelineId: string }> }) {
  const [{ workspace, impersonation }, { pipelineId }] = await Promise.all([requireWorkspace(), params]);
  // A support view reads on screen only; the customer's wording never leaves as a file.
  if (impersonation) return NextResponse.json({ error: "Support sessions are view-only." }, { status: 403 });
  try {
    const exported = await exportMegaMixPipeline(prisma, workspace.id, pipelineId.slice(0, 160));
    const value = { ...exported.package, exportedAt: new Date().toISOString() };
    return new NextResponse(JSON.stringify(value, null, 2), { headers: {
      "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${portableFileName(value)}"`
    } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "This Mega-Mix could not be exported." }, { status: 404 });
  }
}
