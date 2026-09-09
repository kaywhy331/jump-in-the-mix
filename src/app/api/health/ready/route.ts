import { env, productionConfigurationIssues } from "@/lib/env";
import { checkDatabaseRelease } from "@/lib/database-release";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const configurationIssues = productionConfigurationIssues();
    if (configurationIssues.length) {
      console.error("Production configuration is not ready", configurationIssues);
      return Response.json({
        status: "not-ready",
        checks: { database: "unknown", configuration: "invalid" }
      }, { status: 503, headers });
    }
    const database = await checkDatabaseRelease();
    if (database.status !== "ready") {
      return Response.json({ status: "not-ready", checks: { database: database.status === "recovery-held" ? "recovery-held" : database.status === "unavailable" ? "unavailable" : "migration-required", configuration: "valid" } }, { status: 503, headers });
    }
    return Response.json({
      status: "ready",
      deployment: env.privateTestMode ? "private-test" : "standard",
      checks: { database: "ready", configuration: "valid" }
    }, { headers });
  } catch {
    console.error("Readiness check failed; inspect the private deployment and database configuration.");
    return Response.json({
      status: "not-ready",
      checks: { database: "unavailable", configuration: "unknown" }
    }, { status: 503, headers });
  }
}
