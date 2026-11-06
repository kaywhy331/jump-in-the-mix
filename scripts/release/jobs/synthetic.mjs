import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Client } from 'pg';
import { quoteIdentifier, databaseIdentity } from '../../lib/postgres-ops.mjs';
import { noRecoveryHold } from './read-only.mjs';
import { need } from './receipt.mjs';
import { settings } from './settings.mjs';

export function marker(context) {
  return `${settings.syntheticPrefix}${context.operation_id.split('.').slice(0, 2).join('-')}-${context.candidate_sha.slice(0, 12)}-`;
}
export async function withWrite(action, url = process.env.DATABASE_URL) {
  need(url && databaseIdentity(url).schema === 'public');
  const db = new Client({ connectionString: url, connectionTimeoutMillis: settings.connectTimeoutMs,
    query_timeout: settings.queryTimeoutMs, statement_timeout: settings.queryTimeoutMs });
  try {
    await db.connect();
    await db.query('BEGIN');
    await noRecoveryHold(db);
    const result = await action(db);
    await db.query('COMMIT');
    return result;
  } finally { await db.end(); }
}
export async function seed(context, transact = withWrite) {
  const id = marker(context), email = `${id}owner@example.invalid`, password = randomBytes(32).toString('base64url');
  const hash = await bcrypt.hash(password, 12);
  await transact(async db => {
    need(!(await db.query('SELECT 1 FROM "User" WHERE starts_with(id,$1)', [settings.syntheticPrefix])).rowCount);
    await db.query('INSERT INTO "User" (id,email,name,"passwordHash","emailVerifiedAt","updatedAt") VALUES ($1,$2,$3,$4,now(),now())', [id,email,settings.syntheticName,hash]);
    await db.query('INSERT INTO "Workspace" (id,name,slug,"ownerId","updatedAt") VALUES ($1,$2,$1,$1,now())', [id,settings.syntheticName]);
    await db.query('INSERT INTO "WorkspaceMember" (id,"workspaceId","userId",role) VALUES ($1,$1,$1,\'OWNER\')', [id]);
    await db.query('INSERT INTO "WorkspaceProfile" ("workspaceId","onboardingDone","onboardingStep","updatedAt") VALUES ($1,true,5,now())', [id]);
    await db.query('INSERT INTO "UserPreference" (id,"userId",timezone,"updatedAt") VALUES ($1,$1,\'UTC\',now())', [id]);
    await db.query('INSERT INTO "NotificationPreference" (id,"workspaceId","userId","emailDigestEnabled","weeklyReportEnabled","updatedAt") VALUES ($1,$1,$1,false,false,now())', [id]);
    await db.query('INSERT INTO "Contact" (id,"workspaceId","displayName","updatedAt") VALUES ($1,$2,\'Release contact\',now())', [`${id}contact`,id]);
    await db.query('INSERT INTO "Mix" (id,"workspaceId",name,"triggerMode",status,"updatedAt") VALUES ($1,$2,\'Release Mix\',\'MANUAL_START\',\'ACTIVE\',now())', [`${id}mix`,id]);
    await db.query('INSERT INTO "StepTemplate" (id,"workspaceId",name,channel,"updatedAt") VALUES ($1,$2,\'Release Beat\',\'PHONE_CALL\',now())', [`${id}beat`,id]);
    await db.query('INSERT INTO "StepVersion" (id,"stepTemplateId",version,script) VALUES ($1,$1,1,\'Synthetic manual follow-up\')', [`${id}beat`]);
    await db.query('INSERT INTO "MixStep" (id,"mixId","stepVersionId","dayOffset","sortOrder","updatedAt") VALUES ($1,$2,$3,0,0,now())', [`${id}step`,`${id}mix`,`${id}beat`]);
    await db.query(`INSERT INTO "Jump" (id,"workspaceId","contactId","mixId","mixStepId","stepVersionId","scheduledAt",reason,"templateSnapshot","renderedSnapshot","uniquenessKey","manualOnly","updatedAt")
      VALUES ($1,$2,$3,$4,$5,$6,now(),'Synthetic release smoke','{}','{"script":"Synthetic manual follow-up"}',$1,true,now())`, [`${id}jump`,id,`${id}contact`,`${id}mix`,`${id}step`,`${id}beat`]);
  });
  return { id, email, password };
}
export async function assertFixture(db, context) {
  const id = marker(context);
  const owners = (await db.query('SELECT id,name,email,"isPlatformAdmin" FROM "User" WHERE starts_with(id,$1)', [settings.syntheticPrefix])).rows;
  need(owners.length === 1 && owners[0].id === id && owners[0].name === settings.syntheticName
    && owners[0].email === `${id}owner@example.invalid` && !owners[0].isPlatformAdmin);
  need((await db.query('SELECT 1 FROM "Workspace" WHERE "ownerId"=$1 AND id=$1',[id])).rowCount === 1);
  need(!(await db.query('SELECT 1 FROM "Workspace" WHERE "ownerId"=$1 AND id<>$1',[id])).rowCount);
  need(!(await db.query('SELECT 1 FROM "WorkspaceMember" WHERE ("workspaceId"=$1 AND "userId"<>$1) OR ("userId"=$1 AND "workspaceId"<>$1)',[id])).rowCount);
  for (const table of ['ContactEmail','ContactPhone','ContactAddress']) need(!(await db.query(`SELECT 1 FROM ${quoteIdentifier(table)} m JOIN "Contact" c ON c.id=m."contactId" WHERE c."workspaceId"=$1`,[id])).rowCount);
  need((await db.query('SELECT 1 FROM "Jump" WHERE "workspaceId"=$1',[id])).rowCount > 0);
  need(!(await db.query('SELECT 1 FROM "Jump" WHERE "workspaceId"=$1 AND NOT "manualOnly"',[id])).rowCount);
  need(!(await db.query('SELECT 1 FROM "AutomatedDelivery" WHERE "workspaceId"=$1',[id])).rowCount);
}
export async function residue(db, prefix) {
  const columns = (await db.query(`SELECT table_name,column_name FROM information_schema.columns
    WHERE table_schema='public' AND data_type IN ('text','character varying','character')`)).rows;
  for (const { table_name: table, column_name: column } of columns) {
    need(!(await db.query(`SELECT 1 FROM ${quoteIdentifier(table)} WHERE starts_with(${quoteIdentifier(column)},$1) LIMIT 1`,[prefix])).rowCount);
  }
}
export async function removeFixture(context, transact = withWrite) {
  const id = marker(context);
  await transact(async db => {
    const owner = (await db.query('SELECT name,email,"isPlatformAdmin" FROM "User" WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if (owner) {
      need(owner.name === settings.syntheticName && owner.email === `${id}owner@example.invalid` && !owner.isPlatformAdmin);
      need(!(await db.query('SELECT 1 FROM "Workspace" WHERE "ownerId"=$1 AND id<>$1',[id])).rowCount);
      need(!(await db.query('SELECT 1 FROM "WorkspaceMember" WHERE ("workspaceId"=$1 AND "userId"<>$1) OR ("userId"=$1 AND "workspaceId"<>$1)',[id])).rowCount);
    }
    // Explicit child order respects Restrict relations. Cascades remove runtime-
    // generated session/preferences/audit IDs attached to this workspace/owner.
    for (const table of ['Jump', 'MixStep', 'StepVersion']) {
      const column = table === 'Jump' ? 'workspaceId' : table === 'MixStep' ? 'mixId' : 'stepTemplateId';
      const value = table === 'Jump' ? id : table === 'MixStep' ? `${id}mix` : `${id}beat`;
      await db.query(`DELETE FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(column)}=$1`,[value]);
    }
    await db.query('DELETE FROM "Workspace" WHERE id=$1',[id]);
    await db.query('DELETE FROM "VerificationToken" WHERE email=$1',[`${id}owner@example.invalid`]);
    await db.query('DELETE FROM "User" WHERE id=$1',[id]);
    await residue(db,id);
  });
}
