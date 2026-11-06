import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cli, need } from './receipt.mjs';
import * as reads from './read-only.mjs';
import { settings } from './settings.mjs';

export function siteOrigin(env = process.env) {
  const url = new URL(env.JITM_RELEASE_SITE_URL);
  need(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
    && url.href === `${url.origin}/`);
  return url.origin;
}
export async function getAsset(path, origin, fetcher = fetch) {
  need(path.startsWith('/') && !path.startsWith('//') && new URL(path, origin).origin === origin);
  return fetcher(new URL(path, origin), { redirect: 'manual', signal: AbortSignal.timeout(settings.httpTimeoutMs) });
}
export async function assetFiles(directory, prefix = '') {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    need(!entry.isSymbolicLink());
    const path = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) paths.push(...await assetFiles(join(directory, entry.name), path));
    else if (entry.isFile()) paths.push(path);
  }
  return paths.sort();
}
export function publicChecks(result, origin) {
  need(result.base === origin && result.skipped === 0 && result.failed === 0
    && result.total === result.checks?.length && result.passed === result.total);
  const ids = ['live', 'ready', 'worker', 'page:/', 'page:/login', 'page:/faq', 'page:/terms',
    'page:/privacy', 'page:/for/contractors', 'redirect:/jumps', 'redirect:/contacts',
    'redirect:/mixes', 'redirect:/journey', 'redirect:/more', 'csp', 'nonce', 'hsts', 'x-frame-options'];
  need(result.checks.length === ids.length && ids.every(id => result.checks.filter(c => c.id === id && c.ok === true && !c.skipped).length === 1));
}
export async function assets(context, origin, io = reads, fetcher = fetch) {
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  // The reviewed operator image carries the same build artifact as the web image.
  // Compare bytes, not a filename containing a hash or an operator assertion.
  for (const [directory, prefix] of [['public', ''], ['.next/static', '/_next/static']]) {
    const files = await assetFiles(directory);
    need(files.length > 0);
    for (const path of files) {
      const response = await getAsset(`${prefix}${path}`, origin, fetcher);
      need(response.status === 200);
      need(hash(Buffer.from(await response.arrayBuffer())) === hash(await readFile(`${directory}${path}`)));
    }
  }
  const deleted = (await io.git('diff', '--diff-filter=D', '--name-only', '-z', context.previous_sha, context.candidate_sha, '--', 'public')).split('\0').filter(Boolean);
  for (const path of deleted) need((await getAsset(path.slice('public'.length), origin, fetcher)).status === 404);
}
export async function redirects(origin, fetcher = fetch) {
  for (const path of ['/jumps','/contacts','/mixes','/journey','/more']) {
    const response = await getAsset(path,origin,fetcher);
    need([302,303,307,308].includes(response.status));
    const target = new URL(response.headers.get('location'),origin);
    need(target.origin === origin && target.pathname === '/login');
  }
}
export async function postflight(context, io = { ...reads, assets, redirects }, env = process.env) {
  await io.reviewedSource(context);
  const origin = siteOrigin(env);
  const result = JSON.parse(await io.command(process.execPath, ['scripts/production-smoke.mjs', '--base', origin, '--timeout', String(settings.httpTimeoutMs)], env));
  publicChecks(result, origin);
  await io.redirects(origin);
  await io.assets(context, origin);
  return { checks: { public: true, security_headers: true, redirects: true, health: true,
    signed_in_redirects: true, asset_hashes: true, deleted_files_absent: true } };
}
cli(import.meta.url, 'postflight', postflight);
