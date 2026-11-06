import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assets, postflight, redirects } from '../postflight.mjs';
import { command } from '../read-only.mjs';
import { capture } from './receipt.node.mjs';

test('postflight actual public-smoke process and asset bytes against loopback HTTP',async()=>{
  const cwd=process.cwd(),directory=await mkdtemp(join(tmpdir(),'jitm-release-http-'));
  let fault='';
  const pages={'/':'Client Follow-Up App','/login':'Sign in','/faq':'Client follow-up questions','/terms':'Terms of use','/privacy':'Privacy','/for/contractors':'Contractor Follow-Up Software'};
  const server=createServer((request,response)=>{
    response.setHeader('content-security-policy',`script-src 'nonce-${randomUUID()}'`);
    response.setHeader('strict-transport-security','max-age=31536000');response.setHeader('x-frame-options','DENY');
    if(request.url==='/deleted.txt'){response.statusCode=fault==='deleted'?200:404;response.end();return;}
    if(request.url==='/asset.txt'||request.url==='/_next/static/build.js'){response.end(fault==='hash'?'wrong bytes':'fixture bytes');return;}
    if(request.url?.startsWith('/api/health/')){response.statusCode=fault==='health'?503:200;response.end('{"status":"ready"}');return;}
    if(pages[request.url]){response.end(`<title>${pages[request.url]} | Jump in the Mix</title><input name="password">`);return;}
    response.statusCode=307;response.setHeader('location',fault==='redirect'?'https://elsewhere.invalid/login':'/login');response.end();
  });
  try {
    await mkdir(join(directory,'public'));await mkdir(join(directory,'.next/static'),{recursive:true});
    await writeFile(join(directory,'public/asset.txt'),'fixture bytes');await writeFile(join(directory,'.next/static/build.js'),'fixture bytes');
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const origin=`http://127.0.0.1:${server.address().port}`;
    process.chdir(directory);
    const io={reviewedSource:async()=>{},redirects,command:(_file,args,env)=>command(process.execPath,[join(cwd,args[0]),...args.slice(1)],env,cwd),
      assets:(context,origin)=>assets(context,origin,{git:async()=> 'public/deleted.txt\0'})};
    for(const variant of ['', 'health','hash','deleted','redirect']) {
      fault=variant;
      const result=await capture('postflight',c=>postflight(c,io,{...process.env,JITM_RELEASE_SITE_URL:origin}));
      assert.equal(result.code,variant?1:0,variant||'success');assert.equal(result.out.length,variant?0:1);
    }
  } finally {
    process.chdir(cwd);await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});
  }
});
