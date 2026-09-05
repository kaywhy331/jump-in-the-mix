import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("hosted deployment boundary", () => {
  it("provisions PostgreSQL, web, and worker services with production-safe modes", () => {
    const blueprint = read("render.yaml");
    expect(blueprint).toContain("type: web");
    expect(blueprint).toContain("type: worker");
    expect(blueprint).toContain("fromDatabase:");
    expect(blueprint).toContain('value: "false"');
    expect(blueprint).toContain("healthCheckPath: /api/health/ready");
    expect(blueprint).toContain("preDeployCommand: npm run db:deploy");
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
