import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import typescript from "typescript";
import { describe, expect, it } from "vitest";

// vitest looks an imported binding up again on every use; one local binding makes the whole-tree scan ~3x faster.
// Types are still named through the import (typescript.Node).
const ts = typescript;

/*
 * C9 guard. getCurrentSession and displayPreferencesForUser are wrapped in React's cache(), so during one
 * server render the layout, the page and their components receive the same returned object. vitest runs
 * without the react-server condition (cache() passes straight through here), so this suite reads the source:
 * - both functions are React cache() wrappers, and neither is cached across requests;
 * - nothing writes into the shared objects (sharedWrites below);
 * - no page, layout or server component writes a Session or UserPreference row, which the cached read would
 *   then show stale for the rest of that render;
 * - the recovery-hold check stays uncached: the runbook promises that a new hold takes effect at once.
 */

const read = (path: string) => readFileSync(path, "utf8");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "generated" ? [] : files(path);
    return /\.tsx?$/.test(name) && !/\.(test|d)\.tsx?$/.test(name) ? [path] : [];
  });
}
const parse = (path: string, text = read(path)) =>
  ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
function directives(file: typescript.SourceFile): string[] {
  const found: string[] = [];
  for (const statement of file.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
    found.push(statement.expression.text);
  }
  return found;
}

/*
 * Taint. SHARED is the shared object or anything reached from it: a property chain leads only to a nested
 * shared object or to a primitive, and nothing can be written into a primitive. A Members record is a new
 * object that carries shared values, such as what requireWorkspace() returns: writing its own properties is
 * harmless, writing into one of its SHARED members is not. "*" stands for every member (spreads, copies).
 */
const SHARED = "shared";
interface Members { [member: string]: Taint }
type Taint = typeof SHARED | Members | null;

function merge(a: Taint, b: Taint, depth = 0): Taint {
  if (!a) return b;
  if (!b || a === b) return a;
  if (a === SHARED || b === SHARED || depth > 4) return SHARED;
  const merged: Members = { ...a };
  for (const [key, value] of Object.entries(b)) merged[key] = merge(Object.hasOwn(merged, key) ? merged[key] : null, value, depth + 1);
  return merged;
}
function member(taint: Taint, key?: string): Taint {
  if (!taint || taint === SHARED) return taint;
  if (key === undefined) return Object.values(taint).reduce<Taint>((all, value) => merge(all, value), null);
  return Object.hasOwn(taint, key) ? taint[key] : Object.hasOwn(taint, "*") ? taint["*"] : null;
}
const wrap = (key: string | undefined, taint: Taint): Taint => taint ? { [key ?? "*"]: taint } : null;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const strip = (expression: typescript.Expression): typescript.Expression => {
  while (ts.isParenthesizedExpression(expression) || ts.isAwaitExpression(expression) || ts.isNonNullExpression(expression)
    || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression) || ts.isTypeAssertionExpression(expression)) expression = expression.expression;
  return expression;
};
const keyOf = (name: typescript.Node): string | undefined =>
  ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name) ? name.text : undefined;

// Callbacks whose parameter receives an element of the receiver, and calls that return elements or copies.
const ELEMENT_CALLBACKS = new Map([["forEach", 0], ["map", 0], ["flatMap", 0], ["filter", 0], ["find", 0], ["findLast", 0], ["findIndex", 0], ["findLastIndex", 0], ["some", 0], ["every", 0], ["reduce", 1], ["reduceRight", 1]]);
const ELEMENT_RESULTS = new Set(["find", "findLast", "at"]);
const COPY_RESULTS = new Set(["filter", "slice", "concat", "flat", "toSorted", "toReversed"]);
const MUTATING_METHODS = /^(push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin|set|add|delete|clear|setTime|set(UTC)?(FullYear|Month|Date|Hours|Minutes|Seconds|Milliseconds))$/;
const MUTATING_FUNCTIONS = new Set(["Object.assign", "Object.defineProperty", "Object.defineProperties", "Object.setPrototypeOf", "Reflect.set", "Reflect.defineProperty", "Reflect.deleteProperty", "Reflect.setPrototypeOf"]);

/**
 * Writes into the objects that the `seeds` functions return, and into their parts, across the given modules.
 * Flow-insensitive and name-based: a function's return value, and each parameter of a function or component,
 * take the taint of every return, call and JSX use of that name, so helpers that hand the session on
 * (requireSession, requireWorkspace, …), props and arguments are all followed. Client modules receive
 * serialized copies and are skipped.
 */
function sharedWrites(sources: { path: string; text: string }[], seeds: string[]) {
  const modules = sources.map(({ path, text }) => parse(path, text)).filter(file => !directives(file).includes("use client"));
  const returns = new Map<string, Taint>(seeds.map(name => [name, SHARED]));
  const params = new Map<string, Taint[]>();
  const declared = new Map<typescript.Node, Set<string>>();
  const bindings = new Map<typescript.Node, Map<string, Taint>>();
  const defined = new Set<string>(); // functions and components defined in these modules
  const mentioned = new Map<typescript.SourceFile, Set<string>>(); // identifiers each module uses
  let changed = false;

  const isScope = (node: typescript.Node) => ts.isSourceFile(node) || ts.isFunctionLike(node) || ts.isBlock(node) || ts.isForStatement(node)
    || ts.isForInStatement(node) || ts.isForOfStatement(node) || ts.isCatchClause(node) || ts.isCaseBlock(node) || ts.isModuleBlock(node);
  const scopeOf = (node: typescript.Node) => { let scope = node.parent; while (!isScope(scope)) scope = scope.parent; return scope; };
  const names = (name: typescript.BindingName): string[] => ts.isIdentifier(name) ? [name.text]
    : (name.elements as readonly typescript.ArrayBindingElement[]).flatMap(element => ts.isOmittedExpression(element) ? [] : names(element.name));
  const declare = (scope: typescript.Node, list: string[]) => { const set = declared.get(scope) ?? new Set<string>(); list.forEach(name => set.add(name)); declared.set(scope, set); };
  const declaringScope = (name: string, from: typescript.Node) => { for (let node = from.parent; node; node = node.parent) if (declared.get(node)?.has(name)) return node; };
  const lookup = (name: string, from: typescript.Node): Taint => { const scope = declaringScope(name, from); return scope ? bindings.get(scope)?.get(name) ?? null : null; };

  const bindName = (scope: typescript.Node, name: string, taint: Taint) => {
    if (!taint) return;
    const scoped = bindings.get(scope) ?? new Map<string, Taint>();
    bindings.set(scope, scoped);
    const next = merge(scoped.get(name) ?? null, taint);
    if (!same(next, scoped.get(name) ?? null)) { scoped.set(name, next); changed = true; }
  };
  const bindPattern = (scope: typescript.Node, name: typescript.BindingName, taint: Taint): void => {
    if (!taint) return;
    if (ts.isIdentifier(name)) return bindName(scope, name.text, taint);
    (name.elements as readonly typescript.ArrayBindingElement[]).forEach((element, index) => {
      if (ts.isOmittedExpression(element)) return;
      if (element.dotDotDotToken) return bindPattern(scope, element.name, taint === SHARED ? { "*": SHARED } : taint);
      const key = ts.isArrayBindingPattern(name) ? String(index) : element.propertyName ? keyOf(element.propertyName) : keyOf(element.name);
      bindPattern(scope, element.name, member(taint, key));
    });
  };
  const recordReturn = (name: string, taint: Taint) => {
    const next = merge(returns.get(name) ?? null, taint);
    if (!same(next, returns.get(name) ?? null)) { returns.set(name, next); changed = true; }
  };
  const recordParams = (name: string, taints: Taint[]) => {
    if (!defined.has(name) || !taints.some(Boolean)) return;
    const current = params.get(name) ?? [];
    const next = Array.from({ length: Math.max(current.length, taints.length) }, (_, index) => merge(current[index] ?? null, taints[index] ?? null));
    if (!same(next, current)) { params.set(name, next); changed = true; }
  };

  const taintOf = (expression: typescript.Expression | undefined): Taint => {
    if (!expression) return null;
    const node = strip(expression);
    if (ts.isIdentifier(node)) return lookup(node.text, node);
    if (ts.isPropertyAccessExpression(node)) return member(taintOf(node.expression), node.name.text);
    if (ts.isElementAccessExpression(node)) return member(taintOf(node.expression), keyOf(node.argumentExpression));
    if (ts.isCallExpression(node)) {
      const callee = strip(node.expression);
      if (ts.isIdentifier(callee)) return returns.get(callee.text) ?? null;
      if (!ts.isPropertyAccessExpression(callee)) return null;
      if (callee.getText() === "Promise.all") return taintOf(node.arguments[0]);
      if (ELEMENT_RESULTS.has(callee.name.text)) return member(taintOf(callee.expression));
      if (COPY_RESULTS.has(callee.name.text)) return wrap("*", member(taintOf(callee.expression)));
      return null;
    }
    if (ts.isBinaryExpression(node)) {
      const operator = node.operatorToken.kind;
      if (operator === ts.SyntaxKind.QuestionQuestionToken || operator === ts.SyntaxKind.BarBarToken || operator === ts.SyntaxKind.AmpersandAmpersandToken) return merge(taintOf(node.left), taintOf(node.right));
      return operator === ts.SyntaxKind.CommaToken || operator === ts.SyntaxKind.EqualsToken ? taintOf(node.right) : null;
    }
    if (ts.isConditionalExpression(node)) return merge(taintOf(node.whenTrue), taintOf(node.whenFalse));
    if (ts.isObjectLiteralExpression(node)) {
      return node.properties.reduce<Taint>((members, property) => merge(members,
        ts.isShorthandPropertyAssignment(property) ? wrap(property.name.text, lookup(property.name.text, property))
          : ts.isPropertyAssignment(property) ? wrap(keyOf(property.name), taintOf(property.initializer))
            : ts.isSpreadAssignment(property) ? wrap("*", member(taintOf(property.expression))) : null), null);
    }
    if (ts.isArrayLiteralExpression(node)) {
      return node.elements.reduce<Taint>((members, element, index) => merge(members,
        ts.isSpreadElement(element) ? wrap("*", member(taintOf(element.expression))) : wrap(String(index), taintOf(element))), null);
    }
    return null;
  };

  type Definition = typescript.FunctionDeclaration | typescript.FunctionExpression | typescript.ArrowFunction;
  const nameOf = (fn: Definition): string | undefined => {
    if (ts.isFunctionDeclaration(fn)) return fn.name?.text;
    let node: typescript.Node = fn;
    // export const getCurrentSession = cache(async function getCurrentSession() { … })
    while (ts.isParenthesizedExpression(node.parent) || (ts.isCallExpression(node.parent) && node.parent.arguments.some(argument => argument === node) && strip(node.parent.expression).getText() === "cache")) node = node.parent;
    if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) return node.parent.name.text;
    return ts.isFunctionExpression(fn) ? fn.name?.text : undefined;
  };
  const returnedBy = (fn: Definition): typescript.Expression[] => {
    if (!fn.body) return [];
    if (!ts.isBlock(fn.body)) return [fn.body];
    const found: typescript.Expression[] = [];
    const visit = (node: typescript.Node) => { if (ts.isFunctionLike(node)) return; if (ts.isReturnStatement(node) && node.expression) found.push(node.expression); ts.forEachChild(node, visit); };
    ts.forEachChild(fn.body, visit);
    return found;
  };
  const targets = (left: typescript.Expression): typescript.Expression[] => {
    const node = strip(left);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) return targets(node.left);
    if (ts.isObjectLiteralExpression(node)) return node.properties.flatMap(property => ts.isPropertyAssignment(property) ? targets(property.initializer) : ts.isSpreadAssignment(property) ? targets(property.expression) : []);
    if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(element => targets(ts.isSpreadElement(element) ? element.expression : element));
    return [node];
  };
  const writesIntoShared = (target: typescript.Expression) => {
    const node = strip(target);
    return (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) && taintOf(node.expression) === SHARED;
  };

  const visitModule = (file: typescript.SourceFile, onWrite?: (node: typescript.Node) => void) => {
    const visit = (node: typescript.Node) => {
      if (ts.isVariableDeclaration(node) && node.initializer) bindPattern(scopeOf(node), node.name, taintOf(node.initializer));
      if (ts.isForOfStatement(node) && ts.isVariableDeclarationList(node.initializer) && node.initializer.declarations[0]) {
        bindPattern(node, node.initializer.declarations[0].name, member(taintOf(node.expression)));
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left)) {
        const scope = declaringScope(node.left.text, node.left);
        if (scope) bindName(scope, node.left.text, taintOf(node.right));
      }
      if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
        const name = nameOf(node), parameters = node.parameters;
        if (name) {
          params.get(name)?.forEach((taint, index) => { if (parameters[index]) bindPattern(node, parameters[index].name, taint); });
          for (const expression of returnedBy(node)) recordReturn(name, taintOf(expression));
        }
      }
      if (ts.isCallExpression(node)) {
        const callee = strip(node.expression);
        if (ts.isIdentifier(callee)) recordParams(callee.text, node.arguments.map(argument => taintOf(argument)));
        const index = ts.isPropertyAccessExpression(callee) ? ELEMENT_CALLBACKS.get(callee.name.text) : undefined;
        const callback = node.arguments[0];
        if (index !== undefined && ts.isPropertyAccessExpression(callee) && callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) && callback.parameters[index]) {
          bindPattern(callback, callback.parameters[index].name, member(taintOf(callee.expression)));
        }
      }
      if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
        const tag = ts.isPropertyAccessExpression(node.tagName) ? node.tagName.name.text : node.tagName.getText();
        if (/^[A-Z]/.test(tag)) {
          recordParams(tag, [node.attributes.properties.reduce<Taint>((props, attribute) => merge(props,
            ts.isJsxSpreadAttribute(attribute) ? wrap("*", member(taintOf(attribute.expression)))
              : attribute.initializer && ts.isJsxExpression(attribute.initializer) ? wrap(attribute.name.getText(), taintOf(attribute.initializer.expression)) : null), null)]);
        }
      }
      if (onWrite) {
        if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment && targets(node.left).some(writesIntoShared)) onWrite(node);
        if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) && (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken) && writesIntoShared(node.operand)) onWrite(node);
        if (ts.isDeleteExpression(node) && writesIntoShared(node.expression)) onWrite(node);
        if (ts.isCallExpression(node)) {
          const callee = strip(node.expression);
          if (ts.isPropertyAccessExpression(callee) && MUTATING_METHODS.test(callee.name.text) && taintOf(callee.expression) === SHARED) onWrite(node);
          if (MUTATING_FUNCTIONS.has(callee.getText()) && taintOf(node.arguments[0]) === SHARED) onWrite(node);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  };

  for (const file of modules) {
    const identifiers = new Set<string>();
    const visit = (node: typescript.Node) => {
      if (ts.isIdentifier(node)) identifiers.add(node.text);
      if (ts.isVariableDeclaration(node) || ts.isParameter(node)) declare(scopeOf(node), names(node.name));
      else if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) declare(scopeOf(node), [node.name.text]);
      else if (ts.isImportSpecifier(node) || ts.isNamespaceImport(node) || (ts.isImportClause(node) && node.name)) declare(file, [node.name!.text]);
      if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) { const name = nameOf(node); if (name) defined.add(name); }
      ts.forEachChild(node, visit);
    };
    visit(file);
    mentioned.set(file, identifiers);
  }
  // Taint enters a module only through a name that carries it: a call to a function whose result is shared,
  // or the definition of a function or component that receives shared arguments. Other modules are skipped.
  const carriesTaint = (file: typescript.SourceFile) => [...returns.keys(), ...params.keys()].some(name => mentioned.get(file)!.has(name));
  do { changed = false; for (const file of modules) if (carriesTaint(file)) visitModule(file); } while (changed);
  const writes: string[] = [];
  for (const file of modules) if (carriesTaint(file)) visitModule(file, node => writes.push(`${file.fileName}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}`));
  return { writes, returns };
}

const SEEDS = ["getCurrentSession", "displayPreferencesForUser"];

// Every line marked "shared write" must be reported, and nothing else.
const FIXTURE = [
  {
    path: "fixture/auth.ts",
    text: [
      'import { cache } from "react";',
      "export const getCurrentSession = cache(async function getCurrentSession() {",
      '  const session = await prisma.session.findUnique({ where: { tokenHash: "hash" }, include: { user: true } });',
      "  if (!session) return null;",
      "  session.expiresAt = new Date(); // the function still builds its own result",
      "  return { ...session, authUser: session.user, impersonation: null };",
      "});",
      "export async function requireWorkspace() {",
      "  const session = await getCurrentSession();",
      '  if (!session) throw new Error("signed out");',
      "  const membership = session.user.memberships[0];",
      "  return { session, user: session.user, membership, workspace: membership.workspace };",
      "}"
    ].join("\n")
  },
  {
    path: "fixture/helpers.ts",
    text: [
      'import { requireWorkspace } from "./auth";',
      "export async function workspaceContext() {",
      "  const context = await requireWorkspace();",
      "  return context;",
      "}",
      "export function withDefaultZone(preferences: { timeZone: string }) {",
      '  preferences.timeZone ||= "UTC"; // shared write',
      "  return preferences;",
      "}",
      "export function copied(preferences: { timeZone: string }) {",
      "  const copy = { ...preferences };",
      '  copy.timeZone = "UTC";',
      "  return copy;",
      "}"
    ].join("\n")
  },
  {
    path: "fixture/page.tsx",
    text: [
      'import { getCurrentSession } from "./auth";',
      'import { displayPreferencesForUser } from "@/lib/display-preferences";',
      'import { copied, withDefaultZone, workspaceContext } from "./helpers";',
      "export default async function Page() {",
      "  const session = await getCurrentSession();",
      "  if (!session) return null;",
      '  session.user.name = "Renamed"; // shared write',
      "  session.expiresAt.setHours(0); // shared write",
      "  const { user, workspace } = await workspaceContext();",
      "  const profile = workspace.profile;",
      '  profile!.companyName = "Renamed"; // shared write',
      "  user.memberships.sort(() => 0); // shared write",
      "  delete (user as { email?: string }).email; // shared write",
      '  user.memberships.forEach(membership => { membership.role = "OWNER"; }); // shared write',
      "  for (const membership of session.user.memberships) membership.createdAt = new Date(); // shared write",
      "  const [display, count] = await Promise.all([displayPreferencesForUser(user.id), Promise.resolve(1)]);",
      '  Object.assign(display, { locale: "en-GB" }); // shared write',
      "  withDefaultZone(display);",
      "  const context = await workspaceContext();",
      '  context.user.email = "someone@example.com"; // shared write',
      '  context.note = "the returned record is new on every call";',
      "  const own = copied(display);",
      '  own.locale = "en-GB";',
      '  const local = { ...display, locale: "en-GB" };',
      '  local.timeZone = "UTC";',
      '  const people = [{ name: "a" }];',
      '  people.forEach(user => { user.name = "b"; });',
      "  return <Header user={user} count={count} />;",
      "}",
      "function Header({ user, count }: { user: { name: string }; count: number }) {",
      "  user.name = user.name.trim(); // shared write",
      "  return <p>{count}</p>;",
      "}"
    ].join("\n")
  }
];

describe("one session and preference read per render (C9)", () => {
  it("wraps getCurrentSession and displayPreferencesForUser in React's per-render cache()", () => {
    const cachedExports = (path: string) => {
      const file = parse(path);
      const local = new Set<string>();
      for (const statement of file.statements) {
        const bindings = ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === "react" ? statement.importClause?.namedBindings : undefined;
        if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) if ((element.propertyName ?? element.name).text === "cache") local.add(element.name.text);
      }
      return file.statements.flatMap(statement => ts.isVariableStatement(statement) && statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
        ? statement.declarationList.declarations.flatMap(declaration => {
          const initializer = declaration.initializer;
          return ts.isIdentifier(declaration.name) && initializer && ts.isCallExpression(initializer) && ts.isIdentifier(initializer.expression) && local.has(initializer.expression.text) ? [declaration.name.text] : [];
        })
        : []);
    };
    expect(cachedExports("src/lib/auth.ts")).toContain("getCurrentSession");
    expect(cachedExports("src/lib/display-preferences.ts")).toContain("displayPreferencesForUser");
    // A cache that outlives the request would hand one person's session or preferences to another request.
    for (const path of ["src/lib/auth.ts", "src/lib/display-preferences.ts"]) expect(read(path), path).not.toMatch(/next\/cache|unstable_cache|["']use cache/);
  });

  it("reports every kind of write into the shared objects, and only those", () => {
    const expected = FIXTURE.flatMap(({ path, text }) => text.split("\n").flatMap((line, index) => line.includes("// shared write") ? [`${path}:${index + 1}`] : []));
    const { writes } = sharedWrites(FIXTURE, SEEDS);
    expect(expected).toHaveLength(11);
    expect([...writes].sort()).toEqual([...expected].sort());
  });

  it("finds no write into the shared session or preference objects anywhere in src", () => {
    const { writes, returns } = sharedWrites(files("src").map(path => ({ path, text: read(path) })), SEEDS);
    // The scan follows the helpers that hand the session on, so their callers are covered too.
    for (const helper of ["requireSession", "requireWorkspace", "requirePlatformAdminIdentity", "requirePlatformAdmin", "requireWritableWorkspace"]) {
      expect(returns.get(helper), helper).toBeTruthy();
    }
    expect(writes).toEqual([]);
  }, 120_000);

  it("keeps Session and UserPreference writes out of pages, layouts and server components", () => {
    const renders = files("src").filter(path => /^src\/app\/(.*\/)?(page|layout|template|default|not-found|error|global-error|loading)\.tsx$/.test(path)
      || (path.startsWith("src/components/") && !directives(parse(path)).includes("use client")));
    const write = /\b(session|userPreference)\.(create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)\s*\(|(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"(Session|UserPreference)"/i;
    expect(renders.length).toBeGreaterThan(50);
    expect(renders.filter(path => write.test(read(path)))).toEqual([]);
  });

  it("leaves the recovery-hold check uncached", () => {
    for (const path of ["src/lib/recovery-hold.ts", "src/lib/recovery-boundary-client.ts", "src/app/api/health/recovery-boundary/route.ts"]) {
      expect(read(path), path).not.toMatch(/from ["']react["']|\bcache\(|next\/cache|unstable_cache|["']use cache|export const (revalidate|dynamic)\b/);
    }
    expect(read("src/lib/recovery-boundary-client.ts")).toContain('cache: "no-store"');
  });
});
