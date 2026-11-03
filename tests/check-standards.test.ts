import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// standards:check reads the router as committed. Orca task worktrees carry an uncommitted bootstrap above the Next.js
// block; the checker sets it aside only while Git shows it is not committed or staged (JITM-16 §2.18).
const repo = fileURLToPath(new URL("..", import.meta.url));
const checker = join(repo, "scripts/check-standards.mjs");
const BEGIN = "<!-- BEGIN:nextjs-agent-rules -->";
const END = "<!-- END:nextjs-agent-rules -->";
/** The block Orca writes at the top of AGENTS.md in its task worktrees; line 5 holds a home-relative path. */
const BOOTSTRAP = `<!-- ORCA-WORKFLOW:BEGIN -->
## Mandatory Orca entry point

Owner directive 2026-10-15: before ANY project work, read \`ORCA-WORKFLOW.md\`
(or \`~/orca/protocol/ORCA-WORKFLOW.md\`) and run \`orca-hub preflight --path .\`.
Every request, including small/direct-chat work, must use the existing Orca
Dispatch Hub. Outside a live dispatch, submit/update the Hub task and coordinate;
do not implement in parallel. If Orca is unavailable, stop project mutations.
Do not create another queue/scheduler or revive OpenClaw. This newer directive
supersedes older direct-work exceptions while retaining technical project rules.
The installed orca_intake MCP tools provide the same preflight and intake path
without shell execution. They do not claim project ownership or grant permission.
<!-- ORCA-WORKFLOW:END -->

`;
const STARTS = "AGENTS.md: must start with the Next.js agent-rules block";
const HOME_PATH = "AGENTS.md:5: home-relative path in committed text";
const COMMITTED = "AGENTS.md: the Orca bootstrap block must stay an uncommitted overlay";

// A hook can export GIT_DIR and friends; the fixtures are their own repositories.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))) as NodeJS.ProcessEnv;
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", ...args], { cwd, env, stdio: "ignore" });
const read = () => readFileSync(join(repo, "AGENTS.md"), "utf8").replace(/\r\n/g, "\n");
/** This checkout's router without any overlay it carries. */
const router = () => read().slice(read().indexOf(BEGIN));

const fixtures: string[] = [];
afterEach(() => { for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true }); });

/**
 * A checkout whose own files are AGENTS.md and its CLAUDE.md link; everything else the checker reads links back to this
 * repository. With Git, AGENTS.md is committed as given; without, the directory stands for an exported archive.
 */
function checkout(committed: string, { withGit = true } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "jitm-standards-"));
  fixtures.push(directory);
  for (const name of readdirSync(repo)) {
    if (![".git", ".artifacts", ".next", "node_modules", "AGENTS.md", "CLAUDE.md"].includes(name)) symlinkSync(join(repo, name), join(directory, name));
  }
  writeFileSync(join(directory, "AGENTS.md"), committed);
  symlinkSync("AGENTS.md", join(directory, "CLAUDE.md"));
  if (withGit) { git(directory, "init", "-q"); git(directory, "add", "AGENTS.md"); git(directory, "commit", "-q", "-m", "Router"); }
  return {
    directory,
    write: (text: string) => writeFileSync(join(directory, "AGENTS.md"), text),
    stage: () => git(directory, "add", "AGENTS.md")
  };
}

function check(directory: string) {
  const result = spawnSync(process.execPath, [checker], { cwd: directory, env, encoding: "utf8" });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe("standards:check and the uncommitted Orca bootstrap", () => {
  it("sets the bootstrap aside while it is uncommitted, reporting exactly what the committed router reports", () => {
    const fixture = checkout(router());
    const committed = check(fixture.directory);
    expect(committed.status).toBe(0);
    fixture.write(BOOTSTRAP + router());
    expect(check(fixture.directory)).toEqual(committed);
    // The same section without Orca's marker pair.
    fixture.write(BOOTSTRAP.replace("<!-- ORCA-WORKFLOW:BEGIN -->\n", "").replace("<!-- ORCA-WORKFLOW:END -->\n", "") + router());
    expect(check(fixture.directory)).toEqual(committed);
  });

  it("fails the bootstrap once it is committed", () => {
    const result = check(checkout(BOOTSTRAP + router()).directory);
    expect(result.status).toBe(1);
    for (const error of [COMMITTED, STARTS, HOME_PATH]) expect(result.output).toContain(error);
  });

  it("fails the bootstrap once it is staged", () => {
    const fixture = checkout(router());
    fixture.write(BOOTSTRAP + router());
    fixture.stage();
    const result = check(fixture.directory);
    expect(result.status).toBe(1);
    for (const error of [COMMITTED, STARTS, HOME_PATH]) expect(result.output).toContain(error);
  });

  it("fails the bootstrap outside a Git checkout, where the files are the committed content", () => {
    const result = check(checkout(BOOTSTRAP + router(), { withGit: false }).directory);
    expect(result.status).toBe(1);
    for (const error of [COMMITTED, STARTS, HOME_PATH]) expect(result.output).toContain(error);
  });

  it("still fails any other home-relative path, at its line in the file", () => {
    const fixture = checkout(router());
    const heading = "# Jump in the Mix — agent router\n";
    const text = BOOTSTRAP + router().replace(heading, `${heading}\nNotes live in ~/notes/router.md.\n`);
    fixture.write(text);
    const line = text.split("\n").findIndex(row => row.includes("~/notes/")) + 1;
    expect(line).toBeGreaterThan(BOOTSTRAP.split("\n").length);
    const result = check(fixture.directory);
    expect(result.status).toBe(1);
    expect(result.output).toContain(`AGENTS.md:${line}: home-relative path in committed text`);
    expect(result.output).not.toContain(HOME_PATH);
  });

  it("still fails a missing or altered Next.js block under the bootstrap", () => {
    const fixture = checkout(router());
    fixture.write(BOOTSTRAP + router().slice(router().indexOf(END) + END.length).trimStart());
    const missing = check(fixture.directory);
    expect(missing.status).toBe(1);
    for (const error of [STARTS, "AGENTS.md: Next.js agent-rules markers missing or out of order", HOME_PATH]) expect(missing.output).toContain(error);
    fixture.write(BOOTSTRAP + router().replace("This is NOT the Next.js you know", "This is the Next.js you know"));
    const altered = check(fixture.directory);
    expect(altered.status).toBe(1);
    expect(altered.output).toContain("AGENTS.md: Next.js agent-rules block altered");
  });

  it("sets aside only a leading bootstrap that ends just before the Next.js block", () => {
    const fixture = checkout(router());
    const variants = [
      `Notes first.\n\n${BOOTSTRAP}${router()}`,
      `${BOOTSTRAP}Something else.\n\n${router()}`,
      `${BOOTSTRAP.replace("<!-- ORCA-WORKFLOW:END -->\n", "")}${router()}`,
      `${BOOTSTRAP.replace("Every request", "<!-- note -->\nEvery request")}${router()}`
    ];
    for (const text of variants) {
      fixture.write(text);
      const result = check(fixture.directory);
      expect(result.status).toBe(1);
      expect(result.output).toContain(STARTS);
    }
  });
});
