import { cli, need } from './receipt.mjs';
import * as reads from './read-only.mjs';

export async function final(context, io = reads) {
  const { previous, candidate } = await io.reviewedSource(context);
  await io.runtimeRole();
  return io.withReadOnly(async client => {
    await io.noRecoveryHold(client);
    await io.migrations(client, candidate, candidate);
    await io.schemaReady(client, candidate);
    const counts_sha256 = await io.countsDigest(client, previous, candidate);
    need(counts_sha256 === context.baseline_counts_sha256);
    await io.finalResidue(client, context);
    return { checks: { counts_unchanged: true, no_synthetic_rows: true, no_probe_jobs: true,
      no_rate_limit_blocks: true, no_failed_jobs_since_release: true }, counts_sha256 };
  });
}
cli(import.meta.url, 'final', final);
