import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { READY_MADE_PLANS } from "../src/lib/vertical-plan-library";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local).sequential("production catalog installation on a fresh database", () => {
  const database = `jitm_design_catalog_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  let admin: Client, sql: Client, url: URL;
  beforeAll(async () => {
    url = new URL(process.env.DATABASE_URL!); url.pathname = "/postgres"; url.search = "";
    admin = new Client({ connectionString: url.href }); await admin.connect();
    await admin.query(`CREATE DATABASE "${database}" TEMPLATE template0`);
    url.pathname = `/${database}`;
    await promisify(execFile)(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: url.href }, timeout: 45_000, maxBuffer: 2 * 1024 * 1024
    });
    sql = new Client({ connectionString: url.href }); await sql.connect();
  }, 60_000);
  afterAll(async () => {
    await sql?.end();
    if (admin) { try { await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`); } finally { await admin.end(); } }
  });
  const install = () => promisify(execFile)(process.execPath, ["--import", "tsx", "scripts/seed-application-catalog.ts"], {
    env: { ...process.env, DATABASE_URL: url.href, NODE_ENV: "production", DEMO_MODE: "true", RESET_DEMO_DATA: "true" },
    timeout: 30_000, maxBuffer: 1024 * 1024
  });
  async function snapshot() {
    const tables = ["DateType", "SharedMix", "SharedMixMetadata", "SharedMixRevision", "SharedMixRelease", "SystemMixConfig", "SystemMixRevision", "SystemMixRelease"];
    return Promise.all(tables.map(async table => (await sql.query(`SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY to_jsonb(t)::text`)).rows));
  }

  it("refuses a held recovery target before installing any catalog rows", async () => {
    const before = await snapshot();
    await sql.query(`ALTER DATABASE "${database}" SET jitm.recovery_hold TO 'held'`);
    try {
      await expect(install()).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("recovery-held") });
      expect(await snapshot()).toEqual(before);
    } finally { await sql.query(`ALTER DATABASE "${database}" RESET jitm.recovery_hold`); }
  }, 40_000);

  it("installs usable shipped plans without demo accounts and preserves edited data on the next deployment", async () => {
    expect((await sql.query('SELECT count(*)::int AS n FROM "SharedMix"')).rows[0].n).toBe(0);
    const first = await install();
    expect(JSON.parse(first.stdout.trim())).toEqual({ dateTypesCreated: 8, plansCreated: READY_MADE_PLANS.length, plansUnchanged: 0 });
    expect((await sql.query('SELECT count(*)::int AS n FROM "SharedMix" WHERE status = \'APPROVED\'')).rows[0].n).toBe(READY_MADE_PLANS.length);
    expect((await sql.query('SELECT count(*)::int AS n FROM "SharedMixRevision"')).rows[0].n).toBe(READY_MADE_PLANS.length);
    for (const table of ["User", "Workspace", "Contact", "Job", "EmailMessage", "Session"]) {
      expect((await sql.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n, table).toBe(0);
    }
    // Stand in for existing administrative choices, including an unpublished
    // plan and unpublished revision, without issuing any public release.
    const plan = READY_MADE_PLANS[0].id;
    await sql.query('UPDATE "DateType" SET name = \'Custom birthday label\', "isActive" = false WHERE id = \'system_birthday\'');
    await sql.query('UPDATE "SharedMix" SET status = \'UNPUBLISHED\' WHERE id = $1', [plan]);
    await sql.query('INSERT INTO "SharedMixRevision" (id, "sharedMixId", version, snapshot, reason) SELECT $2, "sharedMixId", 2, snapshot || \'{"title":"Staff draft"}\'::jsonb, \'Fixture staff draft\' FROM "SharedMixRevision" WHERE "sharedMixId" = $1 AND version = 1', [plan, randomUUID()]);
    await sql.query('UPDATE "SharedMixMetadata" SET "draftVersion" = 2, "controlRevision" = "controlRevision" + 1 WHERE "sharedMixId" = $1', [plan]);
    await sql.query('INSERT INTO "SystemMixRevision" (id, version, subject, body, reason) SELECT $1, 2, subject, body, \'Fixture System Mix draft\' FROM "SystemMixRevision" WHERE version = 1', [randomUUID()]);
    await sql.query('UPDATE "SystemMixConfig" SET "draftVersion" = 2, "controlRevision" = 1 WHERE id = \'referral\'');
    const before = await snapshot();
    const repeated = await install();
    expect(JSON.parse(repeated.stdout.trim())).toEqual({ dateTypesCreated: 0, plansCreated: 0, plansUnchanged: READY_MADE_PLANS.length });
    expect(await snapshot()).toEqual(before);
    expect((await sql.query('SELECT count(*)::int AS n FROM "User"')).rows[0].n).toBe(0);
  }, 70_000);
});
