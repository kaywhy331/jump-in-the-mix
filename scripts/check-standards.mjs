import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

// Checks the JITM standards, workflows, shared agent skills and the AGENTS.md router.
// Plain Node with no dependencies: run `npm run standards:check` from the repository root.

const root = process.cwd();
const failures = [];
const warnings = [];
const fail = (file, message) => failures.push(`${file}: ${message}`);
const warn = (file, message) => warnings.push(`${file}: ${message}`);
const read = (path) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
const exists = (path) => existsSync(join(root, path));

const STANDARDS = "docs/standards";
const WORKFLOWS = "docs/standards/workflows";
const SKILLS = ".agents/skills";
const CLAUDE_SKILLS = ".claude/skills";
const BEGIN_MARKER = "<!-- BEGIN:nextjs-agent-rules -->";
const END_MARKER = "<!-- END:nextjs-agent-rules -->";
const ROUTER_MAX_BYTES = 10240;
const ROUTER_MAX_LINES = 160;
const BASIS_TAG = /\[(OWNER|SHIPPED|SOURCE|PROPOSED)\b/;

function walk(directory, predicate) {
  if (!exists(directory)) return [];
  const results = [];
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) results.push(...walk(path, predicate));
    else if (entry.isFile() && predicate(path)) results.push(path);
  }
  return results.sort();
}

const unquote = (value) => value.trim().replace(/^["']|["']$/g, "");

function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const data = {};
  let listKey = null;
  for (const line of match[1].split("\n")) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey) {
      data[listKey].push(unquote(item[1]));
      continue;
    }
    const pair = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!pair) continue;
    const [, key, raw] = pair;
    listKey = null;
    if (raw === "") {
      data[key] = [];
      listKey = key;
    } else if (raw.startsWith("[") && raw.endsWith("]")) {
      data[key] = raw.slice(1, -1).split(",").map(unquote).filter(Boolean);
    } else {
      data[key] = unquote(raw);
    }
  }
  return { data, body: text.slice(match[0].length) };
}

// Removes fenced and inline code so examples are not treated as links or citations.
const stripCode = (text) => text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");

// Standards: frontmatter, numbering, sections, rule ids and basis tags.
const standardFiles = exists(STANDARDS)
  ? readdirSync(join(root, STANDARDS)).filter((name) => /^\d{2}-[a-z0-9-]+\.md$/.test(name)).sort()
  : [];
if (standardFiles.length === 0) fail(STANDARDS, "no numbered standards found");
const standards = new Map();
const standardKeys = ["id", "title", "status", "version", "owner", "last_reviewed", "applies_to", "supersedes",
  "sources", "related_skills", "related_workflows"];
for (const name of standardFiles) {
  const path = `${STANDARDS}/${name}`;
  const number = name.slice(0, 2);
  const parsed = parseFrontmatter(read(path));
  if (!parsed) {
    fail(path, "missing frontmatter");
    continue;
  }
  const { data, body } = parsed;
  for (const key of standardKeys) if (!(key in data)) fail(path, `frontmatter lacks \`${key}\``);
  if (data.id !== `JITM-${number}`) fail(path, `id must be JITM-${number}, found ${data.id}`);
  if (data.status && !["active", "draft", "superseded"].includes(data.status)) fail(path, `unknown status ${data.status}`);
  if (data.version && !/^\d+\.\d+\.\d+$/.test(data.version)) fail(path, `version must be semver, found ${data.version}`);
  const sections = new Set([...body.matchAll(/^## (\d+)\. /gm)].map((match) => match[1]));
  for (let section = 1; section <= 7; section += 1) {
    if (!sections.has(String(section))) fail(path, `missing section "## ${section}. …"`);
  }
  const rules = new Set();
  const lines = body.split("\n");
  let current = null;
  const closeRule = () => {
    if (current && !BASIS_TAG.test(current.text)) fail(path, `rule ${current.id} has no basis tag`);
    current = null;
  };
  for (const line of lines) {
    const rule = line.match(/^\*\*(\d+\.\d+)\*\*/);
    if (rule || /^#{1,6} /.test(line)) closeRule();
    if (rule) {
      if (rules.has(rule[1])) fail(path, `duplicate rule ${rule[1]}`);
      rules.add(rule[1]);
      current = { id: rule[1], text: line };
    } else if (current) {
      current.text += `\n${line}`;
    }
  }
  closeRule();
  if (![...rules].some((id) => id.startsWith("2."))) fail(path, "section 2 has no numbered rules (**2.1** …)");
  const limit = number === "00" ? 120 : 300;
  if (lines.length > limit) warn(path, `${lines.length} lines exceeds the ${limit}-line target`);
  standards.set(number, { path, rules, sections, data });
}

// Workflows.
const workflowFiles = exists(WORKFLOWS)
  ? readdirSync(join(root, WORKFLOWS)).filter((name) => /^WF-\d{2}-[a-z0-9-]+\.md$/.test(name)).sort()
  : [];
if (workflowFiles.length === 0) fail(WORKFLOWS, "no workflows found");
const workflows = new Map();
for (const name of workflowFiles) {
  const path = `${WORKFLOWS}/${name}`;
  const parsed = parseFrontmatter(read(path));
  if (!parsed) {
    fail(path, "missing frontmatter");
    continue;
  }
  const id = name.slice(0, 5);
  for (const key of ["id", "title", "status", "version", "owner", "last_reviewed", "standards", "skills"]) {
    if (!(key in parsed.data)) fail(path, `frontmatter lacks \`${key}\``);
  }
  if (parsed.data.id !== id) fail(path, `id must be ${id}, found ${parsed.data.id}`);
  workflows.set(id, { path, data: parsed.data });
}

// Skills: portable frontmatter, naming, description budget and Claude Code parity.
const skillNames = exists(SKILLS)
  ? readdirSync(join(root, SKILLS), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  : [];
if (skillNames.length === 0) fail(SKILLS, "no skills found");
for (const name of skillNames) {
  const path = `${SKILLS}/${name}/SKILL.md`;
  if (!exists(path)) {
    fail(path, "missing SKILL.md");
    continue;
  }
  const parsed = parseFrontmatter(read(path));
  if (!parsed) {
    fail(path, "missing frontmatter");
    continue;
  }
  const keys = Object.keys(parsed.data);
  const extra = keys.filter((key) => !["name", "description"].includes(key));
  if (extra.length > 0) fail(path, `only name and description are portable; remove ${extra.join(", ")}`);
  if (parsed.data.name !== name) fail(path, `name must equal the directory name (${name})`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) fail(path, "name must be lowercase-hyphenated, ≤ 64 characters");
  const description = parsed.data.description ?? "";
  if (description.length === 0 || description.length > 1024) fail(path, `description must be 1–1024 characters (${description.length})`);
  if (!/use when/i.test(description)) warn(path, "description should say when to use the skill (\"Use when …\")");
  const bodyLines = parsed.body.split("\n").length;
  if (bodyLines > 150) warn(path, `body has ${bodyLines} lines; target ≤ 150`);
}
if (skillNames.length > 0) {
  const link = join(root, CLAUDE_SKILLS);
  if (!existsSync(link)) {
    fail(CLAUDE_SKILLS, "missing; Claude Code only discovers skills here");
  } else if (lstatSync(link).isSymbolicLink()) {
    if (realpathSync(link) !== realpathSync(join(root, SKILLS))) fail(CLAUDE_SKILLS, `symlink must resolve to ${SKILLS}`);
  } else {
    for (const name of skillNames) {
      const copy = `${CLAUDE_SKILLS}/${name}/SKILL.md`;
      if (!exists(copy) || read(copy) !== read(`${SKILLS}/${name}/SKILL.md`)) fail(copy, `differs from ${SKILLS}/${name}/SKILL.md`);
    }
  }
}

// Index: every standard and workflow is listed.
const indexPath = `${STANDARDS}/README.md`;
if (!exists(indexPath)) {
  fail(indexPath, "missing standards index");
} else {
  const index = read(indexPath);
  for (const name of standardFiles) if (!index.includes(`](${name})`)) fail(indexPath, `does not link ${name}`);
  for (const name of workflowFiles) if (!index.includes(`](workflows/${name})`)) fail(indexPath, `does not link workflows/${name}`);
}

// Router: the Next.js block stays first and intact; the rest stays within budget and names every skill.
if (!exists("AGENTS.md")) {
  fail("AGENTS.md", "missing");
} else {
  const agents = read("AGENTS.md");
  const begin = agents.indexOf(BEGIN_MARKER);
  const end = agents.indexOf(END_MARKER);
  if (agents.trimStart().indexOf(BEGIN_MARKER) !== 0) fail("AGENTS.md", "must start with the Next.js agent-rules block");
  if (begin === -1 || end < begin) fail("AGENTS.md", "Next.js agent-rules markers missing or out of order");
  else if (!agents.slice(begin, end).includes("This is NOT the Next.js you know")) fail("AGENTS.md", "Next.js agent-rules block altered");
  if (end !== -1) {
    const router = agents.slice(end + END_MARKER.length);
    const bytes = Buffer.byteLength(router, "utf8");
    const lines = router.trim().split("\n").length;
    if (bytes > ROUTER_MAX_BYTES) fail("AGENTS.md", `router is ${bytes} bytes; budget ${ROUTER_MAX_BYTES}`);
    if (lines > ROUTER_MAX_LINES) fail("AGENTS.md", `router is ${lines} lines; budget ${ROUTER_MAX_LINES}`);
  }
  if (!agents.includes("docs/standards/README.md")) fail("AGENTS.md", "must link docs/standards/README.md");
  const mentioned = new Set(agents.match(/\bjitm-[a-z0-9-]+/g) ?? []);
  for (const name of mentioned) if (!skillNames.includes(name)) fail("AGENTS.md", `names unknown skill ${name}`);
  for (const name of skillNames) if (!mentioned.has(name)) fail("AGENTS.md", `does not route to skill ${name}`);
}
// CLAUDE.md must be a symlink to AGENTS.md: an @AGENTS.md import only loads in the session's start directory.
if (!existsSync(join(root, "CLAUDE.md"))) {
  fail("CLAUDE.md", "missing; Claude Code reads the router through it");
} else if (!lstatSync(join(root, "CLAUDE.md")).isSymbolicLink()) {
  warn("CLAUDE.md", "should be a symlink to AGENTS.md; an @AGENTS.md import does not load in subdirectory sessions");
} else if (realpathSync(join(root, "CLAUDE.md")) !== realpathSync(join(root, "AGENTS.md"))) {
  fail("CLAUDE.md", "symlink must resolve to AGENTS.md");
}

// Cross-references, relative links and repository hygiene in every standards-related document.
const scoped = [
  "AGENTS.md",
  ".github/pull_request_template.md",
  ...walk(STANDARDS, (path) => path.endsWith(".md")),
  ...walk(SKILLS, (path) => path.endsWith(".md")),
  ...readdirSync(join(root, "docs")).filter((name) => /^STANDARDS_AUDIT_.*\.md$/.test(name)).map((name) => `docs/${name}`),
  ...readdirSync(join(root, "docs"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("standards-audit-"))
    .flatMap((entry) => walk(`docs/${entry.name}`, (path) => path.endsWith(".md"))),
].filter(exists);

const hygiene = [
  [/\/home\/[A-Za-z0-9_.-]+/, "absolute home-directory path"],
  [/\/Users\/[A-Za-z0-9_.-]+/, "absolute home-directory path"],
  [/[A-Za-z]:\\Users\\/, "absolute home-directory path"],
  [/(^|[\s(`'"])~\/[A-Za-z0-9_.-]/, "home-relative path"],
  [/vault\/0\d_[A-Z]/, "vault path"],
  [/\btrixbot\b/i, "machine name"],
];

for (const path of scoped) {
  const text = read(path);
  const code = stripCode(text);
  for (const match of code.matchAll(/\bJITM-(\d{2})(?:\s*§\s*(\d+(?:\.\d+)?))?/g)) {
    const [, number, anchor] = match;
    const standard = standards.get(number);
    if (!standard) {
      fail(path, `cites unknown standard JITM-${number}`);
    } else if (anchor && anchor.includes(".") && !standard.rules.has(anchor)) {
      fail(path, `cites missing rule JITM-${number} §${anchor}`);
    } else if (anchor && !anchor.includes(".") && !standard.sections.has(anchor)) {
      fail(path, `cites missing section JITM-${number} §${anchor}`);
    }
  }
  for (const match of code.matchAll(/\bWF-(\d{2})\b/g)) {
    if (!workflows.has(`WF-${match[1]}`)) fail(path, `cites unknown workflow WF-${match[1]}`);
  }
  for (const match of code.matchAll(/\[[^\]]*\]\((<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    let target = match[1].replace(/^<|>$/g, "");
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    target = decodeURIComponent(target.split("#")[0].split("?")[0]);
    if (target === "") continue;
    const resolved = resolve(dirname(join(root, path)), target);
    if (!existsSync(resolved)) fail(path, `broken link ${match[1]} (${relative(root, resolved)})`);
  }
  text.split("\n").forEach((line, index) => {
    for (const [pattern, label] of hygiene) if (pattern.test(line)) fail(`${path}:${index + 1}`, `${label} in committed text`);
  });
}

for (const [number, { path, data }] of standards) {
  for (const skill of data.related_skills ?? []) if (!skillNames.includes(skill)) fail(path, `related skill ${skill} does not exist`);
  for (const workflow of data.related_workflows ?? []) if (!workflows.has(workflow)) fail(path, `related workflow ${workflow} does not exist`);
  if (!Array.isArray(data.sources) || data.sources.length === 0) warn(path, `JITM-${number} lists no sources`);
}
for (const [id, { path, data }] of workflows) {
  for (const standard of data.standards ?? []) if (!standards.has(standard.replace("JITM-", ""))) fail(path, `${id} references unknown ${standard}`);
  for (const skill of data.skills ?? []) if (!skillNames.includes(skill)) fail(path, `${id} references unknown skill ${skill}`);
}

for (const message of warnings) console.warn(`warning  ${message}`);
for (const message of failures) console.error(`error    ${message}`);
const summary = `${standards.size} standards, ${workflows.size} workflows, ${skillNames.length} skills, ${scoped.length} documents checked`;
if (failures.length > 0) {
  console.error(`standards:check failed: ${failures.length} error(s), ${warnings.length} warning(s); ${summary}`);
  process.exit(1);
}
console.log(`standards:check passed with ${warnings.length} warning(s); ${summary}`);
