import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("hosted deployment boundary", () => {
  it("keeps PostgreSQL owner credentials outside the web and worker Blueprint", () => {
    const blueprint = read("render.yaml");
    const database = read("infra/operations/render-database.yaml");
    expect(blueprint).toContain("type: web");
    expect(blueprint).toContain("type: worker");
    expect(blueprint).not.toContain("fromDatabase:");
    expect(blueprint).not.toContain("MIGRATION_DATABASE_URL");
    expect(blueprint).toContain("envVarKey: DATABASE_URL");
    expect(database).toContain('postgresMajorVersion: "16"');
    expect(database).toContain("ipAllowList: []");
    expect(blueprint).toContain('value: "false"');
    expect(blueprint).toContain("healthCheckPath: /api/health/ready");
    expect(blueprint).toContain("preDeployCommand: node scripts/configure-runtime-database.mjs --role=jitm_runtime && npm run db:verify-release && npm run db:seed:catalog");
    expect(blueprint).not.toContain("npm run db:deploy");
  });

  it("retains build-time Prisma and runtime worker tooling on the host", () => {
    const blueprint = read("render.yaml");
    expect(blueprint.match(/npm ci --include=dev/g)).toHaveLength(2);
    expect(blueprint).toContain("startCommand: npm run worker");
  });

  it("builds both deployable container targets in CI", () => {
    const workflow = read(".github/workflows/ci.yml");
    expect(workflow).toContain("npm run security:audit");
    expect(workflow).toContain("docker build --target production");
    expect(workflow).toContain("docker build --target worker");
  });

  it("runs Lighthouse with the Chromium installation supplied by Playwright", () => {
    const lighthouse = read(".lighthouserc.cjs");
    expect(lighthouse).toContain('require("@playwright/test")');
    expect(lighthouse).toContain("chromium.executablePath()");
  });
});
