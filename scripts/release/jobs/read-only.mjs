import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { bind, verifyCandidate, digest } from '../candidate.mjs';
import { schemaRelease } from '../../generate-schema-release.mjs';
import { quoteIdentifier, databaseIdentity } from '../../lib/postgres-ops.mjs';
import { recoveryHoldQuery } from '../../../src/lib/recovery-hold-query.mjs';
import { need } from './receipt.mjs';
import { settings } from './settings.mjs';

export async function command(file, args, env = process.env, cwd = process.cwd()) {
  return (await promisify(execFile)(file, args, { cwd, env, timeout: settings.commandTimeoutMs,
    maxBuffer: settings.maxOutputBytes, encoding: 'utf8' })).stdout;
}
export const git = (...args) => command('git', args);

// The reviewed operator image needs the candidate checkout and previous Git
// objects. Read schema blobs as data; never execute code from the previous ref.
export async function releaseSchema(sha) {
  const directory = await mkdtemp(join(tmpdir(), 'jitm-release-schema-'));
  try {
    const paths = (await git('ls-tree', '-r', '--name-only', sha, '--', 'prisma')).trim().split('\n')
      .filter(path => /^prisma\/[A-Za-z0-9_-]+\.prisma$/.test(path) || /^prisma\/migrations\/[A-Za-z0-9_-]+\/migration\.sql$/.test(path));
    need(paths.length);
    for (const path of paths) {
      const target = join(directory, path);
      await mkdir(join(target, '..'), { recursive: true });
      await writeFile(target, await git('show', `${sha}:${path}`));
    }
    return schemaRelease(directory);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export async function reviewedSource(context) {
  need((await git('rev-parse', 'HEAD')).trim() === context.candidate_sha);
  await git('diff', '--quiet', context.candidate_sha, '--');
  need(!(await git('ls-files', '--others', '--exclude-standard')).trim());
  await git('merge-base', '--is-ancestor', context.previous_sha, context.candidate_sha);
  verifyCandidate(context.candidate_binding,
    await bind(process.cwd(), context.candidate_sha, context.candidate_binding.approved_main_sha),
    context.candidate_binding.approved_main_sha);
  return { previous: await releaseSchema(context.previous_sha), candidate: await releaseSchema(context.candidate_sha) };
}

export async function withReadOnly(action, url = process.env.DATABASE_URL) {
  need(url && databaseIdentity(url).schema === 'public');
  const client = new Client({ connectionString: url, connectionTimeoutMillis: settings.connectTimeoutMs,
    query_timeout: settings.queryTimeoutMs, statement_timeout: settings.queryTimeoutMs });
  try {
    await client.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } finally { await client.end(); }
}

export async function runtimeRole(env = process.env) {
  const role = decodeURIComponent(new URL(env.DATABASE_URL).username);
  // This existing command checks both grants and current_user; never --apply.
  const result = JSON.parse(await command(process.execPath, ['scripts/configure-runtime-database.mjs', `--role=${role}`], env));
  need(result.ready === true && result.boundary === true);
}

export async function noRecoveryHold(client) { need(!(await client.query(recoveryHoldQuery)).rowCount); }

export async function migrations(client, required, candidate) {
  const rows = (await client.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM public._prisma_migrations')).rows;
  need(!rows.some(row => !row.finished_at && !row.rolled_back_at));
  const applied = rows.filter(row => row.finished_at && !row.rolled_back_at);
  need(applied.every(row => candidate.migrations.some(m => m.name === row.migration_name && m.checksum === row.checksum)));
  need(required.migrations.every(m => applied.filter(row => row.migration_name === m.name && row.checksum === m.checksum).length === 1));
  return applied;
}

export async function schemaReady(client, schema) {
  const columns = (await client.query(`SELECT c.relname AS "table", a.attname AS "column", b.typname AS type,
    (t.typelem<>0) AS list FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid JOIN pg_type t ON t.oid=a.atttypid
    JOIN pg_type b ON b.oid=CASE WHEN t.typelem<>0 THEN t.typelem ELSE t.oid END
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped`)).rows;
  need(schema.columns.every(expected => columns.some(actual => ['table', 'column', 'type', 'list'].every(k => actual[k] === expected[k]))));
  const enums = (await client.query(`SELECT t.typname AS type, e.enumlabel AS value FROM pg_type t
    JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname='public'`)).rows;
  need(schema.enums.every(expected => enums.some(actual => actual.type === expected.type && actual.value === expected.value)));
}

export async function countsDigest(client, previous, candidate) {
  const tables = [...new Set(previous.columns.map(c => c.table))].sort();
  const next = [...new Set(candidate.columns.map(c => c.table))];
  const counts = [];
  for (const table of tables.filter(table => !settings.volatileTables.includes(table))) {
    const { rows } = await client.query(`SELECT count(*)::text AS count FROM public.${quoteIdentifier(table)}`);
    counts.push([table, rows[0].count]);
  }
  // Added tables may not exist before migration, but must be empty if present.
  for (const table of next.filter(table => !tables.includes(table))) {
    const exists = (await client.query('SELECT to_regclass($1) IS NOT NULL AS present', [`public.${quoteIdentifier(table)}`])).rows[0].present;
    if (exists) need((await client.query(`SELECT count(*)::text AS count FROM public.${quoteIdentifier(table)}`)).rows[0].count === '0');
  }
  return digest(JSON.stringify(counts));
}

export async function finalResidue(client, context) {
  // S3 owns this reserved prefix on every synthetic row ID and foreign key.
  // Scan all text columns, including orphan rows and hand-written tables.
  const columns = (await client.query(`SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema='public' AND data_type IN ('text','character varying','character') ORDER BY table_name, ordinal_position`)).rows;
  for (const { table_name: table, column_name: column } of columns) {
    need(!(await client.query(`SELECT 1 FROM public.${quoteIdentifier(table)} WHERE starts_with(${quoteIdentifier(column)}, $1) LIMIT 1`, [settings.syntheticPrefix])).rowCount);
  }
  need(!(await client.query('SELECT 1 FROM public."Job" WHERE starts_with(task,$1) LIMIT 1', [settings.probeTaskPrefix])).rowCount);
  need(!(await client.query('SELECT 1 FROM public."AuthRateLimit" WHERE "blockedUntil" > transaction_timestamp() LIMIT 1')).rowCount);
  need(!(await client.query('SELECT 1 FROM public."Job" WHERE "failedAt" >= $1::timestamptz LIMIT 1', [context.release_started_at])).rowCount);
}
