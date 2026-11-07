import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { Providers } from './providers.mjs';
import { settings } from './settings.mjs';
import { GitLedger, assertNoUnresolved } from '../ledger.mjs';
import { performOperation, requiredChecks, checkReceipt } from '../workflow.mjs';
import { awsStub } from './aws-stub.mjs';

const candidate='a'.repeat(40),previous='b'.repeat(40);
function fixture(fault,executeJob=async()=>({code:0,stdout:'receipt\n'})) {
  const config={...settings,main_branch:settings.mainBranch,ledger_branch:settings.ledgerBranch,ledger_file:settings.ledgerFile,
    render_api_url:settings.renderOrigin,render_owner_id:'synthetic-owner',site_url:settings.siteOrigin,receipt_prefix:'receipt',
    jobs:{preflight:{command:'node scripts/release/jobs/preflight.mjs'}}};
  const provider=new Providers({settings:config,candidate,previous,names:{web:'web',worker:'worker'},executeJob,
    deploy:async()=>{},health:async()=>new Response('healthy'),fault});
  const api=async(path,options={})=>{
    const response=await provider.fetch(`${settings.githubOrigin}/repos/${settings.repository}/${path}`,
      {...options,body:options.body ? JSON.stringify(options.body) : undefined});
    if (response.status === 404 && options.allow404) return null;
    assert.equal(response.status,200);return response.json();
  };
  const ledger=new GitLedger(api,{branch:settings.ledgerBranch,file:settings.ledgerFile,bootstrap:true});
  const request={operation_id:'1.1.preflight',candidate_sha:candidate,step:'preflight',render_deploy_id:null,status:'requested',
    evidence:{operation_kind:'job',service_id:settings.operator},at:new Date().toISOString()};
  const context={operation_id:request.operation_id,candidate_sha:candidate};
  const startCommand=`JITM_RELEASE_CONTEXT=${Buffer.from(JSON.stringify(context)).toString('base64')} ${config.jobs.preflight.command}`;
  const invoke=async()=>{
    const response=await provider.fetch(`${settings.renderOrigin}/services/${settings.operator}/jobs`,{method:'POST',body:JSON.stringify({startCommand})});
    return response.json();
  };
  return {provider,ledger,request,invoke};
}

test('GitHub ref stub persists the real ledger and refuses a sibling ref update',async()=>{
  const {provider,ledger,request}=fixture();
  await ledger.append(request);
  assert.equal((await ledger.read()).text,JSON.stringify(request)+'\n');
  const stale=await ledger.read();
  await ledger.append({...request,status:'unresolved'});
  const next=stale.text+JSON.stringify({...request,status:'unresolved'})+'\n';
  // Different body creates an actual sibling commit, not the already accepted commit.
  await assert.rejects(ledger.write(stale,next.replace('"evidence":{','"evidence":{"other":true,')));
  assert.equal(provider.ledger().length,2);
});

test('accepted job response loss stays unresolved and prevents a second request',async()=>{
  const {provider,ledger,request,invoke}=fixture('lost-response');
  await assert.rejects(performOperation({ledger,request,invoke,observe:async()=>assert.fail('Lost ID cannot be observed')}));
  const rows=provider.ledger();
  assert.equal(rows.at(-1).status,'unresolved');assert.equal(rows.at(-1).render_deploy_id,null);
  assert.equal(provider.jobs.size,1);assert.throws(()=>assertNoUnresolved(rows));
  await assert.rejects(ledger.append({...request,operation_id:'1.1.backup',step:'backup'}));
  assert.equal(provider.calls.filter(c=>c.method === 'POST' && c.path.endsWith('/jobs')).length,1);
});

test('provider refuses a job without the write-ahead entry and any unknown origin',async()=>{
  const {provider,invoke}=fixture();await assert.rejects(invoke);
  await assert.rejects(provider.fetch('https://example.invalid/services/synthetic/jobs'));
});

test('successful transport job returns one bound receipt through logs',async()=>{
  const receipt={operation_id:'1.1.preflight',candidate_sha:candidate,checks:Object.fromEntries(requiredChecks.preflight.map(k=>[k,true]))};
  const {provider,ledger,request,invoke}=fixture(undefined,async()=>({code:0,stdout:`receipt${JSON.stringify(receipt)}\n`}));
  await ledger.append(request);const {id}=await invoke();
  const response=await provider.fetch(`${settings.renderOrigin}/logs?ownerId=synthetic-owner&resource=${id}`);
  const {logs}=await response.json();assert.equal(logs.length,1);
  checkReceipt(JSON.parse(logs[0].message.slice('receipt'.length)),'preflight',request.operation_id,candidate);
});

test('object stub stores bytes, refuses overwrite and detects changed stored bytes',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'catalog-object-test-'));
  try {
    const input=join(directory,'capture'); const data=randomBytes(128);await writeFile(input,data);
    const checksum=createHash('sha256').update(data).digest('base64');
    const args=['s3api','put-object','--key','qualification/capture.enc','--body',input,'--if-none-match','*','--server-side-encryption','AES256','--checksum-sha256',checksum];
    await awsStub(args,directory);await assert.rejects(awsStub(args,directory));
    const head=['s3api','head-object','--key','qualification/capture.enc','--checksum-mode','ENABLED'];
    assert.equal((await awsStub(head,directory)).ChecksumSHA256,checksum);
    await writeFile(join(directory,'qualification/capture.enc'),randomBytes(data.length));
    assert.notEqual((await awsStub(head,directory)).ChecksumSHA256,checksum);
    await assert.rejects(awsStub([...head.slice(0,3),'../escape','--checksum-mode','ENABLED'],directory));
  } finally { await rm(directory,{recursive:true,force:true}); }
});
