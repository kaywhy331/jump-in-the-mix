import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const digest = (value) => createHash('sha256').update(value).digest('hex');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const sha = (value) => { if (!/^[a-f0-9]{40}$/.test(value)) throw new Error('Candidate must be a full commit SHA'); return value; };

export function blobDigest(cwd, commit, path) {
  sha(commit);
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const child = spawn('git', ['show', `${commit}:${path}`], { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
    child.stdout.on('data', (chunk) => hash.update(chunk));
    child.stdout.on('error', reject);
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(hash.digest('hex')) : reject(new Error('Git blob read failed')));
  });
}

// Read Git blobs as data, never checkout/install/execute candidate code here.
export async function bind(cwd, candidateSha, mainSha) {
  sha(candidateSha); sha(mainSha);
  git(cwd, 'merge-base', '--is-ancestor', candidateSha, mainSha);
  const paths = git(cwd, 'ls-tree', '-r', '--name-only', '-z', candidateSha, '--', 'prisma/migrations').split('\0').filter(Boolean).sort();
  if (!paths.some((path) => path.endsWith('/migration.sql'))) throw new Error('Missing migration set');
  const migrations = [];
  for (const path of paths) migrations.push([path, await blobDigest(cwd, candidateSha, path)]);
  return {
    candidate_sha: candidateSha,
    approved_main_sha: mainSha,
    lockfile_sha256: await blobDigest(cwd, candidateSha, 'package-lock.json'),
    render_yaml_sha256: await blobDigest(cwd, candidateSha, 'render.yaml'),
    migrations_sha256: digest(JSON.stringify(migrations)),
  };
}

export function verifyCandidate(approved, actual, currentMainSha) {
  sha(currentMainSha);
  if (approved.approved_main_sha !== currentMainSha) throw new Error('Main moved: a new candidate approval is required');
  const fields = ['candidate_sha', 'approved_main_sha', 'lockfile_sha256', 'render_yaml_sha256', 'migrations_sha256'];
  for (const field of fields) {
    if (!approved[field] || approved[field] !== actual[field]) throw new Error(`Candidate binding mismatch: ${field}`);
  }
  if (fields.slice(2).some((field) => !/^[a-f0-9]{64}$/.test(approved[field]))) throw new Error('Malformed candidate digest');
  return actual;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [command, candidateSha, mainSha, file] = process.argv.slice(2);
    const actual = await bind(process.cwd(), candidateSha, mainSha);
    if (command === 'bind' && file) writeFileSync(file, JSON.stringify(actual, null, 2) + '\n');
    else if (command === 'verify' && file) verifyCandidate(JSON.parse(readFileSync(file, 'utf8')), actual, mainSha);
    else throw new Error('Usage: candidate.mjs bind|verify <sha> <main-sha> <record.json>');
    console.log(JSON.stringify(actual));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
