import test from 'node:test';
import assert from 'node:assert/strict';
import { backup } from '../backup.mjs';
import { migrate } from '../migrate.mjs';
import { additiveObjects, forwardOnly } from '../forward-only.mjs';
import { operationsSourceHash } from '../../../lib/operations-artifacts.mjs';
import { capture, context } from './receipt.node.mjs';
import { backupVersions } from '../backup-versions.mjs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('forward-only gate accepts narrow additions and rejects destructive or unknown SQL', async () => {
  assert.deepEqual(additiveObjects('-- comment\nCREATE TABLE "Fixture" ("id" TEXT PRIMARY KEY); CREATE INDEX "Fixture_id" ON "Fixture" ("id"); ALTER TABLE "Fixture" ADD COLUMN "note" TEXT;'),[
    {kind:'table',name:'Fixture'},{kind:'index',name:'Fixture_id'},{kind:'column',table:'Fixture',name:'note'}]);
  for (const sql of ['DROP TABLE "User";', 'DELETE FROM "User";', 'ALTER TABLE "User" DROP COLUMN name;',
    'CREATE TABLE x AS SELECT 1;', 'CREATE TABLE x (id text DEFAULT secret());', 'DO $$ BEGIN END $$;',
    'ALTER TABLE x ADD COLUMN y text NOT NULL;', 'ALTER TABLE x ADD COLUMN y text, DROP COLUMN id;',
    'ALTER TABLE x ADD COLUMN y text PRIMARY KEY;', 'ALTER TABLE x ADD COLUMN y serial;',
    'CREATE TABLE x (a text); -- another statement\nTRUNCATE x;', 'CREATE OR REPLACE VIEW x AS SELECT 1;',
    '/* nested /* comment */ CREATE TABLE x (a text); */', 'CREATE INDEX x ON t (lower(name));']) assert.throws(() => additiveObjects(sql),sql);
  const previous = {migrations:[{name:'a',checksum:'1'}]}, candidate = {migrations:[...previous.migrations,{name:'b',checksum:'2'}]};
  assert.equal((await forwardOnly(context('migrate'),previous,candidate,async () => 'CREATE TABLE x (id text);')).length,1);
  await assert.rejects(forwardOnly(context('migrate'),previous,previous));
  await assert.rejects(forwardOnly(context('migrate'),previous,{migrations:[{name:'a',checksum:'changed'}]}));
});

test('backup wrapper emits only checksum after fresh, complete stored proof; every defect refuses', async () => {
  const env = {DATABASE_URL:'postgresql://fixture@localhost/fixture',BACKUP_S3_BUCKET:'synthetic-bucket',AWS_REGION:'us-east-1',BACKUP_S3_ACCOUNT_ID:'000000000000',BACKUP_S3_PREFIX:'fixture/'};
  const createdAt = new Date().toISOString(), at = Date.parse(createdAt);
  const key = 'fixture/synthetic.jitm-backup.enc';
  const proof = {status:'stored',bucket:env.BACKUP_S3_BUCKET,createdAt,sourceHash:operationsSourceHash(env.DATABASE_URL),manifestKey:`${key}.manifest.json`,
    objects:[key,`${key}.recovery-state.enc`,`${key}.manifest.json`].map(key => ({key,bytes:10,sha256:'a'.repeat(64)}))};
  const io = value => ({reviewedSource:async () => {},backupVersions:async () => {},command:async () => JSON.stringify(value)});
  const result = await capture('backup', c => backup(c,io(proof),env,() => at));
  assert.equal(result.code,0); assert.ok(!result.out[0].includes('bucket')); assert.ok(result.out[0].includes('backup_sha256'));
  for (const defect of [{status:'pending'},{createdAt:'2020-01-01T00:00:00.000Z'},{createdAt:new Date(at+1000).toISOString()},
    {sourceHash:'b'.repeat(64)},{objects:proof.objects.slice(0,2)},{manifestKey:'wrong'},
    {objects:proof.objects.map((v,i) => i ? v : {...v,sha256:'bad'})}]) {
    const failed = await capture('backup', c => backup(c,io({...proof,...defect}),env,() => at));
    assert.equal(failed.code,1); assert.equal(failed.out.length,0);
  }
  const failed = await capture('backup',c => backup(c,{...io(proof),command:async () => {throw new Error('private child failure');}},env,() => at));
  assert.equal(failed.code,1); assert.equal(failed.out.length,0);
  let captured = false;
  const oldClient = await capture('backup',c => backup(c,{...io(proof),backupVersions:async () => {throw new Error('old client');},command:async () => {captured=true;}},env,() => at));
  assert.equal(oldClient.code,1); assert.equal(oldClient.out.length,0); assert.equal(captured,false);
});

test('pg_dump version refuses older clients before capture and records numeric evidence',async () => {
  const directory=await mkdtemp(join(tmpdir(),'jitm-backup-versions-'));
  const env={JITM_RELEASE_JOB_EVIDENCE_DIR:directory};
  const io=major => ({command:async () => `pg_dump (PostgreSQL) ${major}.3\n`,withReadOnly:async fn => fn({query:async () => ({rows:[{server_version_num:'170010'}]})})});
  try {
    await assert.rejects(backupVersions(context('backup'),'synthetic',io(16),env));
    let evidence=JSON.parse(await readFile(join(directory,'1.1.backup.backup-versions.json'),'utf8'));
    assert.equal(evidence.pg_dump_major,16); assert.equal(evidence.server_major,17); assert.equal(evidence.compatible,false);
    for (const major of [17,18]) await backupVersions(context('backup'),'synthetic',io(major),env);
    evidence=JSON.parse(await readFile(join(directory,'1.1.backup.backup-versions.json'),'utf8'));
    assert.equal(evidence.compatible,true);
    await assert.rejects(backupVersions(context('backup'),'synthetic',{...io(18),command:async ()=>'unknown'},env));
  }finally{await rm(directory,{recursive:true,force:true});}
});

const migrationIO = () => ({reviewedSource:async () => ({previous:{},candidate:{}}),forwardOnly:async () => [{}],runtimeRole:async () => {},
  backupGrants:async () => {},withReadOnly:async fn => fn({}),noRecoveryHold:async () => {},migrations:async () => {},
  newObjects:async () => {},countsDigest:async () => 'f'.repeat(64),command:async () => '',schemaReady:async () => {}});
test('migration wrapper verifies before and after execution, refusing every unknown assertion',async () => {
  const events = [], io = migrationIO();
  for (const key of ['runtimeRole','backupGrants','command']) io[key] = async () => {events.push(key);};
  assert.equal((await capture('migrate',c => migrate(c,io))).code,0);
  assert.deepEqual(events,['runtimeRole','backupGrants','command','runtimeRole','backupGrants']);
  for (const key of Object.keys(io)) {
    const failed = await capture('migrate',c => migrate(c,{...migrationIO(),[key]:async () => {throw new Error('private failure');}}));
    assert.equal(failed.code,1,key); assert.equal(failed.out.length,0,key);
  }
  let countReads = 0;
  const drift = await capture('migrate',c => migrate(c,{...migrationIO(),countsDigest:async () => ++countReads === 1 ? 'f'.repeat(64) : 'e'.repeat(64)}));
  assert.equal(drift.code,1); assert.equal(drift.out.length,0);
});
