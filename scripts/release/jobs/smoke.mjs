import { cli } from './receipt.mjs';
import * as reads from './read-only.mjs';
import { seed, assertFixture, removeFixture } from './synthetic.mjs';
import { browserSmoke } from './smoke-browser.mjs';

export async function smoke(context, io = { ...reads, seed, assertFixture, removeFixture, browserSmoke }) {
  await io.reviewedSource(context);
  const fixture = await io.seed(context);
  try {
    await io.withReadOnly(db => io.assertFixture(db,context));
    const checks = await io.browserSmoke(context,fixture);
    await io.withReadOnly(db => io.assertFixture(db,context));
    return { checks: { ...checks, one_synthetic_owner: true, no_recipient_addresses: true, manual_beats: true } };
  } finally {
    // The orchestrator also invokes the standalone cleanup after a terminal
    // failure; this protects failures within a still-running smoke process.
    await io.removeFixture(context);
  }
}
cli(import.meta.url, 'smoke', smoke);
