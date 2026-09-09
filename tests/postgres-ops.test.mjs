import { describe, expect, it } from "vitest";
import { assertBackupManifest, compareSnapshots, normalizePgRestoreSql, postgresCliEnv } from "../scripts/lib/postgres-ops.mjs";

describe("PostgreSQL CLI connection environment", () => {
  it("maps a Prisma URL to discrete libpq environment variables", () => {
    expect(postgresCliEnv("postgresql://user%40example:p%40ss%3Aword@db.example.com:5544/jitm?schema=tenant&sslmode=require&application_name=jitm-test")).toEqual({
      PGHOST: "db.example.com",
      PGPORT: "5544",
      PGDATABASE: "jitm",
      PGUSER: "user@example",
      PGPASSWORD: "p@ss:word",
      PGSSLMODE: "require",
      PGAPPNAME: "jitm-test"
    });
  });

  it("uses PostgreSQL's default port and omits absent credentials", () => {
    expect(postgresCliEnv("postgresql://localhost/sample?schema=public")).toEqual({
      PGHOST: "localhost",
      PGPORT: "5432",
      PGDATABASE: "sample"
    });
  });

  it("removes only the disabled newer-client transaction timeout setting", () => {
    const sql = [
      "SET statement_timeout = 0;",
      "SET transaction_timeout = 0;",
      "SET lock_timeout = 0;",
      "SET transaction_timeout = 5000;",
      ""
    ].join("\r\n");
    expect(normalizePgRestoreSql(sql)).toBe([
      "SET statement_timeout = 0;",
      "SET lock_timeout = 0;",
      "SET transaction_timeout = 5000;",
      ""
    ].join("\r\n"));
  });

  it("recreates required extensions after the dumped public schema", () => {
    const sql = "DROP SCHEMA public;\nCREATE SCHEMA public;\nCREATE TABLE public.sample (id text);\n";
    const normalized = normalizePgRestoreSql(sql, { requiredExtensions: ["pg_trgm"] });
    expect(normalized).toContain('CREATE SCHEMA public;\nCREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";\nCREATE TABLE');
    expect(() => normalizePgRestoreSql(sql, { requiredExtensions: ["untrusted_extension"] })).toThrow(/unsupported PostgreSQL extension/u);
  });
});

describe("backup verification coverage", () => {
  const snapshot = {
    schema: "public", tableCount: 1, tableNames: ["FutureJourneyData"],
    tableCounts: { FutureJourneyData: "1" }, tableDigests: { FutureJourneyData: "a".repeat(64) },
    contentHashAlgorithm: "sha256-jsonb-sorted-v1", appliedMigrationNames: ["latest"], failedMigrationCount: 0
  };
  const manifest = { manifestVersion: 2, archive: { sha256: "b".repeat(64) }, source: snapshot };

  it("requires every inventoried table to have both count and content evidence", () => {
    expect(() => assertBackupManifest(manifest)).not.toThrow();
    expect(() => assertBackupManifest({ ...manifest, source: { ...snapshot, tableDigests: {} } })).toThrow(/every table/u);
    expect(() => assertBackupManifest({ ...manifest, source: { ...snapshot, tableNames: ["OtherTable"] } })).toThrow(/every table/u);
    expect(() => assertBackupManifest({ ...manifest, source: { ...snapshot, contentHashAlgorithm: "unknown" } })).toThrow(/every table/u);
  });

  it("detects changed contents even when table and row counts match", () => {
    expect(compareSnapshots(snapshot, { ...snapshot, tableDigests: { FutureJourneyData: "c".repeat(64) } })).toContain("FutureJourneyData row contents differ");
    expect(compareSnapshots(snapshot, { ...snapshot, tableNames: ["OtherTable"] })).toContain("application table inventory differs");
  });

  it("keeps original count-based checks for version-one archives", () => {
    const legacy = { schema: "public", tableCount: 1, tableCounts: { FutureJourneyData: "1" }, appliedMigrationNames: ["latest"], failedMigrationCount: 0 };
    expect(() => assertBackupManifest({ manifestVersion: 1, archive: manifest.archive, source: legacy })).not.toThrow();
    expect(compareSnapshots(legacy, snapshot)).toEqual([]);
    expect(compareSnapshots(legacy, { ...snapshot, tableCounts: { FutureJourneyData: "0" } })).toContain("FutureJourneyData row count expected 1, restored 0");
  });
});
