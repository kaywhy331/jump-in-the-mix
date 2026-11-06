// Reviewed with the operator image. Keep catalog defaults and marker ownership here.
export const settings = Object.freeze({
  connectTimeoutMs: 5000,
  queryTimeoutMs: 20000,
  commandTimeoutMs: 5 * 60_000,
  maxOutputBytes: 2 * 1024 * 1024,
  maxContextBytes: 16384,
  backupMaxAgeMs: 15 * 60_000,
  syntheticPrefix: 'jitm-release-',
  probeTaskPrefix: 'jitm.release.probe.',
  // These operational rows may change during a healthy release. All other
  // previous-release model tables participate, including customer history.
  volatileTables: Object.freeze(['Job', 'WorkerHeartbeat', 'AuthRateLimit',
    'OperationsMonitor', 'OperationsCheck', 'OperationsNotice', 'Session',
    'AdminMfaSession', 'AuthOAuthState']),
});
