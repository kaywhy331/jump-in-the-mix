import { cli } from './receipt.mjs';
import * as reads from './read-only.mjs';
import { removeFixture, residue } from './synthetic.mjs';
import { settings } from './settings.mjs';
export async function cleanup(context, io = { ...reads, removeFixture, residue }) {
  await io.reviewedSource(context);
  await io.removeFixture(context);
  await io.withReadOnly(db => io.residue(db,settings.syntheticPrefix));
  return { checks: { all_synthetic_rows_removed: true } };
}
cli(import.meta.url, 'cleanup', cleanup);
