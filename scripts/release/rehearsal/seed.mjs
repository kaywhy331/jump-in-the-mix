import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { cli, emit, need } from './client.mjs';
import { settings as catalog } from '../jobs/settings.mjs';

export async function seed(settings, io) {
  const r = settings.rehearsal;
  need(/^[a-f0-9]{40}$/.test(r.previous_sha) && /^[a-f0-9]{40}$/.test(r.operator_sha), 'Reviewed full commits required');
  need(typeof r.database_host === 'string' && /^[a-z0-9.-]+$/.test(r.database_host), 'Reviewed private database host required');
  const site = new URL(settings.site_url);
  need(site.protocol === 'https:' && !site.username && !site.password
    && site.hostname !== 'jumpinthemix.com' && !site.hostname.endsWith('.jumpinthemix.com'), 'Separate rehearsal domain required');
  await io.operator();
  for (const role of ['web', 'worker']) {
    const id = settings.services[role];
    need(/^srv-[0-9a-z]+$/.test(id), 'Rehearsal service ID required');
    const service = await io.api(`services/${id}`);
    need(service.id === id && service.ownerId === settings.render_owner_id && service.autoDeploy === 'no', 'Seed service identity mismatch');
    const deployments = await io.api(`services/${id}/deploys?limit=20`);
    const live = deployments.map(x => x.deploy ?? x).filter(x => x.status === 'live');
    need(live.length === 1 && live[0].commit?.id === r.previous_sha, 'Seed requires both services at the previous commit');
  }
  const context = io.context('seed', { previous_sha: r.previous_sha, operator_sha: r.operator_sha, database_host: r.database_host });
  const job = await io.terminal(await io.create(context, 'seed'), 'succeeded');
  const receipt = await io.receipt(job, 'seed');
  need(receipt.previous_commit === true && receipt.unmarked_rows === true && receipt.nontrivial === true, 'Incomplete seed receipt');
  io.report.seed = { previous_commit: true, unmarked_rows: true, nontrivial: true };
}

// Only this Render-side path imports database clients. The runner never gets a DB URL.
async function runtime() {
  const reads = await import('../jobs/read-only.mjs');
  const { withWrite } = await import('../jobs/synthetic.mjs');
  return { ...reads, transact: withWrite };
}

export async function seedRows(context, io, env = process.env) {
  need(context.mode === 'seed' && env.JITM_REHEARSAL === 'true', 'Rehearsal operator opt-in required');
  need(/^[a-f0-9]{40}$/.test(context.previous_sha) && /^[a-f0-9]{40}$/.test(context.operator_sha), 'Reviewed full commits required');
  need(new URL(env.DATABASE_URL).hostname === context.database_host, 'Database identity mismatch');
  need((await io.git('rev-parse', 'HEAD')).trim() === context.operator_sha, 'Operator commit mismatch');
  await io.git('merge-base', '--is-ancestor', context.previous_sha, context.operator_sha);
  const previous = await io.releaseSchema(context.previous_sha);
  const owner = randomUUID(); // Baseline data, deliberately not the smoke fixture's reserved marker.
  need(!owner.startsWith(catalog.syntheticPrefix), 'Reserved smoke marker refused');
  await io.transact(async db => {
    await io.noRecoveryHold(db);
    await io.migrations(db, previous, previous);
    await io.schemaReady(db, previous);
    need(!(await db.query('SELECT 1 FROM "User" LIMIT 1')).rowCount, 'Seed requires a fresh rehearsal database; no automatic reseed');
    await db.query('INSERT INTO "User" (id,email,name,"suspendedAt","updatedAt") VALUES ($1,$2,$3,now(),now())', [owner, `${owner}@example.invalid`, 'Rehearsal baseline']);
    await db.query('INSERT INTO "Workspace" (id,name,slug,"ownerId","updatedAt") VALUES ($1,$2,$1,$1,now())', [owner, 'Rehearsal baseline']);
    await db.query('INSERT INTO "WorkspaceMember" (id,"workspaceId","userId",role) VALUES ($1,$1,$1,\'OWNER\')', [owner]);
    const mix = randomUUID(), beat = randomUUID(), step = randomUUID();
    await db.query('INSERT INTO "Mix" (id,"workspaceId",name,"triggerMode",status,"updatedAt") VALUES ($1,$2,\'Rehearsal Mix\',\'MANUAL_START\',\'ACTIVE\',now())', [mix, owner]);
    await db.query('INSERT INTO "StepTemplate" (id,"workspaceId",name,channel,"updatedAt") VALUES ($1,$2,\'Rehearsal Beat\',\'PHONE_CALL\',now())', [beat, owner]);
    await db.query('INSERT INTO "StepVersion" (id,"stepTemplateId",version,script) VALUES ($1,$1,1,\'Rehearsal manual follow-up\')', [beat]);
    await db.query('INSERT INTO "MixStep" (id,"mixId","stepVersionId","dayOffset","sortOrder","updatedAt") VALUES ($1,$2,$3,0,0,now())', [step, mix, beat]);
    for (const status of ['PENDING', 'DONE', 'SKIPPED']) {
      const contact = randomUUID(), jump = randomUUID();
      await db.query('INSERT INTO "Contact" (id,"workspaceId","displayName","updatedAt") VALUES ($1,$2,\'Rehearsal contact\',now())', [contact, owner]);
      await db.query(`INSERT INTO "Jump" (id,"workspaceId","contactId","mixId","mixStepId","stepVersionId","scheduledAt",status,reason,"templateSnapshot","renderedSnapshot","uniquenessKey","manualOnly","updatedAt")
        VALUES ($1,$2,$3,$4,$5,$6,now(),$7::"JumpStatus",'Rehearsal baseline','{}','{}',$1,true,now())`, [jump, owner, contact, mix, step, beat, status]);
    }
    need((await db.query('SELECT 1 FROM "Contact" WHERE "workspaceId"=$1', [owner])).rowCount === 3, 'Seed contacts missing');
    const jumps = (await db.query('SELECT status,"manualOnly" FROM "Jump" WHERE "workspaceId"=$1', [owner])).rows;
    need(jumps.length === 3 && ['PENDING', 'DONE', 'SKIPPED'].every(s => jumps.some(j => j.status === s && j.manualOnly)), 'Seed follow-ups missing');
  });
  return { previous_commit: true, unmarked_rows: true, nontrivial: true };
}

async function seedJob(context) { emit(context, await seedRows(context, await runtime())); }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await cli(seed, seedJob);
