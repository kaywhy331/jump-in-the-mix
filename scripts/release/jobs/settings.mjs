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
  httpTimeoutMs: 15000,
  workerFreshMs: 60000,
  workerPollMs: 1000,
  workerWaitMs: 60000,
  phoneViewport: Object.freeze({ width: 390, height: 844 }),
  browserTimeoutMs: 15000,
  cookieLifetimeToleranceSeconds: 120,
  syntheticName: 'Release smoke (synthetic)',
  // These operational rows may change during a healthy release. All other
  // previous-release model tables participate, including customer history.
  volatileTables: Object.freeze(['Job', 'WorkerHeartbeat', 'AuthRateLimit',
    'OperationsMonitor', 'OperationsCheck', 'OperationsNotice', 'Session',
    'AdminMfaSession', 'AuthOAuthState']),
});
