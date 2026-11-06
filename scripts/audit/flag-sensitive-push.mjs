import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Shared defaults for classification, reporting and the workflow's issue writer.
export const settings = Object.freeze({
  sensitivePathsFile: ".github/audit/sensitive-paths.txt",
  protectedTestsFile: ".github/audit/protected-tests.txt",
  packageFile: "package.json",
  reportFile: "sensitive-push.json",
  remote: "origin",
  label: "post-merge-audit",
  labelColor: "D93F0B",
  labelDescription: "Sensitive paths changed in a push to the audited branch",
  titlePrefix: "Post-merge audit",
  markerPrefix: "post-merge-audit",
  gitTimeoutMs: 30_000,
  gitMaxBuffer: 32 * 1024 * 1024,
});

export const parsePatterns = (text) => text.split(/\r?\n/)
  .map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));

function scripts(value) {
  return (typeof value === "string" ? JSON.parse(value) : value)?.scripts;
}

/** Pure, sorted, duplicate-free classification; package inputs are objects, JSON or null. */
export function classify(changedFiles, oldPackageJson, newPackageJson, patterns) {
  const globs = parsePatterns(patterns.join("\n"));
  return [...new Set(changedFiles)].filter((file) =>
    globs.some((pattern) => posix.matchesGlob(file, pattern)) ||
    (file === settings.packageFile && !isDeepStrictEqual(scripts(oldPackageJson), scripts(newPackageJson)))
  ).sort();
}

export const reportPath = (env = process.env) =>
  env.AUDIT_REPORT_PATH || join(env.RUNNER_TEMP || ".", settings.reportFile);

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    timeout: settings.gitTimeoutMs, maxBuffer: settings.gitMaxBuffer,
  });
}

function hasCommit(cwd, sha) {
  try { git(cwd, ["cat-file", "-e", `${sha}^{commit}`]); return true; }
  catch { return false; }
}

function ensureCommit(cwd, sha) {
  if (hasCommit(cwd, sha)) return true;
  try { git(cwd, ["fetch", "--no-tags", settings.remote, sha]); }
  catch { /* A force push may leave the old object unavailable on the server. */ }
  return hasCommit(cwd, sha);
}

function fileAt(cwd, sha, file) {
  if (!sha) return null;
  // Distinguish an absent file from a failed read or malformed package JSON.
  if (!git(cwd, ["ls-tree", "--name-only", sha, "--", file]).trim()) return null;
  return git(cwd, ["show", `${sha}:${file}`]);
}

export function auditPush(event, cwd = process.cwd()) {
  const { before, after } = event;
  if (![before, after].every((sha) => typeof sha === "string" && /^[a-f\d]{40}$/.test(sha))) {
    throw new Error("Push event must contain full before and after commit IDs");
  }
  const warnings = [];
  const base = { before, after, pusher: event.pusher?.name || event.sender?.login || "unknown", ref: event.ref };
  if (/^0+$/.test(after)) return { ...base, flagged: [], warnings }; // Branch deletion.
  if (!ensureCommit(cwd, after)) throw new Error("Push head is unavailable");
  const initial = /^0+$/.test(before);
  const previous = !initial && ensureCommit(cwd, before) ? before : null;
  if (!initial && !previous) warnings.push("Before commit unavailable; conservatively auditing the head tree and event paths.");
  // A two-tree diff also works for non-ancestor force pushes; disable rename
  // detection so moving a protected file still includes its deleted path.
  const changedFiles = (previous
    ? git(cwd, ["diff", "--name-only", "--no-renames", "-z", previous, after, "--"])
    : git(cwd, ["ls-tree", "-r", "--name-only", "-z", after])).split("\0").filter(Boolean);
  if (!initial && !previous) {
    for (const commit of event.commits || []) {
      changedFiles.push(...(commit.added || []), ...(commit.modified || []), ...(commit.removed || []));
    }
  }
  // Union both revisions so a push cannot silently remove its own protected paths.
  const patterns = [settings.sensitivePathsFile, settings.protectedTestsFile].flatMap((file) =>
    [previous, after].flatMap((sha) => parsePatterns(fileAt(cwd, sha, file) || ""))
  );
  let flagged;
  try {
    flagged = classify(changedFiles, fileAt(cwd, previous, settings.packageFile), fileAt(cwd, after, settings.packageFile), patterns);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    warnings.push("Package JSON could not be parsed; package.json is flagged for review.");
    flagged = classify(changedFiles, null, null, patterns);
    if (changedFiles.includes(settings.packageFile)) flagged.push(settings.packageFile);
    flagged = [...new Set(flagged)].sort();
  }
  return { ...base, flagged, warnings };
}

export function runCli(env = process.env, cwd = process.cwd()) {
  const report = auditPush(JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8")), cwd);
  writeFileSync(reportPath(env), `${JSON.stringify(report, null, 2)}\n`);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `has_sensitive=${report.flagged.length > 0}\n`);
  return report;
}

export function main(env = process.env, cwd = process.cwd()) {
  try { runCli(env, cwd); }
  catch {
    // Advisory only: a reporting outage must not fail the push or disclose data.
    console.warn("::warning::Post-merge audit could not classify this push; inspect the audit run.");
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
