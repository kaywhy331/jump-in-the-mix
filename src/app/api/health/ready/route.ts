import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ready", database: "connected", timestamp: new Date().toISOString() });
  } catch (error) {
    return Response.json({ status: "not-ready", database: "unavailable", error: error instanceof Error ? error.message : "unknown" }, { status: 503 });
  }
}
