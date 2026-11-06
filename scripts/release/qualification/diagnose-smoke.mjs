// Reproduce only a failed synthetic smoke, retaining its real cleanup. Report
// source locations, never exception messages, browser state or fixture values.
import { smoke } from '../jobs/smoke.mjs';
import { parseContext } from '../jobs/receipt.mjs';
try {
  await smoke(parseContext('smoke'));
  console.log(JSON.stringify({diagnostic:'smoke',result:'passed-on-diagnostic-run'}));
} catch(error) {
  const locations=String(error.stack).split('\n').slice(1)
    .map(line=>line.match(/(?:file:\/\/)?(\/app\/(?:scripts|src)\/[^\s():]+:\d+:\d+)/)?.[1]).filter(Boolean).slice(0,8);
  console.log(JSON.stringify({diagnostic:'smoke',result:'failed',locations}));
  process.exitCode=1;
}
