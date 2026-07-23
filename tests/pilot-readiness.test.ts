import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { productionConfigurationIssues, sessionCookieSecure } from "../src/lib/env";
import { registrationAllowed } from "../src/lib/pilot-registration";

const securePilotEnvironment = {
  NODE_ENV: "production",
  PILOT_MODE: "true",
  DEMO_MODE: "false",
  APP_URL: "http://127.0.0.1:3000",
  DATABASE_URL: "postgresql://jitm:unique-database-password@postgres:5432/jitm?schema=public",
  AUTH_RATE_LIMIT_SECRET: "unique-rate-limit-secret-with-32-characters",
  DATA_ENCRYPTION_KEY: "unique-data-encryption-key-with-32-characters"
} as NodeJS.ProcessEnv;

describe("single-user pilot packaging", () => {
  it("permits a production pilot on loopback with strong required secrets", () => {
    expect(productionConfigurationIssues(securePilotEnvironment)).toEqual([]);
    expect(sessionCookieSecure(securePilotEnvironment)).toBe(false);
    expect(sessionCookieSecure({ ...securePilotEnvironment, PILOT_MODE: "false" })).toBe(true);
    expect(sessionCookieSecure({ ...securePilotEnvironment, APP_URL: "https://pilot.example.com" })).toBe(true);
  });

  it("does not relax the HTTPS requirement outside explicit pilot mode", () => {
    const issues = productionConfigurationIssues({ ...securePilotEnvironment, PILOT_MODE: "false" });
    expect(issues).toContain("APP_URL must be a public https origin");
  });

  it("rejects demo mode in every production configuration", () => {
    const issues = productionConfigurationIssues({ ...securePilotEnvironment, DEMO_MODE: "true" });
    expect(issues).toContain("DEMO_MODE must be false");
  });

  it("allows exactly the first account in pilot mode without changing development registration", () => {
    expect(registrationAllowed(true, 0)).toBe(true);
    expect(registrationAllowed(true, 1)).toBe(false);
    expect(registrationAllowed(false, 12)).toBe(true);
  });

  it("uses production images, loopback web access, and no database host port", () => {
    const compose = readFileSync("compose.pilot.yml", "utf8");
    const dockerfile = readFileSync("Dockerfile", "utf8");
    expect(compose).toContain('PILOT_MODE: "true"');
    expect(compose).toContain('DEMO_MODE: "false"');
    expect(compose).toContain("target: production");
    expect(compose).toContain('127.0.0.1:${APP_PORT:-3000}:3000');
    const postgresBlock = compose.slice(compose.indexOf("  postgres:"), compose.indexOf("\n  setup:"));
    expect(postgresBlock).not.toContain("ports:");
    expect(dockerfile).toContain("ENV HOSTNAME=0.0.0.0");
    expect(dockerfile).toContain("ENV PORT=3000");
  });

  it("locks registration transactionally and guards restore", () => {
    const actions = readFileSync("src/lib/auth-actions.ts", "utf8");
    const registration = readFileSync("src/app/register/page.tsx", "utf8");
    const pilot = readFileSync("scripts/pilot.mjs", "utf8");
    expect(actions).toContain('isolationLevel: "Serializable"');
    expect(actions).toContain("registrationAllowed(env.pilotMode");
    expect(registration).toContain('dynamic = "force-dynamic"');
    expect(pilot).toContain('"--confirm=RESTORE"');
    expect(pilot).toContain('"--rm", "--build", "operations"');
    expect(pilot).toContain("RESTORE_DATABASE_URL must point to a separate, empty PostgreSQL database");
    expect(pilot).toContain("waitForHealthEndpoint");
    expect(pilot).toContain("Worker readiness");
  });

  it("keeps database-backed tests bounded and ignores local evidence artifacts", () => {
    const config = readFileSync("vitest.config.ts", "utf8");
    expect(config).toContain('".artifacts/**"');
    expect(config).toContain("maxWorkers: 4");
  });
});
