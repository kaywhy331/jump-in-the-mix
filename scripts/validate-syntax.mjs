import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { transform } from "esbuild";

const roots = ["src", "prisma", "scripts"];
const files = [];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "generated" || entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if ([".ts", ".tsx", ".js", ".mjs"].includes(extname(entry.name))) files.push(path);
  }
}

for (const root of roots) walk(root);

const errors = [];
for (const file of files) {
  try {
    const extension = extname(file);
    const loader = extension === ".tsx" ? "tsx" : extension === ".ts" ? "ts" : "js";
    await transform(readFileSync(file, "utf8"), { loader, target: "es2022", jsx: "automatic" });
  } catch (error) {
    errors.push(`${relative(process.cwd(), file)}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (errors.length) {
  console.error(`[FAIL] ${errors.length} source file(s) could not be parsed:\n${errors.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`[OK] Parsed ${files.length} TypeScript/JavaScript source files.`);
}
