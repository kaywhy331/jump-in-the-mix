import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma";
import { parseReportRange } from "../../src/lib/admin-report-range";

export async function createReportFixture() {
  if (!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "")) throw new Error("Report fixtures require a disposable loopback database.");
  const prefix = `report-${randomUUID()}`, secret = `${prefix}-PRIVATE-CONTENT`;
  const users: string[] = [], spaces: string[] = [], entries: string[] = [], grants: string[] = [], messages: string[] = [], shared: string[] = [], waves: string[] = [], imports: string[] = [];
  const at = (value: string) => new Date(`${value}T12:00:00Z`);
  try {
  async function account(index: number) {
    const createdAt = at(index === 3 ? "2020-01-30" : "2020-01-02");
    const user = await prisma.user.create({ data: { email: `${prefix}-${index}@example.test`, name: secret, createdAt, emailVerifiedAt: createdAt } }); users.push(user.id);
    const workspace = await prisma.workspace.create({ data: { ownerId: user.id, name: secret, slug: `${prefix}-${index}`, createdAt, profile: { create: { company: secret, onboardingDone: index !== 1, createdAt } } } }); spaces.push(workspace.id);
    const contact = await prisma.contact.create({ data: { workspaceId: workspace.id, displayName: secret, privateNotes: secret, publicNotes: secret, createdAt } });
    const template = await prisma.stepTemplate.create({ data: { workspaceId: workspace.id, name: secret, channel: "EMAIL", createdAt } });
    const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, subject: secret, body: secret, createdAt } });
    const mix = await prisma.mix.create({ data: { workspaceId: workspace.id, name: secret, triggerMode: "MANUAL_START", status: "ACTIVE", createdAt } });
    const step = await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: version.id, sortOrder: 0, dayOffset: 0 } });
    const jump = await prisma.jump.create({ data: { workspaceId: workspace.id, contactId: contact.id, mixId: mix.id, mixStepId: step.id, stepVersionId: version.id,
      scheduledAt: at("2020-01-03"), createdAt, status: index === 1 ? "SKIPPED" : index === 3 ? "PENDING" : "DONE",
      completedAt: index === 3 ? null : at("2020-01-03"), completionMethod: index === 2 ? "automatic:email" : index === 1 ? "skipped" : "done",
      reason: secret, templateSnapshot: { body: secret }, renderedSnapshot: { body: secret }, uniquenessKey: randomUUID() } });
    return { user, workspace, contact, mix, jump };
  }
  const members = [];
  for (let i = 0; i < 4; i++) members.push(await account(i));
  const staff = await prisma.user.create({ data: { email: `${prefix}-staff@example.test`, name: secret, createdAt: at("2020-01-02"), staffMembership: { create: { role: "SUPPORT" } } } }); users.push(staff.id);
  await prisma.auditLog.create({ data: { workspaceId: members[0].workspace.id, actorType: "USER", actorUserId: members[0].user.id, action: "jump.done", entityType: "Jump", entityId: members[0].jump.id, source: "jumps.today", metadata: { private: secret }, createdAt: at("2020-01-03") } });
  await prisma.auditLog.create({ data: { workspaceId: members[1].workspace.id, actorType: "USER", actorUserId: members[1].user.id, action: "jump.skipped", entityType: "Jump", entityId: members[1].jump.id, source: "jumps.today", createdAt: at("2020-01-03") } });
  for (const [memberIndex, action, date] of [[0,"COMPOSED","2020-01-09"],[0,"COPIED","2020-02-01"],[1,"COPIED","2020-01-03"],[2,"OPENED","2020-01-03"],[3,"COPIED","2020-01-31"]] as const) {
    const m = members[memberIndex]; await prisma.jumpActionEvent.create({ data: { workspaceId: m.workspace.id, jumpId: m.jump.id, actorUserId: m.user.id, action, occurredAt: at(date), createdAt: at(date), metadata: { private: secret } } });
  }
  await prisma.contactActivity.createMany({ data: [
    { workspaceId: members[0].workspace.id, jumpId: members[0].jump.id, contactId: members[0].contact.id, actorUserId: members[0].user.id, kind: "JUMP_OUTCOME", outcome: "CONNECTED", summary: secret, occurredAt: at("2020-01-03"), createdAt: at("2020-01-03") },
    { workspaceId: members[2].workspace.id, jumpId: members[2].jump.id, contactId: members[2].contact.id, actorUserId: null, kind: "JUMP_OUTCOME", outcome: "COMPLETED", summary: secret, occurredAt: at("2020-01-03"), createdAt: at("2020-01-03") },
    { workspaceId: members[2].workspace.id, jumpId: members[2].jump.id, contactId: members[2].contact.id, actorUserId: staff.id, kind: "JUMP_OUTCOME", outcome: "COMPLETED", summary: secret, occurredAt: at("2020-01-03"), createdAt: at("2020-01-03") }
  ] });
  // Invalid cross-workspace and system attribution must not become member use.
  await prisma.jumpActionEvent.createMany({ data: [
    { workspaceId: members[2].workspace.id, jumpId: members[0].jump.id, actorUserId: members[2].user.id, action: "COMPOSED", occurredAt: at("2020-01-03") },
    { workspaceId: members[2].workspace.id, jumpId: members[2].jump.id, actorUserId: null, action: "COMPOSED", occurredAt: at("2020-01-03") },
    { workspaceId: members[2].workspace.id, jumpId: members[2].jump.id, actorUserId: staff.id, action: "COMPOSED", occurredAt: at("2020-01-03") }
  ] });
  for (const [index, status, day, verified, granted, joined] of [
    [0,"JOINED","2020-01-01",true,true,true], [1,"WAITING","2020-01-04",false,false,false],
    [2,"WAITING","2019-12-31",true,false,false], [3,"WITHDRAWN","2020-01-05",false,false,false],
    [4,"ACCESS_GRANTED","2020-01-06",false,true,false]
  ] as const) {
    const email = index < 4 ? members[index].user.email : `${prefix}-waiting@example.test`;
    const row = await prisma.waitlistEntry.create({ data: { email, status, createdAt: at(day), verifiedAt: verified ? at(day) : null, accessGrantedAt: granted ? at(day) : null, joinedAt: joined ? at("2020-01-02") : null } }); entries.push(row.id);
  }
  const wave = await prisma.waitlistWave.create({ data: { scheduledFor: at("2020-01-01"), createdAt: at("2020-01-02"), fifoCount: 5, randomCount: 5 } }); waves.push(wave.id);
  for (const [index, source] of [[0,"REFERRAL"],[1,"WAITLIST_FIFO"],[2,"WAITLIST_RANDOM"]] as const) {
    const createdAt = at(index === 0 ? "2020-01-01" : "2020-01-02");
    const row = await prisma.referralAccessInvite.create({ data: { recipientEmail: members[index].user.email, inviterUserId: index === 0 ? members[1].user.id : null,
      source, waveId: index === 0 ? null : wave.id, tokenHash: randomUUID(), tokenCiphertext: secret,
      createdAt, acceptedAt: index < 2 ? at(index === 0 ? "2020-01-02" : "2020-01-03") : null, acceptedUserId: index < 2 ? members[index].user.id : null } }); grants.push(row.id);
    const messageId = `${prefix}-mail-${index}`; messages.push(messageId);
    await prisma.emailMessage.create({ data: { id: messageId, recipientHash: secret, payloadHash: secret, category: "INVITATION", createdAt, firstAttemptAt: createdAt,
      acceptedAt: index < 2 ? createdAt : null, deliveredAt: index === 0 ? createdAt : null, failedAt: index === 2 ? at("2020-01-05") : null } });
    await prisma.waitlistDelivery.create({ data: { inviteId: row.id, emailMessageId: messageId, messageCiphertext: secret, createdAt, status: index < 2 ? "SENT" : "REVIEW" } });
    await prisma.emailSendAttempt.create({ data: { messageId, category: "INVITATION", createdAt: at(index === 0 ? "2020-01-01" : index === 1 ? "2020-01-03" : "2020-01-05") } });
  }
  const library = await prisma.sharedMix.create({ data: { title: "Current public library title", description: "Reviewed catalog fixture for aggregate reporting.", category: "Relationships", status: "APPROVED", durationDays: 7, steps: [] } }); shared.push(library.id);
  await prisma.sharedMixRevision.create({ data: { sharedMixId: library.id, version: 2, snapshot: { title: "Historical public library title" }, reason: "Public library version for reporting fixture" } });
  const copied = await prisma.sharedMixImport.create({ data: { workspaceId: members[0].workspace.id, mixId: members[0].mix.id, sharedMixId: library.id, importKey: randomUUID(), createdAt: at("2020-01-02") } }); imports.push(copied.id);
  await prisma.sharedMixImportMetadata.create({ data: { importId: copied.id, sharedMixVersion: 2 } });
  return { members, staff, secret, prefix, entries, range: parseReportRange({ from: "2020-01-01", through: "2020-01-31" }, new Date("2020-02-05T00:00:00Z")),
    cleanup
  };
  } catch (error) { await cleanup(); throw error; }
  async function cleanup() {
      await prisma.sharedMixImportMetadata.deleteMany({ where: { importId: { in: imports } } });
      await prisma.sharedMix.deleteMany({ where: { id: { in: shared } } });
      await prisma.referralAccessInvite.deleteMany({ where: { id: { in: grants } } });
      await prisma.emailMessage.deleteMany({ where: { id: { in: messages } } });
      await prisma.waitlistEntry.deleteMany({ where: { id: { in: entries } } });
      await prisma.waitlistWave.deleteMany({ where: { id: { in: waves } } });
      await prisma.jumpActionEvent.deleteMany({ where: { workspaceId: { in: spaces } } });
      await prisma.contactActivity.deleteMany({ where: { workspaceId: { in: spaces } } });
      await prisma.workspace.deleteMany({ where: { id: { in: spaces } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
  }
}
