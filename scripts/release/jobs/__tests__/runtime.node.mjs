import test from 'node:test';
import assert from 'node:assert/strict';
import { postflight, publicChecks, siteOrigin } from '../postflight.mjs';
import { workerGate, workerState } from '../worker_gate.mjs';
import { smoke } from '../smoke.mjs';
import { cleanup } from '../cleanup.mjs';
import { capture, context } from './receipt.node.mjs';
import { requiredChecks } from '../../workflow.mjs';
import { releasePlan } from '../smoke-browser.mjs';
import { git } from '../read-only.mjs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const done = async () => {};
test('postflight refuses missing, skipped, duplicate, false or foreign public checks', () => {
  const ids=['live','ready','worker','page:/','page:/login','page:/faq','page:/terms','page:/privacy','page:/for/contractors','redirect:/jumps','redirect:/contacts','redirect:/mixes','redirect:/journey','redirect:/more','csp','nonce','hsts','x-frame-options'];
  const result={base:'https://example.invalid',total:ids.length,passed:ids.length,failed:0,skipped:0,checks:ids.map(id=>({id,ok:true}))};
  publicChecks(result,result.base);
  for (const changes of [{base:'https://wrong.invalid'},{skipped:1},{failed:1},{checks:[]},
    {checks:result.checks.map((c,i)=>i===0?{...c,ok:false}:c)},
    {checks:result.checks.map((c,i)=>i===0?result.checks[1]:c)}]) assert.throws(()=>publicChecks({...result,...changes},result.base));
  assert.equal(siteOrigin({JITM_RELEASE_SITE_URL:result.base}),result.base);
  for (const url of ['https://user:password@example.invalid','https://example.invalid/path','file:///tmp/test']) assert.throws(()=>siteOrigin({JITM_RELEASE_SITE_URL:url}));
});

test('worker gate succeeds only after bound heartbeat, probe, unchanged counts and removal',async()=>{
  const db={query:async()=>({rowCount:0})};
  const io={reviewedSource:async()=>({previous:{},candidate:{}}),withReadOnly:async f=>f(db),noRecoveryHold:done,
    workerState:async()=> 'worker-1',countsDigest:async()=>context().baseline_counts_sha256 ?? 'f'.repeat(64),queueProbe:done};
  assert.equal((await capture('worker_gate',c=>workerGate(c,io))).code,0);
  for (const key of Object.keys(io)) {
    const out=await capture('worker_gate',c=>workerGate(c,{...io,[key]:async()=>{throw Error('private');}}));
    assert.equal(out.code,1,key); assert.equal(out.out.length,0);
  }
  assert.equal((await capture('worker_gate',c=>workerGate(c,{...io,countsDigest:async()=> '0'.repeat(64)}))).code,1);
});

test('worker state refuses wrong commit, stale/future heartbeat, old running instance and held old lease',async()=>{
  const c=context('worker_gate');
  const row={workerId:'worker-1',startedAt:new Date(c.release_started_at),metadata:{commit:c.candidate_sha},age:1};
  const db=(rows,locked=0)=>({query:async sql=>sql.includes('WorkerHeartbeat')?{rows}:{rowCount:locked}});
  assert.equal(await workerState(db([row]),c),'worker-1');
  for (const rows of [[],[row,row],[{...row,age:60001}],[{...row,age:-1}],[{...row,metadata:{}}],[{...row,startedAt:new Date(0)}]]) await assert.rejects(workerState(db(rows),c));
  await assert.rejects(workerState(db([row],1),c));
});

test('smoke always cleans its successful seed, including browser/assertion/receipt failures',async()=>{
  let removed=0;
  const io={reviewedSource:done,seed:async()=>({}),withReadOnly:async f=>f({}),assertFixture:done,
    browserSmoke:async()=>Object.fromEntries(requiredChecks.smoke.map(k=>[k,true])),removeFixture:async()=>{removed++;}};
  assert.equal((await capture('smoke',c=>smoke(c,io))).code,0); assert.equal(removed,1);
  for (const key of ['withReadOnly','assertFixture','browserSmoke','removeFixture']) {
    removed=0;
    const result=await capture('smoke',c=>smoke(c,{...io,[key]:async()=>{if(key==='removeFixture')removed++;throw Error('private');}}));
    assert.equal(result.code,1,key); assert.equal(result.out.length,0); assert.equal(removed,1);
  }
  removed=0;
  assert.equal((await capture('smoke',c=>smoke(c,{...io,seed:async()=>{throw Error('collision');}}))).code,1);
  assert.equal(removed,0,'a collision never authorizes deleting an existing account');
});

test('standalone cleanup emits one receipt only after removal is verified',async()=>{
  const io={reviewedSource:done,removeFixture:done,withReadOnly:async f=>f({}),residue:done};
  assert.equal((await capture('cleanup',c=>cleanup(c,io))).out.length,1);
  for(const key of Object.keys(io)) assert.equal((await capture('cleanup',c=>cleanup(c,{...io,[key]:async()=>{throw Error();}}))).code,1);
});

test('reviewed browser plan binds both commits and covers the complete changed path set',async()=>{
  const candidate_sha=(await git('rev-parse','HEAD')).trim(),previous_sha=(await git('rev-parse','HEAD^')).trim();
  const changed_paths=(await git('diff','--name-only','-z',previous_sha,candidate_sha)).split('\0').filter(Boolean);
  const plan={candidate_sha,previous_sha,review_ref:'synthetic-review',changed_paths,
    scenarios:[{path:'/jumps',selector:'h1',text:'Today',covers:changed_paths}]};
  const directory=await mkdtemp(join(tmpdir(),'jitm-plan-')),file=join(directory,'plan.json');
  try {
    await writeFile(file,JSON.stringify(plan));
    assert.deepEqual(await releasePlan({candidate_sha,previous_sha},{JITM_RELEASE_SMOKE_PLAN:file}),plan);
    for(const changes of [{candidate_sha:'0'.repeat(40)},{previous_sha:'0'.repeat(40)},{changed_paths:[]},{scenarios:[]},
      {scenarios:[{...plan.scenarios[0],covers:[]}]},{scenarios:[{...plan.scenarios[0],path:'//elsewhere.invalid'}]}]) {
      await writeFile(file,JSON.stringify({...plan,...changes}));
      await assert.rejects(releasePlan({candidate_sha,previous_sha},{JITM_RELEASE_SMOKE_PLAN:file}));
    }
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('postflight wrapper never accepts command or asset failure',async()=>{
  const env={JITM_RELEASE_SITE_URL:'https://example.invalid'};
  for(const failure of ['reviewedSource','command','assets']) {
    const io={reviewedSource:done,command:async()=> '{}',assets:done,[failure]:async()=>{throw Error('private');}};
    assert.equal((await capture('postflight',c=>postflight(c,io,env))).code,1);
  }
});
