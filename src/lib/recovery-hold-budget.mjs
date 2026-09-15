// Budgets for reading the recovery hold, shared by the Next.js route, the dedicated Netlify
// function and the edge proxy's client so the three never disagree.
//
// The proxy waits at most RECOVERY_CHECK_TIMEOUT_MS for the whole probe and fails closed on
// anything else. Inside that wait, the probe allows a suspended database compute to wake
// (RECOVERY_CONNECT_TIMEOUT_MS) and then a bounded catalog read (RECOVERY_QUERY_TIMEOUT_MS), and
// gives up as "unavailable" at RECOVERY_READ_DEADLINE_MS whatever the client library does, so a
// slow read is reported by the probe itself rather than by the proxy's abort. The worker timers
// allow ten to twenty seconds for their handoff, so the proxy's wait stays inside theirs.
export const RECOVERY_CHECK_TIMEOUT_MS = 8_000;
export const RECOVERY_CONNECT_TIMEOUT_MS = 5_000;
export const RECOVERY_STATEMENT_TIMEOUT_MS = 1_500;
export const RECOVERY_QUERY_TIMEOUT_MS = 2_000;
export const RECOVERY_READ_DEADLINE_MS = 7_000;
