import { setTimeout as delay } from 'node:timers/promises';
import contract from '../../../src/worker/release-contract.json' with { type: 'json' };
import { cli, need } from './receipt.mjs';
import * as reads from './read-only.mjs';
import { withWrite, marker } from './synthetic.mjs';
import { settings } from './settings.mjs';

export async function workerState(db, context) {
  const { rows } = await db.query(`SELECT "workerId","startedAt" AT TIME ZONE 'UTC' AS "startedAt",metadata,
    EXTRACT(EPOCH FROM (transaction_timestamp()-("lastSeenAt" AT TIME ZONE 'UTC')))*1000 AS age
    FROM "WorkerHeartbeat" WHERE status='RUNNING'`);
  need(rows.length === 1);
  const worker = rows[0];
  need(worker.metadata?.commit === context.candidate_sha && worker.startedAt >= new Date(context.release_started_at)
    && Number(worker.age) >= 0 && Number(worker.age) <= settings.workerFreshMs);
  // Old instances must positively drain, including their still-held leases.
  need(!(await db.query('SELECT 1 FROM "Job" WHERE "lockedBy" IS NOT NULL AND NOT starts_with("lockedBy",$1)',[`${worker.workerId}:`])).rowCount);
  return worker.workerId;
}
export async function queueProbe(context, io = reads) {
  const id = `${marker(context)}probe`;
  await withWrite(async db => {
    need(!(await db.query('SELECT 1 FROM "Job" WHERE starts_with(task,$1)',[settings.probeTaskPrefix])).rowCount);
    await db.query('INSERT INTO "Job" (id,task,payload,"maxAttempts","updatedAt") VALUES ($1,$2,$3,1,now())',
      [id,contract.probeTask,{type:contract.probeType,operation_id:context.operation_id}]);
  });
  try {
    const deadline = Date.now()+settings.workerWaitMs;
    let completed = false;
    while (Date.now() < deadline) {
      const row = await io.withReadOnly(async db => (await db.query('SELECT "completedAt","failedAt","lockedAt",attempts,"createdAt" FROM "Job" WHERE id=$1',[id])).rows[0]);
      need(row && !row.failedAt);
      if (row.completedAt) {
        need(!row.lockedAt && row.attempts === 1 && row.completedAt >= row.createdAt);
        completed = true; break;
      }
      await delay(settings.workerPollMs);
    }
    need(completed);
  } finally {
    // A locked probe is unresolved work: retain it and refuse the gate.
    await withWrite(async db => {
      await db.query('DELETE FROM "Job" WHERE id=$1 AND "lockedAt" IS NULL',[id]);
      need(!(await db.query('SELECT 1 FROM "Job" WHERE id=$1',[id])).rowCount);
    });
  }
}
export async function workerGate(context, io = { ...reads, workerState, queueProbe }) {
  const {previous,candidate} = await io.reviewedSource(context);
  const observe = () => io.withReadOnly(async db => {
    await io.noRecoveryHold(db);
    const worker = await io.workerState(db,context);
    need(await io.countsDigest(db,previous,candidate) === context.baseline_counts_sha256);
    need(!(await db.query('SELECT 1 FROM "Job" WHERE starts_with(task,$1)',[settings.probeTaskPrefix])).rowCount);
    return worker;
  });
  const worker = await observe();
  await io.queueProbe(context,io);
  need(await observe() === worker);
  return {checks:{candidate_heartbeat:true,old_instance_drained:true,queue_probe_created_nothing:true,probe_removed:true}};
}
cli(import.meta.url,'worker_gate',workerGate);
