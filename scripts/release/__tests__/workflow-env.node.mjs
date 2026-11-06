import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';

test('Render credentials belong only to steps that can call Render', () => {
  const workflow = yaml.safeLoad(readFileSync('.github/workflows/release.yml', 'utf8'));
  const key = 'RENDER_API_KEY';
  const secret = '${{ secrets.RENDER_API_KEY }}';
  const commands = new Set(['gate', 'preflight', 'backup', 'migrate', 'worker', 'web', 'postflight', 'smoke', 'cleanup', 'final']);
  const seen = new Set();
  assert.ok(!(key in (workflow.env ?? {})));
  for (const [jobName, job] of Object.entries(workflow.jobs)) {
    assert.ok(!(key in (job.env ?? {})), `${jobName} job env exposes Render credentials`);
    for (const step of job.steps) {
      const command = step.run?.match(/^node scripts\/release\/workflow\.mjs (\w+)$/)?.[1];
      if (commands.has(command)) {
        assert.equal(jobName, 'release');
        assert.equal(step.env?.[key], secret, `${command} needs a step-scoped key`);
        seen.add(command);
      } else {
        assert.ok(!JSON.stringify(step).includes(key), `${step.name ?? step.uses} must not receive the key`);
      }
    }
  }
  assert.deepEqual(seen, commands);
});
