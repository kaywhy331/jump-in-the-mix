import { cli, need, isDigest } from './receipt.mjs';
import * as reads from './read-only.mjs';
import { settings } from './settings.mjs';
import { operationsSourceHash } from '../../lib/operations-artifacts.mjs';
import { sameDatabase } from '../../lib/postgres-ops.mjs';
import { s3BackupConfiguration } from '../../lib/s3-backup-store.mjs';
import { backupVersions } from './backup-versions.mjs';

export async function backup(context, io = { ...reads, backupVersions }, env = process.env, now = Date.now) {
  await io.reviewedSource(context);
  const databaseUrl = env.BACKUP_DATABASE_URL || env.DATABASE_URL;
  need(databaseUrl && env.DATABASE_URL && sameDatabase(databaseUrl,env.DATABASE_URL));
  const config = s3BackupConfiguration(env);
  await io.backupVersions(context,databaseUrl,io,env);
  const started = now();
  const result = JSON.parse(await io.command(process.execPath, ['scripts/backup-to-s3.mjs'], { ...env, DATABASE_URL: databaseUrl }));
  const captured = Date.parse(result.createdAt), finished = now();
  need(result.status === 'stored' && result.bucket === config.bucket && result.sourceHash === operationsSourceHash(databaseUrl));
  need(Number.isFinite(captured) && captured >= started && captured >= Date.parse(context.release_started_at)
    && captured <= finished && finished - captured <= settings.backupMaxAgeMs);
  need(Array.isArray(result.objects) && result.objects.length === 3);
  const [archive, recovery, manifest] = result.objects;
  need(typeof archive.key === 'string' && archive.key.startsWith(config.prefix) && archive.key.endsWith('.jitm-backup.enc'));
  need(recovery.key === `${archive.key}.recovery-state.enc` && manifest.key === `${archive.key}.manifest.json` && result.manifestKey === manifest.key);
  need(result.objects.every(object => isDigest(object.sha256) && Number.isSafeInteger(object.bytes) && object.bytes > 0));
  // backup-to-s3 returns 'stored' only after publishBackupBundle verifies
  // head-object length, SHA-256 and AES256 for all three immutable objects.
  return { checks: { encrypted: true, fresh: true, durable: true, checksum_verified: true }, backup_sha256: archive.sha256 };
}
cli(import.meta.url, 'backup', backup);
