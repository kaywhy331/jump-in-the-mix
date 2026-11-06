import { join } from 'node:path';
import { writeOperationsReceipt } from '../../lib/operations-artifacts.mjs';
import * as reads from './read-only.mjs';
import { need } from './receipt.mjs';

export async function backupVersions(context, databaseUrl, io = reads, env = process.env) {
  // Retain fixed numeric version evidence even when the comparison refuses.
  // Raw command output, connection strings and database names are never stored.
  need(env.JITM_RELEASE_JOB_EVIDENCE_DIR);
  const dump = (await io.command('pg_dump',['--version'],env)).match(/^pg_dump \(PostgreSQL\) (\d+(?:\.\d+)*)(?:\s|$)/);
  need(dump);
  const pg_dump_version = dump[1], pg_dump_major = Number(pg_dump_version.split('.')[0]);
  need(Number.isSafeInteger(pg_dump_major) && pg_dump_major >= 10);
  const server_version_num = await io.withReadOnly(async client => Number((await client.query('SHOW server_version_num')).rows[0].server_version_num),databaseUrl);
  need(Number.isSafeInteger(server_version_num) && server_version_num >= 100000);
  const server_major = Math.floor(server_version_num / 10000);
  const compatible = pg_dump_major >= server_major;
  await writeOperationsReceipt(join(env.JITM_RELEASE_JOB_EVIDENCE_DIR,`${context.operation_id}.backup-versions.json`),{
    operation_id:context.operation_id,candidate_sha:context.candidate_sha,pg_dump_version,pg_dump_major,server_major,server_version_num,compatible,
  });
  need(compatible);
  return {pg_dump_major,server_major};
}
