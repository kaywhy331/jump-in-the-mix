export const OPERATIONS_CHECKS = {
  web: { title: "Web readiness", href: "/admin/operations", help: "Check the web service, database connectivity and deployment configuration." },
  worker: { title: "Worker heartbeat", href: "/admin/operations", help: "Check the independently supervised worker and its recent heartbeat." },
  jobs: { title: "Failed or overdue jobs", href: "/admin/operations", help: "Inspect recorded failures and overdue work before retrying eligible jobs." },
  invitations: { title: "Invitation delivery review", href: "/admin/email/recovery", help: "Review uncertain or overdue invitation deliveries; preserve the original grant." },
  email: { title: "Email capacity and support notifications", href: "/admin/email", help: "Review rolling usage, account-email reserves, and pending support notifications. Open Admin → Support for notification recovery." },
  database: { title: "Database storage capacity", href: "/admin/reports", help: "Compare physical database size with the configured provider allowance." },
  backup: { title: "Encrypted backup freshness", href: "/admin/operations", help: "Check the verified backup manifest on the monitor's storage. Freshness alone does not prove offsite durability or restore success." },
  restore: { title: "Restore rehearsal freshness", href: "/admin/operations", help: "Run a complete encrypted backup, isolated restore and foreign-key smoke rehearsal, then retain its receipt." },
  mfa: { title: "Administrator verification blocks", href: "/admin/audit", help: "Review blocked administrator verification attempts. A block is a signal to investigate, not proof of account compromise." },
  support: { title: "Unusual support access volume", href: "/admin/audit", help: "Review elevated support-view openings. This aggregate threshold does not determine whether access was inappropriate." },
  notifications: { title: "Operational notification setup", href: "/admin/operations", help: "Configure a private operational webhook and verify delivery to the intended administrator channel." }
} as const;
export type OperationsCode = keyof typeof OPERATIONS_CHECKS;
export type OperationsState = "OK" | "WARNING" | "CRITICAL" | "UNKNOWN";
export type OperationsObservation = { code: OperationsCode; state: OperationsState; evidence: Record<string, number | null> };
export const OPERATIONS_CODES = Object.keys(OPERATIONS_CHECKS) as OperationsCode[];
export const OPERATIONS_LEASE_MS = 2 * 60_000;
export const OPERATIONS_REMINDER_MS = 24 * 3600_000;
export const OPERATIONS_NOTICE_MAX_AGE_MS = 24 * 3600_000;
export const OPERATIONS_NOTICE_ATTEMPTS = 5;

function setting(source: Readonly<Record<string, string | undefined>>, key: string, fallback: number, min: number, max: number) {
  const raw = source[key];
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${key} configuration.`);
  return value;
}
export function operationsPolicy(source: Readonly<Record<string, string | undefined>> = process.env) {
  return {
    workerStaleSeconds: setting(source, "WORKER_HEARTBEAT_STALE_SECONDS", 90, 30, 3600),
    jobOverdueSeconds: setting(source, "OPS_JOB_OVERDUE_SECONDS", 900, 60, 86400),
    databaseLimitBytes: setting(source, "OPS_DATABASE_LIMIT_BYTES", 0, 0, Number.MAX_SAFE_INTEGER),
    backupMaxAgeHours: setting(source, "OPS_BACKUP_MAX_AGE_HOURS", 36, 1, 168),
    restoreMaxAgeDays: setting(source, "OPS_RESTORE_MAX_AGE_DAYS", 30, 1, 365),
    supportViewThreshold: setting(source, "OPS_SUPPORT_VIEWS_PER_HOUR", 10, 1, 1000),
    intervalSeconds: setting(source, "OPS_MONITOR_INTERVAL_SECONDS", 300, 30, 3600),
    monitorStaleSeconds: setting(source, "OPS_MONITOR_STALE_SECONDS", 900, 60, 10800)
  };
}
export function severityRank(state: string) { return state === "CRITICAL" ? 3 : state === "WARNING" ? 2 : state === "UNKNOWN" ? 1 : 0; }

// A narrow evidence allowlist keeps identifiers, URLs, credentials and private
// source records out of persisted incidents and outgoing messages.
const evidenceKeys: Record<OperationsCode, readonly string[]> = {
  web: ["ready"], worker: ["ageSeconds", "limitSeconds"], jobs: ["failed", "overdue", "overdueSeconds"],
  invitations: ["review", "overdue", "overdueSeconds"], email: ["dayUsed", "dayLimit", "dayOtherUsed", "dayOtherLimit", "monthUsed", "monthLimit", "monthOtherUsed", "monthOtherLimit", "supportReview", "supportOverdue"],
  database: ["bytes", "limitBytes"], backup: ["ageHours", "limitHours"], restore: ["ageDays", "limitDays"],
  mfa: ["blocked"], support: ["openedLastHour", "limit"], notifications: ["configured"]
};
export function validateOperationsObservation(item: OperationsObservation, allowLegacyEmail = false) {
    if (!Object.hasOwn(OPERATIONS_CHECKS, item.code) || !["OK", "WARNING", "CRITICAL", "UNKNOWN"].includes(item.state) || !item.evidence || typeof item.evidence !== "object" || Array.isArray(item.evidence)) throw new Error("Invalid operations observation.");
    const keys = Object.keys(item.evidence);
    const allowed = allowLegacyEmail && item.code === "email" && !keys.includes("supportReview") && !keys.includes("supportOverdue") ? evidenceKeys.email.filter(key => !["supportReview", "supportOverdue"].includes(key)) : evidenceKeys[item.code];
    if (keys.length !== allowed.length || keys.some(key => !allowed.includes(key)) || Object.values(item.evidence).some(value => value !== null && (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER))) throw new Error("Invalid operations evidence.");
}

export function validateOperationsObservations(observations: OperationsObservation[]) {
  if (observations.length !== OPERATIONS_CODES.length || new Set(observations.map(item => item.code)).size !== OPERATIONS_CODES.length) throw new Error("A complete operations observation is required.");
  observations.forEach(item => validateOperationsObservation(item));
}
