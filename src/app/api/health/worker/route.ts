import { prisma } from "@/lib/prisma";

function staleAfterSeconds(): number {
  const parsed = Number(process.env.WORKER_HEARTBEAT_STALE_SECONDS ?? "90");
  return Number.isFinite(parsed) && parsed >= 30 && parsed <= 3600 ? parsed : 90;
}

export async function GET() {
  try {
    const heartbeat = await prisma.workerHeartbeat.findFirst({
      where: { status: "RUNNING" },
      orderBy: { lastSeenAt: "desc" },
      select: { startedAt: true, lastSeenAt: true, lastJobAt: true }
    });
    const staleSeconds = staleAfterSeconds();
    const ageSeconds = heartbeat ? Math.max(0, Math.floor((Date.now() - heartbeat.lastSeenAt.getTime()) / 1000)) : null;
    const ready = Boolean(heartbeat && ageSeconds !== null && ageSeconds <= staleSeconds);

    return Response.json({
      status: ready ? "ready" : "not-ready",
      worker: heartbeat
        ? {
            startedAt: heartbeat.startedAt.toISOString(),
            lastSeenAt: heartbeat.lastSeenAt.toISOString(),
            lastJobAt: heartbeat.lastJobAt?.toISOString() ?? null,
            ageSeconds
          }
        : null,
      staleAfterSeconds: staleSeconds,
      timestamp: new Date().toISOString()
    }, { status: ready ? 200 : 503 });
  } catch (error) {
    return Response.json({
      status: "not-ready",
      worker: null,
      error: error instanceof Error ? error.message : "unknown",
      timestamp: new Date().toISOString()
    }, { status: 503 });
  }
}
