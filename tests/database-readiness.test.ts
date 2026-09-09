import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ configuration: vi.fn(), database: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { privateTestMode: false }, productionConfigurationIssues: mocks.configuration }));
vi.mock("@/lib/database-release", () => ({ checkDatabaseRelease: mocks.database }));
import { GET } from "../src/app/api/health/ready/route";

describe("release-aware readiness", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.configuration.mockReturnValue([]); });
  it("requires both configuration and schema readiness and does not cache the response", async () => {
    mocks.database.mockResolvedValue({ status: "ready" }); const response = await GET();
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ status: "ready", checks: { database: "ready", configuration: "valid" } });
  });
  it.each(["missing-history", "pending-migrations", "migration-in-progress", "migration-mismatch", "schema-mismatch", "unavailable"])("keeps %s unready without publishing migration names or identifiers", async status => {
    mocks.database.mockResolvedValue({ status, missing: 2, required: 44, mismatched: 1 });
    const response = await GET(); expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "not-ready", checks: { database: status === "unavailable" ? "unavailable" : "migration-required", configuration: "valid" } });
  });
  it("does not advertise connectivity when configuration prevents qualification", async () => {
    mocks.configuration.mockReturnValue(["missing sender"]); const response = await GET();
    expect(response.status).toBe(503); expect((await response.json()).checks.database).toBe("unknown"); expect(mocks.database).not.toHaveBeenCalled();
  });
  it("reports a recovery hold without exposing its private metadata", async () => {
    mocks.database.mockResolvedValue({ status: "recovery-held", missing: 0, required: 45, mismatched: 0 });
    const response = await GET(); expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "not-ready", checks: { database: "recovery-held", configuration: "valid" } });
  });
});
