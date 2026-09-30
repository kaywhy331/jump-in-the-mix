import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The Stripe library and its secret key are server-only (JITM-11 §2.50). src/lib/stripe-client.ts is the package's only
 * value importer; other modules may import its types, which are erased. This walks the import graph from every
 * "use client" file the way the bundler does (see tests/phone-client-bundle-guard.test.ts) and stops at "use server"
 * modules, which the client receives only as action references.
 */
const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const CLIENT_MODULE = join(SRC, "lib", "stripe-client.ts");
const PACKAGE = /^stripe(?:\/|$)/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (path === join(SRC, "generated")) return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|js|jsx|mjs)$/.test(name) && !/\.test\.(?:ts|tsx)$/.test(name) ? [path] : [];
  });
}
const read = (file: string) => readFileSync(file, "utf8");
function directive(source: string): "client" | "server" | null {
  const match = /^["']use (client|server)["']/.exec(source.replace(/^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, ""));
  return match ? (match[1] as "client" | "server") : null;
}
function specifiers(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/(?:^|[;\n])[ \t]*(import|export)\s+(type\s+)?([^;"'`]{0,2000}?)\s+from\s+["']([^"']+)["']/g)) if (!match[2]) found.push(match[4]);
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
function violations(entry: string): string[] {
  const chains = new Map<string, string[]>([[entry, [entry]]]), queue = [entry], found: string[] = [];
  while (queue.length) {
    const file = queue.shift()!, chain = chains.get(file)!, source = read(file);
    if (file !== entry && directive(source) === "server") continue;
    for (const specifier of specifiers(source)) {
      if (PACKAGE.test(specifier)) { found.push([...chain.map(path => relative(ROOT, path)), specifier].join(" → ")); continue; }
      const target = resolveLocal(file, specifier);
      if (!target || chains.has(target)) continue;
      chains.set(target, [...chain, target]); queue.push(target);
    }
  }
  return found;
}

const files = sourceFiles(SRC);

describe("the Stripe library stays on the server", () => {
  it("has one value importer, and the walk would notice it", () => {
    expect(files.filter(file => specifiers(read(file)).some(specifier => PACKAGE.test(specifier))).map(file => relative(ROOT, file))).toEqual(["src/lib/stripe-client.ts"]);
    expect(violations(CLIENT_MODULE)).toEqual(["src/lib/stripe-client.ts → stripe"]);
  });

  it("is never reached from a \"use client\" file", () => {
    const clients = files.filter(file => directive(read(file)) === "client");
    expect(clients.length).toBeGreaterThan(50);
    expect(clients.flatMap(violations)).toEqual([]);
  });
});
