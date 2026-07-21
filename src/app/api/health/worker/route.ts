import { prisma } from "@/lib/prisma";

function staleAfterSeconds(): number {
  const parsed = Number(process.env.WORKER_HEARTBEAT_STALE_SECONDS ?? "90");
  return Number.isFinite(parsed) && parsed >= 30 && parsed <= 3600 ? parsed : 90;
}

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const heartbeat = await prisma.workerHeartbeat.findFirst({
      where: { status: "RUNNING" },
      orderBy: { lastSeenAt: "desc" },
      select: { lastSeenAt: true }
    });
    const ready = Boolean(
      heartbeat
      && Date.now() - heartbeat.lastSeenAt.getTime() <= staleAfterSeconds() * 1000
    );
    return Response.json({ status: ready ? "ready" : "not-ready" }, { status: ready ? 200 : 503, headers });
  } catch (error) {
    console.error("Worker health check failed", error);
    return Response.json({ status: "not-ready" }, { status: 503, headers });
  }
}
