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
    // tsx is a dev dependency; the worker build installs dev dependencies so `--import tsx` resolves.
    expect(JSON.parse(read("package.json")).devDependencies.tsx).toBeTruthy();
  });

  it("starts the worker with Node itself and gives it time to stop cleanly", () => {
    const blueprint = read("render.yaml");
    const worker = blueprint.slice(blueprint.indexOf("  - type: worker"));
    const web = blueprint.slice(blueprint.indexOf("  - type: web"), blueprint.indexOf("  - type: worker"));
    // SIGTERM must reach the worker process: no npm or tsx CLI wrapper in between.
    expect(worker).toContain("\n    startCommand: node --import tsx src/worker/index.ts\n");
    expect(worker).toContain("\n    maxShutdownDelaySeconds: 300\n");
    expect(worker).toContain("npm ci --include=dev");
    expect(blueprint).not.toContain("npm run worker");
    expect(web).not.toContain("maxShutdownDelaySeconds");
    const dockerWorker = read("Dockerfile").split(/^FROM /m).find(stage => stage.startsWith("source AS worker"));
    expect(dockerWorker).toContain('CMD ["node", "--import", "tsx", "src/worker/index.ts"]');
    expect(read("docs/HOSTED_DEPLOYMENT.md")).toContain("`node --import tsx src/worker/index.ts`");
    // The entry check that starts the loop still holds under `node --import tsx`, and a stop signal
    // lets the current job finish or pause instead of ending the process.
    const entry = read("src/worker/index.ts");
    expect(entry).toContain("import.meta.url === pathToFileURL(process.argv[1]).href");
    expect(entry).toContain('process.on("SIGTERM", () => requestStop("SIGTERM"))');
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
