import { env, productionConfigurationIssues } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    await prisma.$queryRaw`SELECT 1`;
    const configurationIssues = productionConfigurationIssues();
    if (configurationIssues.length) {
      console.error("Production configuration is not ready", configurationIssues);
      return Response.json({
        status: "not-ready",
        checks: { database: "connected", configuration: "invalid" }
      }, { status: 503, headers });
    }
    return Response.json({
      status: "ready",
      deployment: env.privateTestMode ? "private-test" : "standard",
      checks: { database: "connected", configuration: "valid" }
    }, { headers });
  } catch (error) {
    console.error("Readiness database check failed", error);
    return Response.json({
      status: "not-ready",
      checks: { database: "unavailable", configuration: "unknown" }
    }, { status: 503, headers });
  }
}
