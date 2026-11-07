import assert from 'node:assert/strict';
import { digest } from '../candidate.mjs';
import { read, verify } from '../ledger.mjs';

// An in-process HTTP transport stub, installed only by the qualification driver.
// Unknown origins/routes fail closed. No real GitHub/Render transport is retained.
export class Providers {
  constructor({settings, candidate, previous, names, executeJob, deploy, health, fault}) {
    Object.assign(this, {settings, candidate, previous, names, executeJob, deploy, health, fault});
    this.objects = new Map(); this.refs = new Map([[`heads/${settings.main_branch}`, candidate]]);
    this.jobs = new Map(); this.deploys = new Map(); this.calls = []; this.publications = [];
    for (const service of Object.values(settings.services)) this.deploys.set(service, {id:`initial-${service}`, status:'live', commit:{id:previous}});
  }
  object(value) { const sha=digest(JSON.stringify(value)).slice(0,40); this.objects.set(sha,value); return {sha}; }
  ledger() {
    const head=this.refs.get(`heads/${this.settings.ledger_branch}`);
    if (!head) return [];
    const commit=this.objects.get(head), tree=this.objects.get(commit.tree.sha);
    return read(this.objects.get(tree.tree[0].sha).content);
  }
  async fetch(input, options={}) {
    const url=new URL(input), method=options.method ?? 'GET';
    const body=options.body ? JSON.parse(options.body) : undefined;
    const s=this.settings;
    if (url.origin === s.site_url) return this.health(url,options);
    assert.ok([s.render_api_url,s.githubOrigin].includes(url.origin), 'Unexpected provider origin');
    this.calls.push({origin:url.origin,path:url.pathname,method});
    const result=url.origin === s.githubOrigin
      ? this.github(url.pathname,method,body)
      : await this.render(url,method,body);
    return new Response(result === null ? null : JSON.stringify(result), {status:result === null ? 404 : 200,headers:{'content-type':'application/json'}});
  }
  github(path, method, body) {
    const prefix=`/repos/${this.settings.repository}/`;
    assert.ok(path.startsWith(prefix)); path=path.slice(prefix.length);
    if (method === 'GET' && path.startsWith('git/ref/')) {
      const sha=this.refs.get(path.slice('git/ref/'.length)); return sha ? {object:{sha}} : null;
    }
    if (method === 'GET' && /^git\/(commits|trees|blobs)\//.test(path)) {
      const value=this.objects.get(path.split('/').at(-1)); assert.ok(value,'Unknown Git object');
      return path.startsWith('git/blobs/') ? {encoding:'base64',content:Buffer.from(value.content).toString('base64')} : value;
    }
    if (method === 'POST' && path === 'git/blobs') { assert.equal(body.encoding,'utf-8'); read(body.content); return this.object(body); }
    if (method === 'POST' && path === 'git/trees') return this.object(body);
    if (method === 'POST' && path === 'git/commits') return this.object({...body,tree:{sha:body.tree}});
    if (method === 'PATCH' && path.startsWith('git/refs/heads/')) {
      assert.equal(body.force,false);
      const ref=path.slice('git/refs/'.length), commit=this.objects.get(body.sha);
      assert.deepEqual(commit.parents,[this.refs.get(ref)],'Ledger update must fast-forward');
      this.refs.set(ref,body.sha); return {object:{sha:body.sha}};
    }
    if (method === 'POST' && path === 'git/refs') {
      const ref=body.ref.replace(/^refs\//,''); assert.ok(!this.refs.has(ref),'Ref already exists');
      this.refs.set(ref,body.sha);
      if (ref !== `heads/${this.settings.ledger_branch}`) this.publications.push({path,body});
      return {object:{sha:body.sha}};
    }
    if (method === 'POST' && path === 'git/tags') { this.publications.push({path,body}); return this.object(body); }
    if (method === 'PUT' && path.startsWith('contents/')) { this.publications.push({path,body}); return {content:{sha:digest(body.content).slice(0,40)}}; }
    throw Error(`Unsupported synthetic Git route: ${method} ${path}`);
  }
  async render(url,method,body) {
    const s=this.settings, parts=url.pathname.split('/').filter(Boolean), service=parts[1];
    if (parts[0] === 'logs') {
      assert.equal(url.searchParams.get('ownerId'),s.render_owner_id);
      const job=this.jobs.get(url.searchParams.get('resource')); assert.ok(job);
      return {logs:job.stdout.trim().split('\n').filter(Boolean).map(message=>({message}))};
    }
    assert.equal(parts[0],'services');
    if (parts.length === 2) {
      const kind=Object.keys(s.services).find(k=>s.services[k] === service); assert.ok(kind);
      return {id:service,name:this.names[kind],autoDeploy:'no'};
    }
    if (parts[2] === 'custom-domains') return [{name:new URL(s.site_url).hostname}];
    if (parts[2] === 'deploys') {
      assert.ok(Object.values(s.services).includes(service));
      if (method === 'POST') {
        assert.equal(body.commitId,this.candidate);
        await this.deploy(Object.keys(s.services).find(k=>s.services[k] === service));
        const value={id:`deploy-${this.calls.length}`,status:'live',commit:{id:this.candidate}};
        this.deploys.set(service,value); return value;
      }
      const value=this.deploys.get(service);
      if (parts[3]) { assert.equal(parts[3],value.id); return value; }
      return [{deploy:value}];
    }
    assert.equal(parts[2],'jobs'); assert.equal(service,s.operator);
    if (method === 'POST') {
      const match=/^JITM_RELEASE_CONTEXT=([A-Za-z0-9+/=]+) (.+)$/.exec(body.startCommand); assert.ok(match);
      const context=JSON.parse(Buffer.from(match[1],'base64').toString());
      const step=context.operation_id.split('.').at(-1);
      assert.equal(context.candidate_sha,this.candidate);
      assert.equal(match[2],s.jobs[step].command);
      // Verify write-ahead evidence before executing any external operation.
      assert.equal(verify(this.ledger()).get(context.operation_id)?.status,'requested');
      const id=`job-${this.jobs.size+1}`;
      const result=await this.executeJob(step,body.startCommand,context);
      const lines=result.stdout.trim().split('\n').filter(Boolean);
      assert.equal(lines.length,result.code === 0 ? 1 : 0,'A failing command must emit no receipt');
      if (result.code === 0) assert.ok(lines[0].startsWith(s.receipt_prefix));
      this.jobs.set(id,{id,status:result.code === 0 ? 'succeeded' : 'failed',...result,step,context});
      if (this.fault === 'lost-response' && step === 'preflight') throw new TypeError('Synthetic response lost after acceptance');
      return {id};
    }
    const job=this.jobs.get(parts[3]); assert.ok(job); return {id:job.id,status:job.status};
  }
}
