import { cli, need } from './receipt.mjs';
import * as reads from './read-only.mjs';
import { sameDatabase, databaseIdentity } from '../../lib/postgres-ops.mjs';
import { forwardOnly, newObjects } from './forward-only.mjs';

export async function backupGrants(env = process.env, io = reads) {
  need(env.BACKUP_DATABASE_URL && sameDatabase(env.BACKUP_DATABASE_URL, env.DATABASE_URL)
    && databaseIdentity(env.BACKUP_DATABASE_URL).schema === 'public');
  await io.withReadOnly(async client => {
    const actual = (await client.query('SELECT current_user AS name')).rows[0].name;
    need(actual === decodeURIComponent(new URL(env.BACKUP_DATABASE_URL).username));
    const result = (await client.query(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE NOT has_table_privilege(current_user,c.oid,'SELECT')
        OR c.relrowsecurity AND NOT (SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname=current_user))::int AS missing
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')`)).rows[0];
    need(result.total > 0 && result.missing === 0);
    need(!(await client.query(`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='S' AND NOT has_sequence_privilege(current_user,c.oid,'SELECT') LIMIT 1`)).rowCount);
  },env.BACKUP_DATABASE_URL);
}

export async function migrate(context, io = { ...reads, forwardOnly, newObjects, backupGrants }, env = process.env) {
  const { previous, candidate } = await io.reviewedSource(context);
  const objects = await io.forwardOnly(context, previous, candidate);
  await io.runtimeRole(env);
  await io.backupGrants(env, io);
  await io.withReadOnly(async client => {
    await io.noRecoveryHold(client);
    await io.migrations(client, previous, previous);
    await io.newObjects(client, objects, false);
    need(await io.countsDigest(client, previous, candidate) === context.baseline_counts_sha256);
  });
  // Existing isolated owner wrapper performs migration, grants and generated
  // schema verification. It never exposes its owner credential in arguments.
  await io.command(process.execPath,['scripts/migrate-with-owner.mjs'],env);
  await io.runtimeRole(env);
  await io.backupGrants(env, io);
  return io.withReadOnly(async client => {
    await io.noRecoveryHold(client);
    await io.migrations(client, candidate, candidate);
    await io.schemaReady(client, candidate);
    await io.newObjects(client, objects, true);
    const counts_sha256 = await io.countsDigest(client, previous, candidate);
    need(counts_sha256 === context.baseline_counts_sha256);
    return { checks: { forward_only: true, runtime_role: true, new_objects: true, backup_grants: true, counts_unchanged: true }, counts_sha256 };
  });
}
cli(import.meta.url, 'migrate', migrate);
