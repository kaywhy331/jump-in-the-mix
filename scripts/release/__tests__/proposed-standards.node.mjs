import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('both release instruction proposals reserve adoption for Kevin', () => {
  for (const path of ['docs/standards/16-agent-operating-standard.md', 'docs/standards/workflows/WF-06-production-release.md']) {
    const text = readFileSync(path, 'utf8');
    assert.ok(text.split('\n').includes("Merging this change needs Kevin's word (agent-instruction text)"));
    const proposal = text.match(/^- \[PROPOSED; not adopted\] (\d+\.\d+\.\d+) — (\d{4}-\d{2}-\d{2}).*INFRA-W14-RELEASE-WF.*$/m);
    assert.ok(proposal, path);
    assert.notEqual(text.match(/^version: (.+)$/m)[1], proposal[1]);
    assert.notEqual(text.match(/^last_reviewed: (.+)$/m)[1], proposal[2]);
    assert.ok(!text.includes(`\n- ${proposal[1]} —`), 'Proposed version must not appear adopted in the changelog');
  }
});
