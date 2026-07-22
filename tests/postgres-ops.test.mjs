import { describe, expect, it } from "vitest";
import { normalizePgRestoreSql, postgresCliEnv } from "../scripts/lib/postgres-ops.mjs";

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
