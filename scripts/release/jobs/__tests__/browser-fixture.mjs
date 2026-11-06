import { createServer, request } from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { browserSmoke } from '../smoke-browser.mjs';

// Synthetic reverse proxy gives this local-only test a known client address.
// It appends the observed fixture address after any supplied forwarded header.
export async function withBrowserFixture(context, action) {
  const directory=await mkdtemp(join(tmpdir(),'jitm-release-browser-'));
  let webPort;
  const proxy=createServer((req,res)=>{
    const upstream=request({hostname:'127.0.0.1',port:webPort,path:req.url,method:req.method,headers:{...req.headers,
      'x-forwarded-for':[req.headers['x-forwarded-for'],'198.51.100.7'].filter(Boolean).join(', ')}},response=>{
      res.writeHead(response.statusCode,response.headers);response.pipe(res);
    });
    upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
  });
  await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(0,'127.0.0.1',resolve);});
  const origin=`http://127.0.0.1:${proxy.address().port}`;
  const planPath=join(directory,'plan.json');
  await writeFile(planPath,JSON.stringify({candidate_sha:context.candidate_sha,previous_sha:context.previous_sha,
    review_ref:'local-synthetic-fixture',changed_paths:[],scenarios:[{path:'/jumps',selector:'h1',text:'Today',covers:[]}]}));
  const values={TZ:'UTC',NODE_ENV:'production',PILOT_MODE:'true',APP_URL:origin,JITM_RELEASE_SITE_URL:origin,
    AUTH_ALLOWED_ORIGINS:origin,AUTH_RATE_LIMIT_SECRET:randomUUID(),DATA_ENCRYPTION_KEY:randomUUID(),AUTH_REQUIRE_ADMIN_MFA:'false',
    JITM_RELEASE_SMOKE_PLAN:planPath,JITM_RELEASE_JOB_EVIDENCE_DIR:directory,JITM_RELEASE_EXPECTED_CLIENT_IP:'198.51.100.7',
    RESEND_API_KEY:'',RESEND_RECOVERY_API_KEY:'',EMAIL_FROM:'',TWILIO_ACCOUNT_SID:'',TWILIO_AUTH_TOKEN:'',OPS_ALERT_WEBHOOK_URL:'',
    WORKER_DISPATCH_MODE:'off',WEB_PUSH_VAPID_PRIVATE_KEY:'',WEB_PUSH_VAPID_PUBLIC_KEY:'',NETLIFY_WORKER_SECRET:''};
  const before=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));Object.assign(process.env,values);
  const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','0'],{env:process.env,stdio:['ignore','pipe','pipe']});
  let logs='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{logs=(logs+chunk).slice(-5000);webPort=Number(logs.match(/http:\/\/127\.0\.0\.1:(\d+)/)?.[1])||webPort;});
  try {
    const deadline=Date.now()+30000;
    while(!logs.includes('Ready in')&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));
    assert.ok(webPort&&logs.includes('Ready in'),'Local application did not become ready');
    await action(browserSmoke);
  } finally {
    const stopped=new Promise(r=>child.once('exit',r));if(child.exitCode===null){child.kill('SIGTERM');await stopped;}
    await new Promise(resolve=>proxy.close(resolve));
    for(const [key,value] of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
    await rm(directory,{recursive:true,force:true});
  }
}
