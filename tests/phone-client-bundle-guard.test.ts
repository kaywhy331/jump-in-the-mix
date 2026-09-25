import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The phone metadata (libphonenumber-js) is server-only: src/lib/phone-number.ts is its only importer,
 * and no browser bundle may reach that module or the package. This walks the import graph from every
 * "use client" file the way the bundler does: it follows value imports, re-exports and dynamic
 * imports through "@/" and relative paths, skips `import type` (erased), and stops at "use server"
 * modules, which the client receives only as action references.
 */

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const PARSER_MODULE = join(SRC, "lib", "phone-number.ts");
const PARSER_PACKAGE = /^libphonenumber-js(?:\/|$)/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    // The generated Prisma client and schema release are server-only machine output.
    if (path === join(SRC, "generated")) return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|js|jsx|mjs)$/.test(name) && !/\.test\.(?:ts|tsx)$/.test(name) ? [path] : [];
  });
}

const sources = new Map<string, string>();
function read(file: string): string {
  let source = sources.get(file);
  if (source === undefined) {
    source = readFileSync(file, "utf8");
    sources.set(file, source);
  }
  return source;
}

/** "client", "server" or null: the directive that opens the module, before any other statement. */
function directive(source: string): "client" | "server" | null {
  const body = source.replace(/^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "");
  const match = /^["']use (client|server)["']/.exec(body);
  return match ? (match[1] as "client" | "server") : null;
}

/** Module specifiers the bundler would follow: value imports, side-effect imports, re-exports and import(). */
function specifiers(source: string): string[] {
  const found: string[] = [];
  const statement = /(?:^|[;\n])[ \t]*(import|export)\s+(type\s+)?([^;"'`]{0,2000}?)\s+from\s+["']([^"']+)["']/g;
  for (const match of source.matchAll(statement)) if (!match[2]) found.push(match[4]);
  for (const match of source.matchAll(/(?:^|[;\n])\s*import\s+["']([^"']+)["']/g)) found.push(match[1]);
  for (const match of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) found.push(match[1]);
  return found;
}

function resolveLocal(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/") ? join(SRC, specifier.slice(2)) : specifier.startsWith(".") ? resolve(dirname(from), specifier) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (/\.(?:ts|tsx|js|mjs)$/.test(candidate) && existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

type Reach = { modules: Map<string, string[]>; violations: string[] };

/** Every module bundled from `entry`, each with the import chain that reached it, and every chain that reaches the parser. */
function reach(entry: string): Reach {
  const modules = new Map<string, string[]>([[entry, [entry]]]);
  const violations: string[] = [];
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift()!;
    const chain = modules.get(file)!;
    const source = read(file);
    if (file !== entry && directive(source) === "server") continue;
    for (const specifier of specifiers(source)) {
      const label = (path: string) => relative(ROOT, path);
      if (PARSER_PACKAGE.test(specifier)) {
        violations.push([...chain.map(label), specifier].join(" → "));
        continue;
      }
      const target = resolveLocal(file, specifier);
      if (!target) continue;
      if (target === PARSER_MODULE) violations.push([...chain, target].map(label).join(" → "));
      if (!modules.has(target)) {
        modules.set(target, [...chain, target]);
        queue.push(target);
      }
    }
  }
  return { modules, violations };
}

const files = sourceFiles(SRC);
const clientEntries = files.filter((file) => directive(read(file)) === "client");

describe("phone metadata stays out of browser bundles", () => {
  it("finds the client components it guards", () => {
    expect(clientEntries.length).toBeGreaterThan(50);
    expect(clientEntries).toContain(join(SRC, "components", "EditableFollowUpAction.tsx"));
    expect(clientEntries).toContain(join(SRC, "components", "ContactImportWizardV2.tsx"));
  });

  it("follows the client graphs that bundle the parser-free phone helpers (Today and the import wizard)", () => {
    const today = reach(join(SRC, "components", "EditableFollowUpAction.tsx")).modules;
    expect(today.has(join(SRC, "lib", "phone-dial.ts"))).toBe(true);
    expect(today.has(join(SRC, "lib", "contact-input.ts"))).toBe(true);
    const wizard = reach(join(SRC, "components", "ContactImportWizardV2.tsx")).modules;
    expect(wizard.has(join(SRC, "lib", "contact-import-mapping.ts"))).toBe(true);
    expect(wizard.has(join(SRC, "lib", "contact-input.ts"))).toBe(true);
  });

  it("would report a module that reaches the parser (the check is not vacuous)", () => {
    // contact-actions is "use server": a client imports it only as action references. Walked as an
    // entry, its own graph reaches the parser, which is exactly what a client graph must never do.
    expect(reach(join(SRC, "lib", "contact-actions.ts")).violations.length).toBeGreaterThan(0);
    expect(reach(PARSER_MODULE).violations).toEqual([`${relative(ROOT, PARSER_MODULE)} → libphonenumber-js/min`]);
  });

  it("never reaches src/lib/phone-number.ts or libphonenumber-js from a \"use client\" file", () => {
    const violations = clientEntries.flatMap((entry) => reach(entry).violations);
    expect(violations).toEqual([]);
  });

  it("keeps src/lib/phone-number.ts the only importer of the package, with the min metadata", () => {
    const importers = files.filter((file) => specifiers(read(file)).some((specifier) => PARSER_PACKAGE.test(specifier)));
    expect(importers.map((file) => relative(ROOT, file))).toEqual(["src/lib/phone-number.ts"]);
    expect(specifiers(read(PARSER_MODULE)).filter((specifier) => PARSER_PACKAGE.test(specifier))).toEqual(["libphonenumber-js/min"]);
    for (const parserFree of ["contact-input.ts", "phone-dial.ts", "contact-import-mapping.ts"]) {
      expect(specifiers(read(join(SRC, "lib", parserFree))).filter((specifier) => specifier === "@/lib/phone-number" || PARSER_PACKAGE.test(specifier))).toEqual([]);
    }
  });
});
