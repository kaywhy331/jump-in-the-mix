import { Pool } from "pg";
import { recoveryHoldQuery } from "@/lib/recovery-hold-query.mjs";

// Proxy has its own runtime. Bound both connections and waiting requests, and
// read on every request so a newly placed hold cannot hide behind a cache.
let pool: Pool | undefined;
export async function databaseRecoveryStatus(): Promise<"clear" | "held" | "unavailable"> {
  const connectionString = process.env.DATABASE_URL?.trim() || process.env.NETLIFY_DB_URL?.trim();
  if (!connectionString) return "unavailable";
  try {
    pool ??= new Pool({ connectionString, max: 2, connectionTimeoutMillis: 1500, idleTimeoutMillis: 10_000, statement_timeout: 1500, query_timeout: 2000, allowExitOnIdle: true });
    // Idle socket failure must not crash the web process. A request still fails
    // closed if its own catalog read cannot finish.
    if (pool.listenerCount("error") === 0) pool.on("error", () => undefined);
    const result = await pool.query<{ value: string }>(recoveryHoldQuery);
    return result.rows.length ? "held" : "clear";
  } catch { return "unavailable"; }
}
