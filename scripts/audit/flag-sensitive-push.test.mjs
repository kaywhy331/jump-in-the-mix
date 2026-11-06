import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { auditPush, classify, main, parsePatterns, settings } from "./flag-sensitive-push.mjs";

const patterns = parsePatterns(readFileSync(settings.sensitivePathsFile, "utf8"));
const pkg = { scripts: { test: "vitest run", build: "next build" }, dependencies: { example: "1" } };
const roots = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("classify", () => {
  it.each([
    ".github/workflows/ci.yml", "vitest.config.ts", "playwright.config.ts",
    "playwright.ci.config.ts", "playwright.compat.config.ts", "playwright.staging.config.ts",
    "tests/setup.ts", "e2e/global-setup.ts", "vitest.setup.ts",
    "prisma/migrations/20261106_example/migration.sql", "scripts/release/deploy.sh",
    ".github/audit/sensitive-paths.txt", ".github/audit/protected-tests.txt",
    "scripts/audit/flag-sensitive-push.mjs",
  ])("flags %s", (path) => expect(classify([path], pkg, pkg, patterns)).toEqual([path]));

  it("flags scripts-object changes including additions and removals", () => {
    for (const next of [{ ...pkg, scripts: { test: "other" } }, { dependencies: pkg.dependencies }, null]) {
      expect(classify(["package.json"], pkg, next, patterns)).toEqual(["package.json"]);
    }
    expect(classify(["package.json"], null, pkg, patterns)).toEqual(["package.json"]);
  });

  it("ignores dependencies, formatting and scripts key order", () => {
    const next = { scripts: { build: "next build", test: "vitest run" }, dependencies: { example: "2" } };
    expect(classify(["package.json", "package-lock.json"], JSON.stringify(pkg), JSON.stringify(next, null, 2), patterns)).toEqual([]);
  });

  it("loads an explicitly protected test without protecting every test", () => {
    expect(classify(["tests/protected.test.ts", "tests/other.test.ts"], pkg, pkg,
      [...patterns, "# Acceptance tests", "tests/protected.test.ts", ""])).toEqual(["tests/protected.test.ts"]);
  });

  it("ignores source-only changes and returns unique sorted paths", () => {
    expect(classify(["src/app/page.tsx", "docs/README.md"], pkg, pkg, patterns)).toEqual([]);
    expect(classify(["vitest.config.ts", ".github/workflows/ci.yml", "vitest.config.ts"], pkg, pkg, patterns))
      .toEqual([".github/workflows/ci.yml", "vitest.config.ts"]);
  });
});

function repository() {
  const cwd = mkdtempSync(join(tmpdir(), "jitm-push-audit-"));
  roots.push(cwd);
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const put = (file, text) => { mkdirSync(dirname(join(cwd, file)), { recursive: true }); writeFileSync(join(cwd, file), text); };
  git("init", "-b", "fixture");
  git("config", "user.name", "Audit fixture");
  git("config", "user.email", "audit@example.test");
  put(settings.sensitivePathsFile, patterns.join("\n"));
  put(settings.protectedTestsFile, "# Fixture protected test\ntests/protected.test.ts\n");
  put("package.json", JSON.stringify(pkg));
  put("src/example.js", "initial\n");
  const commit = () => { git("add", "."); git("commit", "-m", "Fixture change"); return git("rev-parse", "HEAD"); };
  const before = commit();
  const event = (after, old = before) => ({ before: old, after, ref: "refs/heads/main", pusher: { name: "fixture" } });
  return { cwd, git, put, commit, before, event };
}

describe("push range and CLI", { timeout: 30_000 }, () => {
  it("reads the full payload range even when it spans multiple commits", () => {
    const r = repository();
    r.put("tests/protected.test.ts", "protected\n"); r.commit();
    r.put("src/example.js", "source\n");
    expect(auditPush(r.event(r.commit()), r.cwd).flagged).toEqual(["tests/protected.test.ts"]);
  });

  it("handles an initial push with a zero before SHA", () => {
    const r = repository();
    const report = auditPush(r.event(r.before, "0".repeat(40)), r.cwd);
    expect(report.flagged).toContain("package.json");
    expect(report.flagged).toContain(settings.sensitivePathsFile);
    expect(report.warnings).toEqual([]);
  });

  it("compares divergent force-push trees, including removed files", () => {
    const r = repository();
    r.put("prisma/migrations/example/migration.sql", "SELECT 1;\n");
    const displaced = r.commit();
    r.git("checkout", "-b", "other", r.before);
    r.put("src/example.js", "divergent\n");
    const report = auditPush(r.event(r.commit(), displaced), r.cwd);
    expect(report.flagged).toEqual(["prisma/migrations/example/migration.sql"]);
    expect(report.warnings).toEqual([]);
  });

  it("falls back conservatively when a force-push before object is unavailable", () => {
    const r = repository();
    const event = { ...r.event(r.before, "1".repeat(40)), commits: [{ removed: ["scripts/release/old.sh"] }] };
    const report = auditPush(event, r.cwd);
    expect(report.flagged).toContain("scripts/release/old.sh");
    expect(report.flagged).toContain(settings.sensitivePathsFile);
    expect(report.warnings).toHaveLength(1);
  });

  it("retains old protected rules when a push removes the list", () => {
    const r = repository();
    r.put(settings.protectedTestsFile, "# empty\n");
    r.put("tests/protected.test.ts", "changed\n");
    expect(auditPush(r.event(r.commit()), r.cwd).flagged).toEqual([settings.protectedTestsFile, "tests/protected.test.ts"]);
  });

  it("flags the old path when a workflow is renamed out of its directory", () => {
    const r = repository();
    r.put(".github/workflows/old.yml", "name: example\n");
    const before = r.commit();
    r.git("mv", ".github/workflows/old.yml", "example.yml");
    expect(auditPush(r.event(r.commit(), before), r.cwd).flagged).toEqual([".github/workflows/old.yml"]);
  });

  it("writes CLI JSON and an Actions output for a source-only push", () => {
    const r = repository();
    r.put("src/example.js", "source only\n");
    const eventPath = join(r.cwd, "event.json"), output = join(r.cwd, "output"), report = join(r.cwd, "report.json");
    writeFileSync(eventPath, JSON.stringify(r.event(r.commit())));
    const status = main({ GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: output, AUDIT_REPORT_PATH: report }, r.cwd);
    expect(status).toBe(0);
    expect(JSON.parse(readFileSync(report, "utf8")).flagged).toEqual([]);
    expect(readFileSync(output, "utf8")).toBe("has_sensitive=false\n");
  });

  it("flags malformed package JSON and skips branch deletion", () => {
    const r = repository();
    r.put("package.json", "{");
    const report = auditPush(r.event(r.commit()), r.cwd);
    expect(report.flagged).toEqual(["package.json"]);
    expect(report.warnings).toHaveLength(1);
    expect(auditPush(r.event("0".repeat(40)), r.cwd).flagged).toEqual([]);
  });

  it("keeps a CLI infrastructure error advisory", () => {
    const r = repository();
    let stderr = "";
    vi.spyOn(console, "warn").mockImplementation((message) => { stderr += `${message}\n`; });
    const status = main({ GITHUB_EVENT_PATH: join(r.cwd, "missing.json") }, r.cwd);
    expect(status).toBe(0);
    expect(stderr).toContain("::warning::");
  });
});
