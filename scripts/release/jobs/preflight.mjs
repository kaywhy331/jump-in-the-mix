import { cli } from './receipt.mjs';
import * as reads from './read-only.mjs';

export async function preflight(context, io = reads) {
  const { previous, candidate } = await io.reviewedSource(context);
  await io.runtimeRole();
  return io.withReadOnly(async client => {
    await io.noRecoveryHold(client);
    await io.migrations(client, previous, candidate);
    await io.schemaReady(client, previous);
    const counts_sha256 = await io.countsDigest(client, previous, candidate);
    return { checks: { database_ready: true, runtime_role: true, no_recovery_hold: true,
      migration_checksums: true, reviewed_diff: true, counts_recorded: true }, counts_sha256 };
  });
}
cli(import.meta.url, 'preflight', preflight);
