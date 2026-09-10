import { createHash, randomBytes } from "node:crypto";

export function validateLoadProfile(profile) {
  const limits = { accounts: [2, 10], contactsPerAccount: [100, 5000], historyPerContact: [1, 100], mixesPerAccount: [2, 100], beatsPerMix: [6, 6] };
  for (const [key, [min, max]] of Object.entries(limits)) if (!Number.isInteger(profile?.[key]) || profile[key] < min || profile[key] > max) throw new Error('Invalid bounded load fixture profile.');
  if (profile.accounts * profile.contactsPerAccount * (profile.historyPerContact + 1) > 600000) throw new Error('Load fixture exceeds 600,000 follow-ups.');
  return profile;
}

// Fixture writes are confined to the fresh database created by the controller.
export async function seedCustomerLoadFixture(db, { database, profile, checkCanceled = () => {} }) {
  validateLoadProfile(profile);
  if (!/^jitm_design_load_[a-f0-9]{10,32}$/.test(database)) throw new Error("Expected an owned load fixture database.");
  const actual = (await db.query('SELECT current_database() AS name')).rows[0]?.name;
  if (actual !== database) throw new Error("Fixture connection does not match its owned target.");
  if ((await db.query('SELECT 1 FROM "User" LIMIT 1')).rowCount) throw new Error("Fixture target must have no accounts.");
  const accounts = [];
  for (let account = 0; account < profile.accounts; account++) {
    checkCanceled();
    const marker = `LOAD_${database.slice(-10)}_${String(account).padStart(2, "0")}`;
    const token = randomBytes(32).toString("base64url");
    accounts.push({ marker, cookie: `jitm_load_session=${token}` });
    await db.query('INSERT INTO "User" (id,email,name,"emailVerifiedAt","updatedAt") VALUES ($1,$2,$1,now(),now())', [marker, `${marker.toLowerCase()}@example.test`]);
    await db.query('INSERT INTO "Workspace" (id,name,slug,"ownerId","updatedAt") VALUES ($1,$1,$1,$1,now())', [marker]);
    await db.query('INSERT INTO "WorkspaceMember" (id,"workspaceId","userId",role) VALUES ($1,$1,$1,\'OWNER\')', [marker]);
    await db.query('INSERT INTO "WorkspaceProfile" ("workspaceId","onboardingDone","onboardingStep","updatedAt") VALUES ($1,true,5,now())', [marker]);
    await db.query('INSERT INTO "UserPreference" (id,"userId",timezone,"updatedAt") VALUES ($1,$1,\'UTC\',now())', [marker]);
    await db.query('INSERT INTO "Session" (id,"userId","tokenHash","expiresAt") VALUES ($1,$1,$2,now()+interval \'1 hour\')', [marker, createHash("sha256").update(token).digest("hex")]);
    await db.query(`INSERT INTO "Contact" (id,"workspaceId","displayName",company,"publicNotes","updatedAt") SELECT $1||'_c_'||n,$1,'Load contact '||lpad(n::text,5,'0'),'Synthetic company '||(n%20),'Synthetic relationship note for a performance rehearsal. '||repeat('Discussed a future follow-up. ',8),now() FROM generate_series(1,$2::int) n`, [marker, profile.contactsPerAccount]);
    await db.query(`INSERT INTO "ContactEmail" (id,"contactId",email,normalized,"isPrimary") SELECT id,id,lower(id)||'@example.test',lower(id)||'@example.test',true FROM "Contact" WHERE "workspaceId"=$1`, [marker]);
    await db.query(`INSERT INTO "Group" (id,"workspaceId",name,"updatedAt") SELECT $1||'_g_'||n,$1,'Load tag '||n,now() FROM generate_series(1,8) n`, [marker]);
    await db.query(`INSERT INTO "ContactGroupMembership" (id,"contactId","groupId") SELECT $1||'_g_c_'||n,$1||'_c_'||n,$1||'_g_'||(1+n%8) FROM generate_series(1,$2::int) n`, [marker, profile.contactsPerAccount]);
    await db.query(`INSERT INTO "Mix" (id,"workspaceId",name,"triggerMode",status,"updatedAt") SELECT $1||'_m_'||n,$1,'Load mix '||lpad(n::text,3,'0'),'MANUAL_START',CASE WHEN n%3=0 THEN 'DRAFT'::"MixStatus" ELSE 'ACTIVE'::"MixStatus" END,now() FROM generate_series(1,$2::int) n`, [marker, profile.mixesPerAccount]);
    await db.query(`INSERT INTO "StepTemplate" (id,"workspaceId",name,channel,"updatedAt") SELECT $1||'_t_'||n,$1,'Load beat '||n,'EMAIL',now() FROM generate_series(1,6) n`, [marker]);
    await db.query(`INSERT INTO "StepVersion" (id,"stepTemplateId",version,subject,body) SELECT id,id,1,'Following up',repeat('This is a synthetic message for the local rehearsal. ',6) FROM "StepTemplate" WHERE "workspaceId"=$1`, [marker]);
    await db.query(`INSERT INTO "MixStep" (id,"mixId","stepVersionId","dayOffset","sortOrder","updatedAt") SELECT m.id||'_s_'||n,m.id,$1||'_t_'||n,n*7,n,now() FROM "Mix" m CROSS JOIN generate_series(1,6) n WHERE m."workspaceId"=$1`, [marker]);
    await db.query(`INSERT INTO "MixAssignment" (id,"assignmentKey","workspaceId","mixId","contactId","startDate","updatedAt") SELECT $1||'_a_'||n,$1||'_a_'||n,$1,$1||'_m_'||(1+n%$3::int),$1||'_c_'||n,now()-interval '180 days',now() FROM generate_series(1,$2::int) n`, [marker, profile.contactsPerAccount, profile.mixesPerAccount]);
    // Bound each indexed write on small hosted databases while preserving
    // absolute contact ordinals and allowing cancellation between batches.
    const contactsPerBatch = Math.max(1, Math.floor(5000 / (profile.historyPerContact + 1)));
    for (let firstContact = 1; firstContact <= profile.contactsPerAccount; firstContact += contactsPerBatch) {
      checkCanceled();
      const lastContact = Math.min(profile.contactsPerAccount, firstContact + contactsPerBatch - 1);
      await db.query(`INSERT INTO "Jump" (id,"workspaceId","contactId","mixId","mixStepId","stepVersionId","scheduledAt",status,reason,"templateSnapshot","renderedSnapshot","completedAt","uniquenessKey","updatedAt") SELECT $1||'_j_'||c||'_'||h,$1,$1||'_c_'||c,$1||'_m_'||(1+c%$4::int),$1||'_m_'||(1+c%$4::int)||'_s_'||(1+h%6),$1||'_t_'||(1+h%6),now()+((CASE WHEN h=0 THEN c%10-3 ELSE -h*7 END)||' days')::interval,CASE WHEN h=0 THEN 'PENDING'::"JumpStatus" WHEN h%7=0 THEN 'SKIPPED'::"JumpStatus" ELSE 'DONE'::"JumpStatus" END,'Synthetic load rehearsal',jsonb_build_object('subject','Following up','body',repeat('Synthetic follow-up content. ',10)),jsonb_build_object('subject','Following up','body',repeat('Synthetic follow-up content. ',10)),CASE WHEN h=0 THEN NULL ELSE now()-(h*7||' days')::interval END,$1||'_j_'||c||'_'||h,now() FROM generate_series($2::int,$5::int) c CROSS JOIN generate_series(0,$3::int) h`, [marker, firstContact, profile.historyPerContact, profile.mixesPerAccount, lastContact]);
    }
  }
  return accounts;
}
