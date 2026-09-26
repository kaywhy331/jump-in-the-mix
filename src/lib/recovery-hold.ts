import { Pool } from "pg";
import { recoveryHoldQuery } from "@/lib/recovery-hold-query.mjs";
import { RECOVERY_CONNECT_TIMEOUT_MS, RECOVERY_QUERY_TIMEOUT_MS, RECOVERY_READ_DEADLINE_MS, RECOVERY_STATEMENT_TIMEOUT_MS } from "@/lib/recovery-hold-budget.mjs";

// Standalone Node reads directly; Netlify's proxy uses a dedicated HTTP probe. Both use
// this bounded catalog read without caching, so a newly placed hold takes effect immediately.
let pool: Pool | undefined;

/**
 * Reads the database's persistent recovery hold. Anything short of a completed catalog read
 * inside the deadline, including a database compute that is still waking, answers "unavailable"
 * so the caller fails closed; a late answer is discarded.
 */
export async function databaseRecoveryStatus(deadlineMs = RECOVERY_READ_DEADLINE_MS): Promise<"clear" | "held" | "unavailable"> {
  const connectionString = process.env.DATABASE_URL?.trim() || process.env.NETLIFY_DB_URL?.trim();
  if (!connectionString) return "unavailable";
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    pool ??= new Pool({ connectionString, max: 2, connectionTimeoutMillis: RECOVERY_CONNECT_TIMEOUT_MS, idleTimeoutMillis: 10_000, statement_timeout: RECOVERY_STATEMENT_TIMEOUT_MS, query_timeout: RECOVERY_QUERY_TIMEOUT_MS, allowExitOnIdle: true });
    // Idle socket failure must not crash the web process. A request still fails
    // closed if its own catalog read cannot finish.
    if (pool.listenerCount("error") === 0) pool.on("error", () => undefined);
    const deadline = new Promise<"unavailable">((resolve) => { timer = setTimeout(() => resolve("unavailable"), deadlineMs); });
    const read = pool.query<{ value: string }>(recoveryHoldQuery).then((result) => result.rows.length ? "held" as const : "clear" as const);
    // A read that loses the race is left to settle on its own; its result is never used.
    read.catch(() => undefined);
    return await Promise.race([read, deadline]);
  } catch { return "unavailable"; }
  finally { if (timer) clearTimeout(timer); }
}
