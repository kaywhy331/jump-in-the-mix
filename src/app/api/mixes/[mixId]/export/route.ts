import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { exportSingleMix } from "@/lib/mega-mix-pipeline-service";
import { portableFileName } from "@/lib/mix-portable";

export const runtime = "nodejs";

/** Download one Mix as a file: its Beats and wording, never people or history. */
export async function GET(_request: Request, { params }: { params: Promise<{ mixId: string }> }) {
  const [{ workspace }, { mixId }] = await Promise.all([requireWorkspace(), params]);
  try {
    const exported = await exportSingleMix(prisma, workspace.id, mixId.slice(0, 160));
    const value = { ...exported.package, exportedAt: new Date().toISOString() };
    return new NextResponse(JSON.stringify(value, null, 2), { headers: {
      "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${portableFileName(value)}"`
    } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "This Mix could not be exported." }, { status: 404 });
  }
}
