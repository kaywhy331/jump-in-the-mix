import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Client } from 'pg';
import { bind } from '../../candidate.mjs';
import { requiredChecks } from '../../workflow.mjs';
import { runJob } from '../receipt.mjs';
import * as reads from '../read-only.mjs';
import { workerGate } from '../worker_gate.mjs';
import { seed, assertFixture, removeFixture, withWrite, residue, marker } from '../synthetic.mjs';
import { smoke } from '../smoke.mjs';
import { cleanup } from '../cleanup.mjs';
import { grantRuntimeRole } from '../../../lib/runtime-database-role.mjs';
import { quoteIdentifier, databaseUrlWithDatabase } from '../../../lib/postgres-ops.mjs';

test('local PostgreSQL: real worker probe and synthetic lifecycle, including a failed browser', {skip:!process.env.RELEASE_TEST_ADMIN_URL},async()=>{
  const adminUrl=process.env.RELEASE_TEST_ADMIN_URL;
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(adminUrl).hostname));
  const suffix=randomUUID().replaceAll('-',''),name=`jitm_design_release_${suffix}`,role=`jitm_release_${suffix}`;
  const admin=new Client({connectionString:adminUrl});
  const ownerUrl=databaseUrlWithDatabase(adminUrl,name),runtime=new URL(ownerUrl);
  runtime.username=role;runtime.password=randomUUID();
  let owner,child;
  const original=process.env.DATABASE_URL;
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${quoteIdentifier(name)}`);
    await admin.query(`ALTER DATABASE ${quoteIdentifier(name)} SET timezone TO 'UTC'`);
    await admin.query(`CREATE ROLE ${quoteIdentifier(role)} LOGIN NOINHERIT PASSWORD '${runtime.password}'`);
    await reads.command(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{...process.env,DATABASE_URL:ownerUrl});
    owner=new Client({connectionString:ownerUrl});await owner.connect();
    await owner.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await owner.query(`REVOKE CREATE ON DATABASE ${quoteIdentifier(name)} FROM PUBLIC`);
    await grantRuntimeRole(owner,{role});
    process.env.DATABASE_URL=runtime.href;
    const sha=(await reads.git('rev-parse','HEAD')).trim(),schema=await reads.releaseSchema(sha);
    const source={previous:schema,candidate:schema};
    const baseline=await reads.withReadOnly(db=>reads.countsDigest(db,schema,schema));
    const base={candidate_sha:sha,previous_sha:sha,candidate_binding:await bind(process.cwd(),sha,sha),
      release_started_at:new Date().toISOString(),baseline_counts_sha256:baseline,receipt_prefix:'JITM_RELEASE_RECEIPT:'};
    const ctx=step=>({...base,operation_id:`2.1.${step}`,checks:requiredChecks[step]});
    // Source cleanliness is covered by S1 and the final CLI run; this fixture
    // isolates real queue/database behavior during development as well.
    const sourceIO={...reads,reviewedSource:async()=>source};
    const invoke=async(step,action,ok=true)=>{
      const out=[];
      let failure;
      const code=await runJob(step,async c=>{try{return await action(c);}catch(error){failure=error;throw error;}},{env:{JITM_RELEASE_CONTEXT:Buffer.from(JSON.stringify(ctx(step))).toString('base64')},stdout:x=>out.push(x),stderr:()=>{}});
      if(ok && code)assert.fail(failure?.stack ?? 'context rejected');
      assert.equal(code,ok?0:1,step);assert.equal(out.length,ok?1:0);
    };
    await owner.query(`INSERT INTO "Job" (id,task,payload,"updatedAt") VALUES ('bootstrap','jitm.release.probe.noop','{"type":"release-noop","operation_id":"2.0.worker_gate"}',now())`);
    child=spawn(process.execPath,['--import','tsx','src/worker/index.ts'],{stdio:'ignore',env:{...process.env,
      JITM_BUILD_SHA:sha,RENDER_GIT_COMMIT:'',TZ:'UTC',NODE_ENV:'production',APP_URL:'http://127.0.0.1:1',
      DATA_ENCRYPTION_KEY:randomUUID(),AUTH_RATE_LIMIT_SECRET:randomUUID(),RESEND_API_KEY:'',RESEND_RECOVERY_API_KEY:'',
      EMAIL_FROM:'',TWILIO_ACCOUNT_SID:'',TWILIO_AUTH_TOKEN:'',OPS_ALERT_WEBHOOK_URL:'',WORKER_DISPATCH_MODE:'off',
      WEB_PUSH_VAPID_PRIVATE_KEY:'',WEB_PUSH_VAPID_PUBLIC_KEY:'',NETLIFY_WORKER_SECRET:''}});
    const deadline=Date.now()+20000;
    while(!(await owner.query('SELECT 1 FROM "Job" WHERE id=\'bootstrap\' AND "completedAt" IS NOT NULL')).rowCount && Date.now()<deadline) await new Promise(r=>setTimeout(r,100));
    assert.equal((await owner.query('DELETE FROM "Job" WHERE id=\'bootstrap\' AND "completedAt" IS NOT NULL')).rowCount,1);
    while((await owner.query('SELECT 1 FROM "Job" WHERE "completedAt" IS NULL AND "failedAt" IS NULL')).rowCount && Date.now()<deadline)await new Promise(r=>setTimeout(r,100));
    assert.equal((await owner.query('SELECT 1 FROM "Job" WHERE "completedAt" IS NULL AND "failedAt" IS NULL')).rowCount,0);
    // A blank database initializes operational defaults on the first worker
    // pass. Establish the fixture baseline after that pass, before the probe.
    base.baseline_counts_sha256=await reads.withReadOnly(db=>reads.countsDigest(db,schema,schema));
    const {workerState,queueProbe}=await import('../worker_gate.mjs');
    const workerIO={...sourceIO,workerState,queueProbe};
    await invoke('worker_gate',c=>workerGate(c,workerIO));
    assert.equal((await owner.query('SELECT 1 FROM "Job" WHERE starts_with(task,\'jitm.release.probe.\')')).rowCount,0);
    await owner.query(`INSERT INTO "WorkerHeartbeat" (id,"workerId",status,"updatedAt") VALUES ('old','old','RUNNING',now())`);
    await invoke('worker_gate',c=>workerGate(c,workerIO),false);
    await owner.query('DELETE FROM "WorkerHeartbeat" WHERE id=\'old\'');
    let browserAttempted=false;
    const smokeIO={...sourceIO,seed,assertFixture,removeFixture,browserSmoke:async()=>{browserAttempted=true;throw Error('deliberate browser failure');}};
    await invoke('smoke',c=>smoke(c,smokeIO),false);
    assert.equal(browserAttempted,true);
    await reads.withReadOnly(db=>residue(db,marker(ctx('smoke'))));
    await invoke('cleanup',c=>cleanup(c,{...sourceIO,removeFixture,residue}));
    await invoke('cleanup',c=>cleanup(c,{...sourceIO,removeFixture,residue}));
    const fixture=await seed(ctx('smoke'));
    await assert.rejects(seed(ctx('smoke')));
    await reads.withReadOnly(db=>assertFixture(db,ctx('smoke')));
    await withWrite(db=>db.query('INSERT INTO "ContactEmail" (id,"contactId",email,normalized) VALUES ($1,$2,\'recipient@example.invalid\',\'recipient@example.invalid\')',[`${fixture.id}email`,`${fixture.id}contact`]));
    await assert.rejects(reads.withReadOnly(db=>assertFixture(db,ctx('smoke'))));
    await removeFixture(ctx('cleanup'));
    if(process.env.RELEASE_TEST_CLI==='true') {
      for(const step of ['worker_gate','cleanup']) {
        const output=await reads.command(process.execPath,[`scripts/release/jobs/${step}.mjs`],{...process.env,JITM_RELEASE_CONTEXT:Buffer.from(JSON.stringify(ctx(step))).toString('base64')});
        assert.equal(output.trim().split('\n').length,1);
        assert.ok(output.startsWith(base.receipt_prefix));
      }
    }
    if(process.env.RELEASE_TEST_BROWSER==='true') {
      const {withBrowserFixture}=await import('./browser-fixture.mjs');
      await withBrowserFixture(ctx('smoke'),browserSmoke=>invoke('smoke',c=>smoke(c,{...smokeIO,browserSmoke})));
    }
    assert.equal(await reads.withReadOnly(db=>reads.countsDigest(db,schema,schema)),base.baseline_counts_sha256);
  } finally {
    if(child && child.exitCode===null){ const stopped=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await stopped; }
    if(original===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=original;
    await owner?.end();await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE)`);
    await admin.query(`DROP ROLE IF EXISTS ${quoteIdentifier(role)}`);await admin.end();
  }
});
