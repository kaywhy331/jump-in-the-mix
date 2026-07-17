import { describe, expect, it } from "vitest";
import { postgresCliEnv } from "../scripts/lib/postgres-ops.mjs";

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
});
