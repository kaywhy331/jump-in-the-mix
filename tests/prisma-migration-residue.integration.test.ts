import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// What `prisma migrate diff` reports between the migrations (what production runs) and the schema
// (what `prisma db push` builds). Since Release B every foreign key is in the schema, so the only
// difference is this reviewed list; docs/DATABASE_HAND_WRITTEN_OBJECTS.md explains each object and
// why it stays out of the schema. Prisma cannot describe partial indexes, so the seven partial
// indexes (Job_claim_ready_idx among them) are invisible to the diff and are not listed here.
// Anything else means the schema and the migrations disagree: fix the schema or add a migration.
// Opt-in: runs only against a local jitm_design_ database, and applies the migrations to a shadow
// database it creates and drops.
const RESIDUE = [
  // Trigram GIN indexes for contact search (20260722013000, repeated in 20260904170000).
  'DROP INDEX "Contact_company_trgm_idx";',
  'DROP INDEX "Contact_displayName_trgm_idx";',
  'DROP INDEX "Contact_privateNotes_trgm_idx";',
  'DROP INDEX "Contact_publicNotes_trgm_idx";',
  'DROP INDEX "ContactCustomFieldValue_value_trgm_idx";',
  'DROP INDEX "ContactEmail_email_trgm_idx";',
  'DROP INDEX "ContactPhone_phone_trgm_idx";',
  // Active important dates per contact (20260722010000).
  'DROP INDEX "JumpDate_contact_active_idx";',
  // The schema declares @default("primary"); the table was created without a default and the code always writes the id.
  `ALTER TABLE "DataRetentionState" ALTER COLUMN "id" SET DEFAULT 'primary';`
];

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");

describe.skipIf(!local)("Prisma schema against the migrations", () => {
  const shadow = `jitm_design_shadow_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  let admin: Client | undefined, directory: string | undefined, script = "";
  beforeAll(async () => {
    const server = new URL(process.env.DATABASE_URL!); server.pathname = "/postgres"; server.search = "";
    admin = new Client({ connectionString: server.href }); await admin.connect();
    await admin.query(`CREATE DATABASE "${shadow}" TEMPLATE template0`);
    const shadowUrl = new URL(server); shadowUrl.pathname = `/${shadow}`;
    // Prisma 7 takes the shadow database from a config file; the repository's config has none.
    directory = mkdtempSync(join(tmpdir(), "jitm-migrate-diff-"));
    const config = join(directory, "prisma.diff.config.ts");
    const settings = { schema: join(process.cwd(), "prisma"), migrations: { path: join(process.cwd(), "prisma", "migrations") }, datasource: { url: process.env.DATABASE_URL, shadowDatabaseUrl: shadowUrl.href } };
    writeFileSync(config, `export default ${JSON.stringify(settings, null, 2)};\n`);
    const { stdout } = await promisify(execFile)(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "diff", "--config", config, "--from-migrations", "prisma/migrations", "--to-schema", "prisma", "--script"], {
      env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: "1" }, timeout: 150_000, maxBuffer: 16 * 1024 * 1024
    });
    script = stdout;
  }, 180_000);
  afterAll(async () => {
    if (directory) rmSync(directory, { recursive: true, force: true });
    if (admin) { await admin.query(`DROP DATABASE IF EXISTS "${shadow}" WITH (FORCE)`); await admin.end(); }
  });

  it("differs only by the reviewed hand-written indexes and one column default", () => {
    const statements = script.split("\n").filter(line => !line.trim().startsWith("--")).join(" ")
      .split(";").map(statement => statement.replace(/\s+/g, " ").trim()).filter(Boolean).map(statement => `${statement};`);
    expect(statements.filter(statement => /FOREIGN KEY|CONSTRAINT/.test(statement)), "Foreign keys or constraints the schema and the migrations disagree on").toEqual([]);
    expect(statements.sort()).toEqual([...RESIDUE].sort());
  });
});
