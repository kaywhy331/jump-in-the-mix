import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { databaseIdentity } from './postgres-ops.mjs';
import { validateLoadProfile } from './customer-load-fixture.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
export const loadSourceHash = url => hash(JSON.stringify(databaseIdentity(url)));
export const loadDatabaseName = id => `jitm_design_load_${id}`;
export const loadRoleName = id => `jitm_load_${id}`;
export const loadOwnershipMarker = plan => `jitm-load:${hash(`${plan.id}:${plan.token}:${plan.sourceHash}`)}`;

function databaseUrl(value) {
  const url = new URL(value);
  const identity = databaseIdentity(url.href);
  // pg accepts connection overrides in query parameters. Do not allow a plan
  // whose reviewed pathname/username differs from the actual driver target.
  const allowed = new Set(['schema', 'sslmode', 'connection_limit', 'pool_timeout', 'connect_timeout', 'pgbouncer']);
  const keys = [...url.searchParams.keys()];
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || !url.hostname || url.hash || !/^[a-zA-Z0-9_]+$/.test(identity.database) || ['postgres', 'template0', 'template1'].includes(identity.database) || identity.schema !== 'public' || keys.some(key => !allowed.has(key)) || new Set(keys).size !== keys.length) throw new Error('Invalid isolated database connection.');
  return url;
}

function validateRuntimeLimits(config, now) {
  const expires = Date.parse(config.expiresAt);
  if (!Number.isFinite(expires) || expires <= now || expires - now > 90 * 60_000 || !Number.isInteger(config.port) || config.port < 1024 || config.port > 65535) throw new Error('Load plan expired or has invalid runtime limits.');
}

function validateCommit(config, url) {
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if ((!local || config.expectedCommit !== undefined) && !/^[a-f0-9]{40}$/.test(config.expectedCommit ?? '')) throw new Error('Hosted qualification requires an exact deployed commit.');
}

export function validateHostedLoadPlan(plan, now = Date.now()) {
  if (plan?.version !== 1 || !/^[a-f0-9]{12}$/.test(plan.id ?? '') || !/^[a-f0-9]{64}$/.test(plan.token ?? '')) throw new Error('Invalid private load plan.');
  const url = databaseUrl(plan.sourceUrl);
  if (databaseIdentity(url.href).database === loadDatabaseName(plan.id) || plan.sourceHash !== loadSourceHash(url.href)) throw new Error('Load source identity does not match the reviewed plan.');
  validateCommit(plan, url);
  validateRuntimeLimits(plan, now);
  validateLoadProfile(plan.profile);
  return plan;
}

export async function readPrivateLoadJson(file) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > 16384 || info.mode & 0o077) throw new Error('Load configuration must be a private regular file under 16 KiB.');
    const contents = await handle.readFile('utf8');
    if (Buffer.byteLength(contents) > 16384) throw new Error('Load configuration is too large.');
    return JSON.parse(contents);
  } finally { await handle.close(); }
}

export async function readPrivateLoadPlan(file) {
  return validateHostedLoadPlan(await readPrivateLoadJson(file));
}

export function loadWorkerConfiguration(plan) {
  validateHostedLoadPlan(plan);
  const url = new URL(plan.sourceUrl);
  url.pathname = `/${loadDatabaseName(plan.id)}`; url.username = loadRoleName(plan.id); url.password = hash(`password:${plan.token}`);
  return { version: 1, id: plan.id, runtimeUrl: url.href, dataKey: hash(`data:${plan.token}`), rateKey: hash(`rate:${plan.token}`), port: plan.port, expiresAt: plan.expiresAt, expectedCommit: plan.expectedCommit };
}

export function isolatedLoadEnvironment(config, source = process.env) {
  const url = databaseUrl(config.runtimeUrl);
  if (config.version !== 1 || !/^[a-f0-9]{12}$/.test(config.id ?? '') || url.pathname !== `/${loadDatabaseName(config.id)}` || decodeURIComponent(url.username) !== loadRoleName(config.id) || !/^[a-f0-9]{64}$/.test(url.password) || !/^[a-f0-9]{64}$/.test(config.dataKey ?? '') || !/^[a-f0-9]{64}$/.test(config.rateKey ?? '')) throw new Error('Invalid isolated worker configuration.');
  validateRuntimeLimits(config, Date.now());
  validateCommit(config, url);
  const origin = `http://127.0.0.1:${config.port}`;
  // Allowlist the inherited environment. Production sender, recovery and AWS
  // credentials must not accompany either fixture process.
  return { PATH: source.PATH ?? '/usr/local/bin:/usr/bin:/bin', TZ: 'UTC', DOTENV_CONFIG_PATH: '/dev/null', NODE_ENV: 'production',
    DATABASE_URL: url.href, NETLIFY_DB_URL: '', HOSTNAME: '127.0.0.1', PORT: String(config.port), APP_URL: origin,
    AUTH_COOKIE_NAME: 'jitm_load_session', AUTH_REQUIRE_EMAIL_VERIFICATION: 'false', AUTH_REQUIRE_ADMIN_MFA: 'true', AUTH_RATE_LIMIT_SECRET: config.rateKey,
    DATA_ENCRYPTION_KEY: config.dataKey, PILOT_MODE: 'true', PRIVATE_TEST_MODE: 'false', DEMO_MODE: 'false',
    PUBLIC_OPERATOR_NAME: 'Synthetic performance fixture', PUBLIC_SUPPORT_EMAIL: 'support@example.test', PUBLIC_BACKUP_RETENTION_NOTICE: 'Synthetic test data is removed after this qualification. This is not the public service policy.',
    RESEND_API_KEY: '', RESEND_RECOVERY_API_KEY: '', RESEND_WEBHOOK_SECRET: '', EMAIL_FROM: '', EMAIL_REPLY_TO: '',
    TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '', TWILIO_FROM_NUMBER: '', WEB_PUSH_VAPID_PRIVATE_KEY: '', WEB_PUSH_VAPID_PUBLIC_KEY: '',
    OPS_ALERT_WEBHOOK_URL: '', OPS_ALERT_SNS_TOPIC_ARN: '', BACKUP_S3_BUCKET: '', NETLIFY_WORKER_SECRET: '', WORKER_DISPATCH_MODE: 'off' };
}
