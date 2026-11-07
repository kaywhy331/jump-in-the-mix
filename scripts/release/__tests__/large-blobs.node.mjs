import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { bind, blobDigest, digest } from '../candidate.mjs';
import { changeManifest } from '../workflow.mjs';

test('binding and preflight hash blobs above 1 MiB without subprocess buffering', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'release-large-blobs-'));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('init'); git('config', 'user.name', 'Synthetic Test'); git('config', 'user.email', 'test@example.test');
    writeFileSync(join(cwd, 'deleted.txt'), 'removed by candidate');
    git('add', '.'); git('commit', '-m', 'previous');
    const previous = git('rev-parse', 'HEAD');
    const bytes = Buffer.alloc(2 * 1024 * 1024 + 17, 'x');
    const paths = ['package-lock.json', 'render.yaml', 'prisma/migrations/001/migration.sql', 'browser-evidence.json'];
    mkdirSync(join(cwd, 'prisma/migrations/001'), { recursive: true });
    for (const path of paths) writeFileSync(join(cwd, path), bytes);
    rmSync(join(cwd, 'deleted.txt'));
    git('add', '.'); git('commit', '-m', 'large blobs');
    const candidate = git('rev-parse', 'HEAD');
    const expected = digest(bytes);
    const binding = await bind(cwd, candidate, candidate);
    assert.equal(binding.lockfile_sha256, expected);
    assert.equal(binding.render_yaml_sha256, expected);
    assert.equal(binding.migrations_sha256, digest(JSON.stringify([[paths[2], expected]])));
    const manifest = await changeManifest(cwd, previous, candidate);
    assert.deepEqual(Object.fromEntries(manifest), { ...Object.fromEntries(paths.map((path) => [path, expected])), 'deleted.txt': null });
    assert.equal(digest(JSON.stringify(manifest)), digest(JSON.stringify([...paths, 'deleted.txt'].sort().map((path) => [path, path === 'deleted.txt' ? null : expected]))));
    await assert.rejects(blobDigest(cwd, candidate, 'missing'), /Git blob read failed/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
