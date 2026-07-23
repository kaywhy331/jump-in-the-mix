import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

const roots = ["src", "prisma"];
const files = [];
const extensions = ["", ".ts", ".tsx", ".js", ".mjs", ".json"];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "generated" || entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if ([".ts", ".tsx", ".js", ".mjs"].includes(extname(entry.name))) files.push(path);
  }
}

function resolves(base) {
  return extensions.some((extension) => existsSync(`${base}${extension}`)) ||
    ["index.ts", "index.tsx", "index.js", "index.mjs"].some((name) => existsSync(join(base, name)));
}

for (const root of roots) walk(root);

const missing = [];
const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']|import\(["']([^"']+)["']\)/g;
for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2];
    if (!specifier || (!specifier.startsWith(".") && !specifier.startsWith("@/"))) continue;
    if (specifier.startsWith("@/generated/prisma")) continue;
    const base = specifier.startsWith("@/")
      ? resolve("src", specifier.slice(2))
      : resolve(dirname(file), specifier);
    if (!resolves(base)) missing.push(`${relative(process.cwd(), file)} -> ${specifier}`);
  }
}

const compatibilityActions = resolve("src/lib/actions.ts");
if (existsSync(compatibilityActions)) {
  const source = readFileSync(compatibilityActions, "utf8");
  const forbidden = [
    /export\s+async\s+function/,
    /\bprisma\./,
    /\brequireWorkspace\s*\(/,
    /\bredirect\s*\(/
  ];
  if (forbidden.some((pattern) => pattern.test(source))) {
    missing.push("src/lib/actions.ts must remain a re-export-only compatibility boundary; move implementations into scoped modules");
  }
}

if (missing.length) {
  console.error(`[FAIL] ${missing.length} local import or action-boundary issue(s):\n${missing.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`[OK] Resolved local imports across ${files.length} source files and verified the Server Action boundary.`);
}
