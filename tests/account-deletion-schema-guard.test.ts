import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Account deletion relies on `workspace.deleteMany` and `user.delete` cascading through foreign
 * keys (src/lib/account-deletion.ts). A table that stores a workspaceId, userId or contactId with no
 * ON DELETE CASCADE path back to Workspace or User keeps that person's rows after the promised
 * deletion (audit F1, 2026-09-24). This guard reads every model in prisma/*.prisma and every foreign
 * key in prisma/migrations (Prisma relations, hand-written `ALTER TABLE ... ADD CONSTRAINT` and
 * inline `CREATE TABLE ... CONSTRAINT` clauses) and fails when such a table exists unless it is
 * listed below.
 *
 * Two cascade sources are tracked because they differ today: several tables cascade only through
 * hand-written migration foreign keys the schema does not declare, so a database built from the
 * schema alone (`prisma db push`, as `npm run db:setup` does) has no cascade for them. A listed
 * table is "stale" only once the schema itself cascades it.
 *
 * How to fix a failure, in order of preference:
 * 1. Give the model `@relation(fields: [workspaceId], references: [id], onDelete: Cascade)` (plus
 *    the migration) so every database removes it.
 * 2. Delete it explicitly in deleteAccountData and add it to EXPLICITLY_DELETED.
 * 3. Only for audit or staff records that must outlive the account, add it to RETAINED with the
 *    reason; those rows must hold nothing personal beyond an opaque id.
 */

// Tables deleteAccountData removes itself. Each must be referenced as `tx.<model>.` in
// src/lib/account-deletion.ts; the last test checks that.
const EXPLICITLY_DELETED: Record<string, string> = {
  // No cascade anywhere.
  AdminImpersonation: "support views that involve the account or its workspaces (relations are SetNull only)",
  AdminMfaCredential: "the account's own passkeys and authenticator secrets",
  AdminMfaSession: "the account's own step-up sessions",
  SupportTicket: "tickets the person opened or that belong to the owned workspaces (assignee relation is SetNull)",
  // Cascade only through hand-written migration foreign keys (20260722013000, 20260904170000,
  // 20260904190000); deleted here as well so schema-built databases behave the same.
  AutomatedDelivery: "automatic-sending receipts of the owned workspaces",
  AutomationPreference: "automatic-sending settings of the owned workspaces",
  ContactImportBatch: "import payloads (names, emails, phones, notes) of the owned workspaces",
  NotificationDelivery: "digest and push receipts of the owned workspaces and the person",
  NotificationPreference: "digest and push settings of the owned workspaces and the person",
  PushSubscription: "device endpoints and keys of the owned workspaces and the person",
  ReviewRequest: "customer ratings and feedback of the owned workspaces"
};

// Audit or staff tables whose rows deliberately outlive the account. None today: every audit and
// staff table that names a user either cascades through a relation or is deleted above.
const RETAINED: Record<string, string> = {};

const OWNER_ROOTS = new Set(["Workspace", "User"]);
const SCOPE_KEYS = new Set(["workspaceId", "userId", "contactId"]);
const FOREIGN_KEY = /CONSTRAINT "(\w+)" FOREIGN KEY \("[^"]+"\) REFERENCES "(\w+)" ?\("?\w+"?\)((?: ON (?:DELETE|UPDATE) (?:CASCADE|SET NULL|SET DEFAULT|RESTRICT|NO ACTION))*)/g;
const STATEMENT_TABLE = /(?:CREATE|ALTER) TABLE (?:IF NOT EXISTS )?"(\w+)"/;
const root = process.cwd();

type Model = { name: string; file: string; keys: string[] };
type Cascades = Map<string, Set<string>>;

function addCascade(cascades: Cascades, from: string, to: string): void {
  cascades.set(from, (cascades.get(from) ?? new Set()).add(to));
}

function parseSchema(): { models: Model[]; cascades: Cascades } {
  const models: Model[] = [];
  const cascades: Cascades = new Map();
  for (const file of readdirSync(join(root, "prisma")).filter(name => name.endsWith(".prisma")).sort()) {
    const text = readFileSync(join(root, "prisma", file), "utf8");
    for (const match of text.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
      const [, name, body] = match;
      const keys: string[] = [];
      for (const raw of body.split("\n")) {
        const line = raw.replace(/\/\/.*$/, "").trim();
        if (!line || line.startsWith("@@")) continue;
        const [field, type] = line.split(/\s+/);
        if (SCOPE_KEYS.has(field)) keys.push(field);
        const relation = line.match(/@relation\(([^)]*)\)/);
        if (relation && /fields:\s*\[/.test(relation[1]) && /onDelete:\s*Cascade\b/.test(relation[1])) {
          addCascade(cascades, name, type.replace(/[?[\]]/g, ""));
        }
      }
      models.push({ name, file: `prisma/${file}`, keys });
    }
  }
  return { models, cascades };
}

function parseMigrations(): Cascades {
  const constraints = new Map<string, { table: string; target: string; cascade: boolean }>();
  const directory = join(root, "prisma", "migrations");
  const names = readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  for (const name of names) {
    const sql = readFileSync(join(directory, name, "migration.sql"), "utf8").replace(/\s+/g, " ");
    for (const statement of sql.split(";")) {
      const dropped = statement.match(/DROP TABLE (?:IF EXISTS )?"(\w+)"/)?.[1];
      if (dropped) for (const key of [...constraints.keys()]) if (key.startsWith(`${dropped}.`)) constraints.delete(key);
      const table = statement.match(STATEMENT_TABLE)?.[1];
      if (!table) continue;
      for (const match of statement.matchAll(FOREIGN_KEY)) {
        constraints.set(`${table}.${match[1]}`, { table, target: match[2], cascade: /ON DELETE CASCADE/.test(match[3]) });
      }
      for (const match of statement.matchAll(/DROP CONSTRAINT (?:IF EXISTS )?"(\w+)"/g)) constraints.delete(`${table}.${match[1]}`);
    }
  }
  const cascades: Cascades = new Map();
  for (const { table, target, cascade } of constraints.values()) if (cascade) addCascade(cascades, table, target);
  return cascades;
}

function reachesOwner(name: string, cascades: Cascades, seen = new Set<string>()): boolean {
  if (OWNER_ROOTS.has(name)) return true;
  if (seen.has(name)) return false;
  seen.add(name);
  return [...(cascades.get(name) ?? [])].some(target => reachesOwner(target, cascades, seen));
}

const { models, cascades: schemaCascades } = parseSchema();
const migrationCascades = parseMigrations();
const databaseCascades: Cascades = new Map(schemaCascades);
for (const [table, targets] of migrationCascades) for (const target of targets) addCascade(databaseCascades, table, target);

const scoped = models.filter(model => model.keys.length);
const orphaned = scoped.filter(model => !reachesOwner(model.name, databaseCascades));
const listed = [...Object.keys(EXPLICITLY_DELETED), ...Object.keys(RETAINED)];
const clientName = (model: string) => model[0].toLowerCase() + model.slice(1);

describe("account deletion schema guard", () => {
  it("reads both cascade sources it depends on", () => {
    expect(scoped.length).toBeGreaterThan(40);
    expect([...(schemaCascades.get("Contact") ?? [])]).toContain("Workspace");
    // Hand-written ALTER TABLE with an unquoted column: REFERENCES "Workspace"(id) ... ON DELETE CASCADE.
    expect([...(migrationCascades.get("ContactGroupState") ?? [])]).toContain("Workspace");
    // Inline CREATE TABLE constraints.
    expect([...(migrationCascades.get("AutomatedDelivery") ?? [])].sort()).toEqual(["Jump", "Workspace"]);
    expect(reachesOwner("AutomatedDelivery", schemaCascades)).toBe(false);
    expect(reachesOwner("AutomatedDelivery", databaseCascades)).toBe(true);
    expect(reachesOwner("SupportTicket", databaseCascades)).toBe(false);
  });

  it("every workspace-, user- or contact-scoped table cascades from its owner or is listed", () => {
    const unexpected = orphaned.filter(model => !listed.includes(model.name)).map(model => `${model.name} (${model.file}: ${model.keys.join(", ")})`);
    expect(unexpected, "Tables that would survive account deletion; see the fix order at the top of this file").toEqual([]);
  });

  it("lists only tables the schema does not cascade", () => {
    const known = new Set(models.map(model => model.name));
    const stale = listed.filter(name => !known.has(name) || reachesOwner(name, schemaCascades));
    expect(stale, "Listed tables that the schema now cascades (or that no longer exist); remove them from the allowlist").toEqual([]);
  });

  it("deleteAccountData removes every explicitly listed table and handles marketplace reporters by name", () => {
    const source = readFileSync(join(root, "src/lib/account-deletion.ts"), "utf8");
    const missing = Object.keys(EXPLICITLY_DELETED).filter(model => !source.includes(`tx.${clientName(model)}.`));
    expect(missing, "Listed as explicitly deleted but not referenced in account-deletion.ts").toEqual([]);
    // MarketplaceReport scopes its rows as reporterUserId/reporterWorkspaceId, names this guard does
    // not scan; the reporter columns are cleared or the rows deleted by name instead.
    expect(source).toContain("reporterUserId: `deleted:${report.id}`");
    expect(source).toContain("reporterWorkspaceId: `deleted:${report.id}`");
  });
});
