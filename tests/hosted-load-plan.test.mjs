import { randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, chmod, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isolatedLoadEnvironment, loadSourceHash, loadWorkerConfiguration, readPrivateLoadPlan, validateHostedLoadPlan } from '../scripts/lib/hosted-load-plan.mjs';
import { seedCustomerLoadFixture } from '../scripts/lib/customer-load-fixture.mjs';

const sourceUrl = 'postgresql://source_owner:owner-secret@127.0.0.1:5432/jitm_design_source?schema=public';
const plan = () => ({ version: 1, id: randomBytes(6).toString('hex'), token: randomBytes(32).toString('hex'), sourceUrl, sourceHash: loadSourceHash(sourceUrl), port: 3047, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(), profile: { accounts: 2, contactsPerAccount: 100, historyPerContact: 2, mixesPerAccount: 10, beatsPerMix: 6 } });

describe('private hosted load boundaries', () => {
  it('derives a fixture-only worker credential without forwarding owner or provider secrets', () => {
    const input = plan(), config = loadWorkerConfiguration(input);
    expect(JSON.stringify(config)).not.toContain('owner-secret');
    expect(JSON.stringify(config)).not.toContain(input.token);
    const env = isolatedLoadEnvironment(config, { PATH: '/usr/bin', DATABASE_URL: sourceUrl, MIGRATION_DATABASE_URL: sourceUrl, AWS_SECRET_ACCESS_KEY: 'production-secret', RESEND_API_KEY: 'production-secret', OPS_ALERT_SNS_TOPIC_ARN: 'production-secret', NODE_OPTIONS: '--require unsafe-module', HOME: '/production-home', DOTENV_CONFIG_PATH: '.env.deploy.local' });
    expect(env).toMatchObject({ HOSTNAME: '127.0.0.1', DATABASE_URL: config.runtimeUrl, RESEND_API_KEY: '', OPS_ALERT_SNS_TOPIC_ARN: '', DOTENV_CONFIG_PATH: '/dev/null', WORKER_DISPATCH_MODE: 'off' });
    for (const key of ['AWS_SECRET_ACCESS_KEY', 'MIGRATION_DATABASE_URL', 'NODE_OPTIONS', 'HOME']) expect(env).not.toHaveProperty(key);
    expect(JSON.stringify(env)).not.toContain('production-secret');
  });
  it('requires matching source identity and an exact commit for remote execution', () => {
    const input = plan(); input.sourceUrl = input.sourceUrl.replace('127.0.0.1', 'database.example.test');
    expect(() => validateHostedLoadPlan(input)).toThrow('source identity');
    input.sourceHash = loadSourceHash(input.sourceUrl);
    expect(() => validateHostedLoadPlan(input)).toThrow('exact deployed commit');
    input.expectedCommit = 'a'.repeat(40);
    expect(validateHostedLoadPlan(input)).toBe(input);
    expect(() => isolatedLoadEnvironment({ ...loadWorkerConfiguration(input), expectedCommit: undefined })).toThrow('exact deployed commit');
  });
  it.each(['postgres', 'template0', 'template1', '%70ostgres', '', 'bad%2Fname'])('rejects unsafe source database %s', database => {
    const input = plan(), url = new URL(input.sourceUrl); url.pathname = '/' + database;
    input.sourceUrl = url.href; input.sourceHash = loadSourceHash(url.href);
    expect(() => validateHostedLoadPlan(input)).toThrow();
  });
  it.each(['host=remote', 'database=customers', 'user=owner', 'password=leaked', 'options=-csearch_path=private', 'sslkey=/private/key', 'schema=public&schema=private'])('rejects driver target overrides: %s', query => {
    const input = plan(); input.sourceUrl += '&' + query; input.sourceHash = loadSourceHash(input.sourceUrl);
    expect(() => validateHostedLoadPlan(input)).toThrow('Invalid isolated database');
    const config = loadWorkerConfiguration(plan()); config.runtimeUrl += '&' + query;
    expect(() => isolatedLoadEnvironment(config)).toThrow('Invalid isolated database');
  });
  it('rejects reused target identity, expired runs and oversized fixtures', () => {
    const input = plan(), target = new URL(input.sourceUrl); target.pathname = `/jitm_design_load_${input.id}`;
    expect(() => validateHostedLoadPlan({ ...input, sourceUrl: target.href, sourceHash: loadSourceHash(target.href) })).toThrow('source identity');
    for (const offset of [-1, 91 * 60_000]) {
      const expiresAt = new Date(Date.now() + offset).toISOString();
      expect(() => validateHostedLoadPlan({ ...input, expiresAt })).toThrow('runtime limits');
      expect(() => isolatedLoadEnvironment({ ...loadWorkerConfiguration(input), expiresAt })).toThrow('runtime limits');
    }
    expect(() => validateHostedLoadPlan({ ...input, profile: { ...input.profile, accounts: 10, contactsPerAccount: 5000, historyPerContact: 100 } })).toThrow('600,000');
    expect(() => isolatedLoadEnvironment({ ...loadWorkerConfiguration(input), runtimeUrl: input.sourceUrl })).toThrow();
  });
  it('refuses public or symlinked private plans', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jitm-load-plan-'));
    try {
      const file = join(directory, 'plan.json'), input = plan();
      await writeFile(file, JSON.stringify(input), { mode: 0o600 });
      expect(await readPrivateLoadPlan(file)).toEqual(input);
      await chmod(file, 0o644); await expect(readPrivateLoadPlan(file)).rejects.toThrow('private regular file');
      await chmod(file, 0o600); await symlink(file, join(directory, 'link.json'));
      await expect(readPrivateLoadPlan(join(directory, 'link.json'))).rejects.toThrow();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('refuses fixture seeding on the wrong or populated target before writing', async () => {
    const queries = [], input = plan(), database = `jitm_design_load_${input.id}`;
    const db = { query: async sql => { queries.push(sql); return { rows: [{ name: 'source_database' }], rowCount: 1 }; } };
    await expect(seedCustomerLoadFixture(db, { database, profile: input.profile })).rejects.toThrow('owned target');
    expect(queries).toEqual(['SELECT current_database() AS name']);
    db.query = async sql => { queries.push(sql); return { rows: [{ name: database }], rowCount: 1 }; };
    await expect(seedCustomerLoadFixture(db, { database, profile: input.profile })).rejects.toThrow('no accounts');
    expect(queries.every(sql => sql.startsWith('SELECT '))).toBe(true);
  });
});
