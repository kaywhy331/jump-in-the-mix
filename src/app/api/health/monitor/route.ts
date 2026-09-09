import { prisma } from "@/lib/prisma";
import { operationsPolicy } from "@/lib/operations-policy";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const monitor = await prisma.operationsMonitor.findUnique({ where: { id: "primary" }, select: { observedAt: true, lastError: true } });
    const ready = Boolean(monitor?.observedAt && !monitor.lastError && Date.now() - monitor.observedAt.getTime() <= operationsPolicy().monitorStaleSeconds * 1000);
    return Response.json({ status: ready ? "ready" : "not-ready" }, { status: ready ? 200 : 503, headers });
  } catch { return Response.json({ status: "not-ready" }, { status: 503, headers }); }
}
