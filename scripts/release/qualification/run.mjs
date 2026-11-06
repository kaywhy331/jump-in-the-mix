import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, readdir, chmod } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { bind, digest } from '../candidate.mjs';
import { run, requiredChecks } from '../workflow.mjs';
import { assertNoUnresolved, verify, pending } from '../ledger.mjs';
import { settings as defaults } from './settings.mjs';
import { Providers } from './providers.mjs';

const group=process.argv[2];
assert.ok(Object.hasOwn(defaults.groups,group),'Use code, migration or reversible');
const root=process.cwd(), output=resolve('.artifacts/release-qualification',`${group}-${randomUUID()}`);
await mkdir(output,{recursive:true,mode:0o700});
const source=join(output,'candidate'), sourceContext=join(output,'release-source'), webContext=join(output,'release-web');
const secrets=[];
function redact(text) {
  for (const value of secrets) text=text.replaceAll(value,'[synthetic value redacted]');
  return text.replace(/postgres(?:ql)?:\/\/[^\s"']+/g,'[database URL redacted]');
}
async function cmd(file,args,{cwd=root,env=process.env,allowed=false}={}) {
  try { const result=await promisify(execFile)(file,args,{cwd,env,timeout:defaults.commandTimeoutMs,maxBuffer:16*1024*1024,encoding:'utf8'}); return {...result,code:0}; }
  catch(error) {
    if (allowed) return {stdout:error.stdout ?? '',stderr:error.stderr ?? '',code:typeof error.code === 'number' ? error.code : 1};
    console.error(redact((error.stderr ?? '').slice(-4000)));
    throw Error(`${file} ${args[0]} exited ${error.code}`);
  }
}
const git=async(...args)=>(await cmd('git',args,{cwd:source})).stdout.trim();
const random=()=>{const value=randomBytes(32).toString('hex');secrets.push(value);return value;};
const qualifiedSha=(await cmd('git',['rev-parse','HEAD'])).stdout.trim();
assert.equal((await cmd('git',['status','--porcelain','--untracked-files=no'])).stdout.trim(),'','Commit the candidate before qualification');
await cmd('docker',['version']); await cmd('docker',['compose','version']);
await cmd('git',['clone','--no-hardlinks','--quiet',root,source]);
await git('config','user.name','Synthetic qualification'); await git('config','user.email','qualification@example.invalid');
// Fetches made by workflow.mjs are confined to this local clone, even if a stub
// bug returns an unexpected SHA. No provider remote or credential is copied.
await git('remote','set-url','origin',source);
const previous=await git('rev-parse','HEAD');
await writeFile(join(source,'qualification-change.txt'),'Synthetic code-only release marker.\n');
if (group !== 'code') {
  const migrations=join(source,'prisma/migrations');
  const last=(await readdir(migrations,{withFileTypes:true})).filter(e=>e.isDirectory()).map(e=>e.name).sort().at(-1);
  const path=join(migrations,`${last}_qualification`); await mkdir(path);
  await writeFile(join(path,'migration.sql'),'CREATE TABLE "QualificationObject" ("id" TEXT NOT NULL, CONSTRAINT "QualificationObject_pkey" PRIMARY KEY ("id"));\n'+(group === 'reversible' ? 'DROP TABLE "User" CASCADE;\n' : ''));
  await writeFile(join(source,'prisma/qualification.prisma'),'model QualificationObject {\n  id String @id\n}\n');
}
await git('add','qualification-change.txt','prisma'); await git('commit','-m',`Synthetic ${group} candidate`);
const candidate=await git('rev-parse','HEAD');
const binding=await bind(source,candidate,candidate);
const changed=(await git('diff','--name-only',previous,candidate)).split('\n').filter(Boolean);
await mkdir(sourceContext); await mkdir(webContext);
const plan={candidate_sha:candidate,previous_sha:previous,review_ref:'synthetic-qualification-plan',changed_paths:changed,
  scenarios:[{path:'/jumps',selector:'h1',text:'Today',covers:changed}]};
await writeFile(join(sourceContext,'smoke-plan.json'),JSON.stringify(plan));
await git('bundle','create',join(sourceContext,'catalog.bundle'),'HEAD');
const previousDirectory=join(output,'previous'); await mkdir(previousDirectory);
const archive=join(output,'previous.tar'); await git('archive','--output',archive,previous,'prisma');
await cmd('tar',['-xf',archive,'-C',previousDirectory]);

const project=`catalog-${group}-${randomUUID().slice(0,8)}`;
const images=Object.fromEntries(['web','worker','previous-web','previous-worker','operator'].map(name=>[name,`${project}-${name}:local`]));
console.log(`QUALIFY ${qualifiedSha} ${group}: build actual web and worker images`);
for (const [name,target] of [['web','production'],['worker','worker']]) {
  await cmd('docker',['build','--target',target,'-t',images[`previous-${name}`],'.']);
  await cmd('docker',['build','--target',target,'-t',images[name],'.'],{cwd:source});
}
const exportId=(await cmd('docker',['create',images.web])).stdout.trim();
try { await cmd('docker',['cp',`${exportId}:/app/.next/static`,join(webContext,'static')]); }
finally { await cmd('docker',['rm',exportId]); }
await writeFile(join(webContext,'candidate-sha'),candidate+'\n');
await cmd('docker',['build','-f','infra/operations/release.Dockerfile',
  '--build-context',`release_source=${sourceContext}`,'--build-context',`release_web=${webContext}`,
  '--build-arg',`RELEASE_CANDIDATE_SHA=${candidate}`,'--build-arg',`RELEASE_PREVIOUS_SHA=${previous}`,
  '--build-arg',`RELEASE_APPROVED_MAIN_SHA=${candidate}`,'--build-arg',`POSTGRES_CLIENT_MAJOR=${defaults.postgresClientMajor}`,
  '-t',images.operator,'.'],{cwd:source});
const wrapper=join(output,'bin'); await mkdir(wrapper);
await writeFile(join(wrapper,'aws'),'#!/bin/sh\nexec node /app/scripts/release/qualification/aws-stub.mjs "$@"\n',{mode:0o755});
const reports=[];
const originalFetch=globalThis.fetch;
for (const [index,fault] of defaults.groups[group].entries()) {
  const directory=join(output,fault); await mkdir(directory);
  const evidence=join(directory,'evidence'), store=join(directory,'objects');
  for (const path of [evidence,store]) {await mkdir(path);await chmod(path,0o777);}
  const urls={};
  for (const [key,role] of [['owner','jitm'],['runtime','qualification_runtime'],['backup','qualification_backup']]) {
    const url=new URL('postgresql://postgres:5432/jitm');url.username=role;url.password=random();url.searchParams.set('schema','public');urls[key]=url.href;
  }
  // Compose never inherits optional provider credentials from the invoking host.
  const env={...Object.fromEntries(['PATH','HOME','TMPDIR'].filter(k=>process.env[k]).map(k=>[k,process.env[k]])),
    POSTGRES_PASSWORD:new URL(urls.owner).password,APP_PORT:'0',APP_URL:defaults.siteOrigin,
    AUTH_RATE_LIMIT_SECRET:random(),DATA_ENCRYPTION_KEY:random(),BACKUP_ENCRYPTION_KEY:random(),
    COMPOSE_PROJECT_NAME:project,COMPOSE_ANSI:'never'};
  const common={DATABASE_URL:urls.runtime,APP_URL:defaults.siteOrigin,AUTH_ALLOWED_ORIGINS:defaults.siteOrigin,
    WORKER_DISPATCH_MODE:'off',RESEND_API_KEY:'',RESEND_RECOVERY_API_KEY:'',TWILIO_ACCOUNT_SID:'',TWILIO_AUTH_TOKEN:'',
    EMAIL_FROM:'',OPS_ALERT_WEBHOOK_URL:'',WEB_PUSH_VAPID_PUBLIC_KEY:'',WEB_PUSH_VAPID_PRIVATE_KEY:'',NETLIFY_WORKER_SECRET:''};
  const runtime={...common,NODE_ENV:'production',PILOT_MODE:'true',DEMO_MODE:'false',AUTH_REQUIRE_EMAIL_VERIFICATION:'false',AUTH_REQUIRE_ADMIN_MFA:'false',
    AUTH_RATE_LIMIT_SECRET:env.AUTH_RATE_LIMIT_SECRET,DATA_ENCRYPTION_KEY:env.DATA_ENCRYPTION_KEY};
  const override=join(directory,'compose.json');
  const operator={image:images.operator,network_mode:'service:proxy',environment:{...runtime,
    MIGRATION_DATABASE_URL:urls.owner,BACKUP_DATABASE_URL:urls.backup,BACKUP_ENCRYPTION_KEY:env.BACKUP_ENCRYPTION_KEY,
    BACKUP_S3_BUCKET:defaults.bucket,AWS_REGION:defaults.region,BACKUP_S3_ACCOUNT_ID:defaults.accountId,BACKUP_S3_PREFIX:defaults.backupPrefix,
    PATH:'/qualification-bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',QUALIFICATION_S3_DIRECTORY:'/qualification-objects',
    JITM_RELEASE_SITE_URL:defaults.siteOrigin,JITM_RELEASE_EXPECTED_CLIENT_IP:defaults.clientAddress,
    QUALIFICATION_FAULT:fault,NODE_OPTIONS:'--import /app/scripts/release/qualification/fault-clock.mjs'},
    volumes:[`${wrapper}:/qualification-bin:ro`,`${store}:/qualification-objects`,`${evidence}:/var/lib/jitm-release`,
      `${previousDirectory}:/previous:ro`,`${sourceContext}/smoke-plan.json:/var/lib/jitm-release/smoke-plan.json:ro`]};
  const config={services:{web:{image:images['previous-web'],environment:common},worker:{image:images['previous-worker'],environment:{...common,JITM_BUILD_SHA:previous}},
    proxy:{image:images.worker,command:['node','scripts/release/qualification/proxy.mjs']},operator},
    networks:{default:{internal:true}}};
  await writeFile(override,JSON.stringify(config),{mode:0o600});
  const compose=async(...args)=>cmd('docker',['compose','-p',project,'-f',join(source,'docker-compose.yml'),'-f',join(source,'compose.pilot.yml'),'-f',override,...args],{cwd:source,env});
  const fixture=async(action,allowed=false)=>cmd('docker',['compose','-p',project,'-f',join(source,'docker-compose.yml'),'-f',join(source,'compose.pilot.yml'),'-f',override,
    'run','--rm','--no-deps','-T','operator','node','scripts/release/qualification/database.mjs',action],{cwd:source,env,allowed});
  let stage='startup', provider;
  console.log(`CASE ${fault}: starting fresh pilot database`);
  try {
    await compose('up','-d','--no-deps','--wait','postgres','proxy');
    await fixture('setup');
    await compose('up','-d','--no-deps','--wait','web','worker');
    const deadline=Date.now()+defaults.startupTimeoutMs;
    while ((await fixture('idle',true)).code !== 0) {assert.ok(Date.now()<deadline,'Worker did not settle');await delay(1000);}
    const names=Object.fromEntries([...(await readFile(join(source,'render.yaml'),'utf8')).matchAll(/^  - type: (web|worker)\n    name: ([A-Za-z0-9_-]+)$/gm)].map(m=>[m[1],m[2]]));
    const jobs=Object.fromEntries(Object.keys(requiredChecks).map(step=>[step,{service_id:defaults.operator,
      command:`node ${step === 'smoke' ? '--import tsx ' : ''}scripts/release/jobs/${step}.mjs`,review_ref:'synthetic-reviewed-catalog',...(step === 'migrate' ? {forward_only:true} : {})}]));
    const settings={...defaults,main_branch:defaults.mainBranch,ledger_branch:defaults.ledgerBranch,ledger_file:defaults.ledgerFile,
      concurrency_group:'synthetic',production_environment:'synthetic-contract-only',production_tag_prefix:'synthetic-release-',record_branch_prefix:'synthetic-record-',
      releaser_prefix:'synthetic-releaser-',render_api_url:defaults.renderOrigin,render_owner_id:'synthetic-owner',site_url:defaults.siteOrigin,
      request_timeout_ms:defaults.requestTimeoutMs,operation_timeout_ms:defaults.operationTimeoutMs,poll_interval_ms:defaults.pollIntervalMs,
      health_paths:['/api/health/live','/api/health/ready','/api/health/worker'],receipt_prefix:defaults.receiptPrefix,
      record_directory:'.artifacts/qualification-records',ledger_bootstrap_run:String(index+1),jobs};
    const migration=group === 'code' ? 'none' : 'migrate';
    const approval={candidate:binding,release_name:`Synthetic ${fault}`,migration_job:migration,reviewed_jobs_sha256:digest(JSON.stringify(jobs)),
      tier3:{passed:true,reference:'synthetic approval fixture; not production evidence'},review_ref:'synthetic approval fixture',pull_requests:['synthetic'],previous_sha:previous,
      previous_tag:'synthetic-previous',dependencies:'synthetic',changes:'Qualification only',rollback:'Discard synthetic database',owner_followups:'None in fixture',not_run:'Production',carried_followups:'Rehearsal h'};
    const workflowEnv={RELEASE_SETTINGS_JSON:JSON.stringify(settings),RELEASE_APPROVAL_JSON:JSON.stringify(approval),CANDIDATE_SHA:candidate,
      RELEASE_NAME:approval.release_name,MIGRATION_JOB:migration,GITHUB_RUN_ID:String(index+1),GITHUB_RUN_ATTEMPT:'1',GITHUB_EVENT_NAME:'workflow_dispatch',
      GITHUB_REF:'refs/tags/synthetic-releaser-fixture',GITHUB_SHA:candidate,GITHUB_API_URL:defaults.githubOrigin,GITHUB_REPOSITORY:defaults.repository,
      GH_TOKEN:random(),RENDER_API_KEY:random(),GITHUB_STEP_SUMMARY:join(directory,'summary.md')};
    provider=new Providers({settings,candidate,previous,names,fault,
      health:async(url)=>{
        // Internal Docker networks intentionally have no host-published port.
        // Make the exact health request from the proxy's network namespace.
        const result=await compose('exec','-T','proxy','node','-e',
          'fetch(process.argv[1],{redirect:"error",signal:AbortSignal.timeout(Number(process.argv[2]))}).then(async r=>{console.log(r.status);await r.body?.cancel()}).catch(()=>process.exit(1))',
          url.href,String(defaults.requestTimeoutMs));
        return new Response(null,{status:Number(result.stdout.trim())});
      },
      deploy:async(kind)=>{
        config.services[kind].image=images[kind];
        if (kind === 'worker') config.services.worker.environment.JITM_BUILD_SHA=candidate;
        await writeFile(override,JSON.stringify(config),{mode:0o600});
        await compose('up','-d','--no-deps','--force-recreate','--wait',kind);
        if (kind === 'worker') {
          const until=Date.now()+defaults.startupTimeoutMs;
          while ((await fixture('idle',true)).code !== 0) {assert.ok(Date.now()<until,'New worker did not settle');await delay(1000);}
        }
      },
      executeJob:async(step,startCommand)=>{
        if (fault === 'recovery-hold' && step === 'preflight') await fixture(fault);
        const args=['compose','-p',project,'-f',join(source,'docker-compose.yml'),'-f',join(source,'compose.pilot.yml'),'-f',override,'run','--rm','--no-deps','-T'];
        // A failed browser plan tests the smoke finally block plus the workflow cleanup.
        if (fault === 'failed-smoke' && step === 'smoke') {
          const broken=join(directory,'failed-plan.json');await writeFile(broken,JSON.stringify({...plan,scenarios:[{...plan.scenarios[0],selector:'#seeded-missing-element'}]}));
          args.push('-v',`${broken}:/var/lib/jitm-release/smoke-plan.json:ro`);
        }
        const result=await cmd('docker',[...args,'operator','sh','-c',startCommand],{cwd:source,env,allowed:true});
        await writeFile(join(directory,`${step}.stderr.txt`),redact(result.stderr));
        return {code:result.code,stdout:result.stdout};
      }});
    globalThis.fetch=provider.fetch.bind(provider);process.chdir(source);
    const completed=[];let refused=null;
    for (const step of ['gate','preflight','backup','migrate','worker','web','postflight','smoke','cleanup','final','publish']) {
      stage=step;
      if (['count-drift','leftover-synthetic'].includes(fault) && step === 'final') await fixture(fault);
      try {await run(step,workflowEnv);completed.push(step);}
      catch(error) {refused=step;console.log(`REFUSED ${fault} at ${step}: ${redact(error.message)}`);break;}
    }
    if (fault === 'failed-smoke' && refused === 'smoke') {stage='cleanup-after-failure';await run('cleanup',workflowEnv);await fixture('clean');}
    const records=provider.ledger(), latest=[...verify(records).values()];
    const success=['code-only','migration'].includes(fault);
    if (success) {
      assert.equal(refused,null,`Unexpected refusal at ${refused}`);assertNoUnresolved(records);
      assert.ok(completed.includes('publish')); assert.equal(provider.publications.length,4);await fixture('clean');
    } else {
      const expected={'count-drift':'final','leftover-synthetic':'final','stale-backup':'backup','recovery-hold':'preflight','lost-response':'preflight','reversible-migration':'migrate','failed-smoke':'smoke'}[fault];
      assert.equal(refused,expected,`Fault did not reach its intended gate: ${refused}`);
      assert.equal(provider.publications.length,0);
      await assert.rejects(run('publish',workflowEnv));
      if (fault === 'lost-response') {
        assert.equal(latest.filter(pending).length,1);assert.equal(latest.at(-1).render_deploy_id,null);
        assert.equal(provider.jobs.size,1);assert.equal(provider.jobs.values().next().value.status,'succeeded');
        const before=provider.calls.filter(c=>c.method === 'POST' && c.path.endsWith('/jobs')).length;
        await assert.rejects(run('preflight',workflowEnv));
        assert.equal(provider.calls.filter(c=>c.method === 'POST' && c.path.endsWith('/jobs')).length,before,'Unresolved operation was retried');
      } else {
        assert.equal(latest.find(r=>r.step === expected)?.status,'failed');
      }
      if (fault === 'reversible-migration') await fixture('migration-absent');
    }
    await writeFile(join(directory,'ledger.jsonl'),records.map(r=>JSON.stringify(r)).join('\n')+'\n');
    const report={case:fault,result:'passed',qualified_sha:qualifiedSha,candidate_sha:candidate,completed,refused,
      unresolved:latest.filter(pending).map(r=>r.operation_id),jobs:[...provider.jobs.values()].map(j=>({id:j.id,step:j.step,status:j.status,exit_code:j.code})),
      publications:provider.publications.map(p=>p.path)};
    reports.push(report); console.log(`PASS ${fault}: ${refused ? `refused ${refused}` : 'publish, zero unresolved'}`);
  } catch(error) {
    reports.push({case:fault,result:'failed',qualified_sha:qualifiedSha,stage,error:redact(error.message)});
    console.error(`FAIL ${fault} at ${stage}: ${redact(error.message)}`);
  } finally {
    globalThis.fetch=originalFetch;process.chdir(root);
    await compose('down','--volumes','--remove-orphans');
    // Credentials were generated per case and never copied into public reports.
    await writeFile(override,JSON.stringify({removed:'ephemeral configuration'}),{mode:0o600});
    await writeFile(join(output,'report.json'),JSON.stringify(reports,null,2)+'\n');
  }
}
console.log(`Qualification report: ${output}/report.json`);
assert.ok(reports.length === defaults.groups[group].length && reports.every(r=>r.result === 'passed'),'Qualification has failures');
