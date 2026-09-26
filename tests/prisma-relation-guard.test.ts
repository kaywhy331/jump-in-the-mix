import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every foreign key lives in the Prisma schema as a relation (Release B, B4). Production applies the
 * hand-written migrations, while `prisma db push` (`npm run db:setup`) builds a database from the
 * schema alone; a foreign key that only a migration declares is missing from those databases, and
 * `prisma migrate dev` would propose dropping it. This guard reads prisma/*.prisma and every
 * migration, and checks:
 * 1. every column named workspaceId, userId, contactId, jumpId or actorUserId has a relation, unless
 *    it is listed below with the reason it has no foreign key;
 * 2. the listed columns really have no foreign key in any migration;
 * 3. every foreign key the migrations leave in place has a relation over the same column, to the
 *    same model, with the same delete rule.
 * tests/prisma-migration-residue.integration.test.ts proves the same against PostgreSQL with
 * `prisma migrate diff`.
 */

const SCOPE_COLUMNS = new Set(["workspaceId", "userId", "contactId", "jumpId", "actorUserId"]);

// Scope columns without a relation, each on purpose. Adding a foreign key to one of them means
// removing it from this list in the same change.
const WITHOUT_RELATION: Record<string, string> = {
  "AdminImpersonation.workspaceId": "support-view audit row with no foreign key; deleteAccountData deletes the views of the owned workspaces",
  "AdminImpersonation.actorUserId": "support-view audit row with no foreign key; deleteAccountData deletes the views the person started",
  "AdminMfaCredential.userId": "staff second factor keyed by user id with no foreign key; deleteAccountData deletes it",
  "AdminMfaSession.userId": "short-lived staff step-up session with no foreign key; deleteAccountData deletes it and expiry clears the rest",
  "SupportTicket.workspaceId": "no foreign key; deleteAccountData deletes the tickets of the owned workspaces and of the requester",
  "JumpAttempt.contactId": "copy of the Jump's contact; the row already cascades through jumpId and workspaceId",
  "FollowUpPushDelivery.workspaceId": "copy for filtering; the row already cascades through subscriptionId and jumpId",
  "MixStop.contactId": "no foreign key; contacts are archived, never deleted on their own, the row cascades through workspaceId and a merge copies it to the survivor",
  "JumpActionEvent.jumpId": "append-only log with no foreign key; Jumps are never deleted on their own and the row cascades through workspaceId",
  "JumpActionEvent.actorUserId": "append-only log; the actor id stays as an opaque reference",
  "WaitlistAudit.actorUserId": "staff audit log; the actor id stays as an opaque reference after the staff account is gone",
  "PlatformAuditEvent.actorUserId": "platform audit log; the actor id stays as an opaque reference after the staff account is gone",
  "SharedMixRevision.actorUserId": "immutable library history (a trigger rejects updates, so SET NULL could not apply); the actor id stays as an opaque reference",
  "SharedMixRelease.actorUserId": "immutable library history (a trigger rejects updates, so SET NULL could not apply); the actor id stays as an opaque reference",
  "SystemMixRevision.actorUserId": "immutable System Mix history (a trigger rejects updates, so SET NULL could not apply); the actor id stays as an opaque reference",
  "SystemMixRelease.actorUserId": "immutable System Mix history (a trigger rejects updates, so SET NULL could not apply); the actor id stays as an opaque reference"
};

const root = process.cwd();
type Relation = { model: string; field: string; target: string; fields: string[]; onDelete: string };
type Model = { name: string; file: string; scalars: Map<string, { optional: boolean }>; relations: Relation[] };
type ForeignKey = { table: string; name: string; columns: string[]; target: string; onDelete: string; migration: string };

function readModels(): Model[] {
  const models: Model[] = [];
  for (const file of readdirSync(join(root, "prisma")).filter(name => name.endsWith(".prisma")).sort()) {
    const text = readFileSync(join(root, "prisma", file), "utf8");
    for (const [, name, body] of text.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
      const model: Model = { name, file: `prisma/${file}`, scalars: new Map(), relations: [] };
      for (const raw of body.split("\n")) {
        const line = raw.replace(/\/\/.*$/, "").trim();
        if (!line || line.startsWith("@@")) continue;
        const [field, type] = line.split(/\s+/);
        const relation = line.match(/@relation\(([^)]*)\)/)?.[1];
        const fields = relation?.match(/fields:\s*\[([^\]]*)\]/)?.[1];
        if (relation && fields) {
          model.relations.push({ model: name, field, target: type.replace(/[?[\]]/g, ""), fields: fields.split(",").map(item => item.trim()), onDelete: relation.match(/onDelete:\s*(\w+)/)?.[1] ?? "" });
        } else if (!type.endsWith("[]")) {
          model.scalars.set(field, { optional: type.endsWith("?") });
        }
      }
      models.push(model);
    }
  }
  return models;
}

const ACTIONS = "CASCADE|SET NULL|SET DEFAULT|RESTRICT|NO ACTION";
// A table constraint, named or not; PostgreSQL names an unnamed one <table>_<columns>_fkey.
const CONSTRAINT = new RegExp(`(?:CONSTRAINT "(\\w+)" )?FOREIGN KEY \\(([^)]+)\\) REFERENCES "(\\w+)" ?\\([^)]+\\)((?: ON (?:DELETE|UPDATE) (?:${ACTIONS}))*)`, "g");
// A column definition that references another table inline; PostgreSQL names it <table>_<column>_fkey.
const INLINE = new RegExp(`"(\\w+)" [^,()"]*?REFERENCES "(\\w+)" ?\\([^)]+\\)((?: ON (?:DELETE|UPDATE) (?:${ACTIONS}))*)`, "g");
const deleteRule = (clauses: string) => clauses.match(new RegExp(`ON DELETE (${ACTIONS})`))?.[1] ?? "NO ACTION";

function readForeignKeys(): ForeignKey[] {
  const keys = new Map<string, ForeignKey>();
  const directory = join(root, "prisma", "migrations");
  for (const migration of readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()) {
    const sql = readFileSync(join(directory, migration, "migration.sql"), "utf8").replace(/--[^\n]*/g, "").replace(/\s+/g, " ");
    for (const statement of sql.split(";")) {
      for (const [, dropped] of statement.matchAll(/DROP TABLE (?:IF EXISTS )?"(\w+)"/g)) for (const [id, key] of keys) if (key.table === dropped) keys.delete(id);
      const table = statement.match(/(?:CREATE|ALTER) TABLE (?:IF NOT EXISTS )?(?:ONLY )?"(\w+)"/)?.[1];
      if (!table) continue;
      for (const [, named, list, target, clauses] of statement.matchAll(CONSTRAINT)) {
        const columns = list.split(",").map(column => column.trim().replace(/"/g, ""));
        const name = named ?? `${table}_${columns.join("_")}_fkey`;
        keys.set(`${table}.${name}`, { table, name, columns, target, onDelete: deleteRule(clauses), migration });
      }
      if (/^\s*CREATE TABLE/.test(statement)) for (const [, column, target, clauses] of statement.matchAll(INLINE)) {
        keys.set(`${table}.${table}_${column}_fkey`, { table, name: `${table}_${column}_fkey`, columns: [column], target, onDelete: deleteRule(clauses), migration });
      }
      for (const [, name] of statement.matchAll(/DROP CONSTRAINT (?:IF EXISTS )?"(\w+)"/g)) keys.delete(`${table}.${name}`);
      for (const [, column] of statement.matchAll(/DROP COLUMN (?:IF EXISTS )?"(\w+)"/g)) for (const [id, key] of keys) if (key.table === table && key.columns.includes(column)) keys.delete(id);
    }
  }
  return [...keys.values()];
}

const models = readModels();
const byName = new Map(models.map(model => [model.name, model]));
const foreignKeys = readForeignKeys();
const PRISMA_RULE: Record<string, string> = { Cascade: "CASCADE", SetNull: "SET NULL", SetDefault: "SET DEFAULT", Restrict: "RESTRICT", NoAction: "NO ACTION" };
// Prisma's default when a relation names no onDelete: SET NULL for an optional scalar, RESTRICT otherwise.
function relationRule(relation: Relation): string {
  if (relation.onDelete) return PRISMA_RULE[relation.onDelete] ?? relation.onDelete;
  const optional = relation.fields.every(field => byName.get(relation.model)?.scalars.get(field)?.optional);
  return optional ? "SET NULL" : "RESTRICT";
}

describe("Prisma relations for every foreign key", () => {
  it("reads the schema and the migrations it depends on", () => {
    expect(models.length).toBeGreaterThan(90);
    expect(foreignKeys.length).toBeGreaterThan(120);
    // Hand-written foreign keys: inline CREATE TABLE constraints, a lower-case column reference, and one dropped with its column.
    expect(foreignKeys.find(key => key.name === "AutomatedDelivery_jumpId_fkey")).toMatchObject({ table: "AutomatedDelivery", columns: ["jumpId"], target: "Jump", onDelete: "CASCADE" });
    expect(foreignKeys.find(key => key.name === "ContactGroupState_workspaceId_fkey")).toMatchObject({ target: "Workspace", onDelete: "CASCADE" });
    expect(foreignKeys.find(key => key.name === "WorkspaceMarketingPreference_workspaceId_fkey")).toMatchObject({ target: "Workspace", onDelete: "CASCADE" });
    expect(foreignKeys.find(key => key.name === "SharedMixRevision_sharedMixId_fkey")).toMatchObject({ target: "SharedMix", onDelete: "CASCADE" });
    expect(foreignKeys.some(key => key.table === "SharedMix" && key.columns.includes("publisherWorkspaceId"))).toBe(false);
  });

  it("gives every workspace, user, contact, Jump and actor column a relation unless it is listed", () => {
    const missing = models.flatMap(model => [...model.scalars.keys()]
      .filter(column => SCOPE_COLUMNS.has(column) && !model.relations.some(relation => relation.fields.includes(column)))
      .map(column => `${model.name}.${column}`))
      .filter(column => !(column in WITHOUT_RELATION));
    expect(missing, "Scope columns without a relation: add the relation (and its migration), or list the column with its reason").toEqual([]);
  });

  it("lists only columns that exist, have no relation and have no foreign key", () => {
    const stale = Object.keys(WITHOUT_RELATION).filter(entry => {
      const [name, column] = entry.split(".");
      const model = byName.get(name);
      return !model?.scalars.has(column) || model.relations.some(relation => relation.fields.includes(column));
    });
    expect(stale, "Listed columns that no longer exist or now have a relation; remove them from the list").toEqual([]);
    const withKey = Object.keys(WITHOUT_RELATION).filter(entry => foreignKeys.some(key => `${key.table}.${key.columns.join(",")}` === entry));
    expect(withKey, "Listed columns that a migration gives a foreign key; add the relation instead").toEqual([]);
  });

  it("matches every migration foreign key with a relation on the same column, target and delete rule", () => {
    const unmatched = foreignKeys.flatMap(key => {
      const relation = byName.get(key.table)?.relations.find(item => item.fields.join(",") === key.columns.join(","));
      if (!relation) return [`${key.name}: no relation on ${key.table}.${key.columns.join(",")} (${key.migration})`];
      if (relation.target !== key.target) return [`${key.name}: the relation points to ${relation.target}, the foreign key to ${key.target}`];
      if (relationRule(relation) !== key.onDelete) return [`${key.name}: the relation deletes with ${relationRule(relation)}, the foreign key with ${key.onDelete}`];
      return [];
    });
    expect(unmatched, "Foreign keys the schema does not describe").toEqual([]);
  });

  it("creates a foreign key in the migrations for every relation", () => {
    const missing = models.flatMap(model => model.relations
      .filter(relation => !foreignKeys.some(key => key.table === model.name && key.columns.join(",") === relation.fields.join(",")))
      .map(relation => `${model.name}.${relation.field} (${relation.fields.join(", ")} -> ${relation.target})`));
    expect(missing, "Relations with no foreign key in any migration; add the migration").toEqual([]);
  });
});
