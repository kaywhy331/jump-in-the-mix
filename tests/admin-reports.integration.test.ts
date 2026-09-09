import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readAdminReport } from "../src/lib/admin-report-data";
import { parseReportRange } from "../src/lib/admin-report-range";
import { createReportFixture } from "./helpers/report-fixture";
import { prisma } from "../src/lib/prisma";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local)("aggregate administration reports on PostgreSQL", () => {
  let fixture: Awaited<ReturnType<typeof createReportFixture>>;
  beforeAll(async () => { fixture = await createReportFixture(); }, 30_000);
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => { await fixture?.cleanup(); }, 30_000);
  async function repeatedDelivery(source: "REFERRAL" | "WAITLIST_FIFO" | "WAITLIST_RANDOM", run: (ids: { originalMessageId: string; currentMessageId: string; inviteId: string }) => Promise<void>) {
    const original = await prisma.waitlistDelivery.findFirstOrThrow({ where: { invite: { source, recipientEmail: { startsWith: fixture.prefix } } }, include: { emailMessage: true, invite: true } });
    const message = original.emailMessage!;
    const currentMessageId = `${message.id}-repeat`;
    let historyId: string | undefined;
    try {
      historyId = (await prisma.invitationDeliveryHistory.create({ data: { deliveryId: original.id, generation: original.generation, emailMessageId: message.id,
        status: original.status, attempts: original.attempts, firstAttemptAt: original.firstAttemptAt, generationStartedAt: original.createdAt, archivedAt: new Date("2020-01-06T12:00:00Z") } })).id;
      await prisma.emailMessage.create({ data: { id: currentMessageId, recipientHash: message.recipientHash, payloadHash: message.payloadHash, category: "INVITATION", firstAttemptAt: new Date("2020-01-07T12:00:00Z"), createdAt: new Date("2020-01-07T12:00:00Z") } });
      await prisma.waitlistDelivery.update({ where: { id: original.id }, data: { emailMessageId: currentMessageId, generation: original.generation + 1, generationStartedAt: new Date("2020-01-06T12:00:00Z"), status: "QUEUED" } });
      await run({ originalMessageId: message.id, currentMessageId, inviteId: original.inviteId! });
    } finally {
      await prisma.waitlistDelivery.update({ where: { id: original.id }, data: { emailMessageId: original.emailMessageId, generation: original.generation, generationStartedAt: original.generationStartedAt, status: original.status } });
      await prisma.emailMessage.update({ where: { id: message.id }, data: { acceptedAt: message.acceptedAt, deliveredAt: message.deliveredAt } });
      await prisma.referralAccessInvite.update({ where: { id: original.inviteId! }, data: { lastSentAt: original.invite!.lastSentAt } });
      if (historyId) await prisma.invitationDeliveryHistory.delete({ where: { id: historyId } });
      await prisma.emailMessage.deleteMany({ where: { id: currentMessageId } });
    }
  }
  it("returns explicit zero cohorts and a complete bounded UTC calendar when no records fall in the range", async () => {
    const range = parseReportRange({ from: "2010-02-01", through: "2010-02-28" }, new Date("2010-03-01T00:00:00Z"));
    const report = await readAdminReport(range);
    expect(report.accounts.created).toBe(0); expect(report.accounts.d7Eligible).toBe(0);
    expect(report.sources).toEqual([]); expect(report.library).toEqual([]);
    expect(report.daily).toHaveLength(28);
    expect(report.daily[0]).toMatchObject({ day: "2010-02-01", accounts: 0, active: 0, completed: 0 });
    expect(report.daily.at(-1)?.day).toBe("2010-02-28");
  });
  it("counts member actions once per account, excludes automatic/support/page-open events, and reports mature retention denominators", async () => {
    const report = await readAdminReport(fixture.range);
    expect(report.accounts).toEqual({ created: 4, verified: 4, setup: 3, withContact: 4, withMix: 4, activated: 1, activeInRange: 3, d7Eligible: 2, d7Returned: 1, d30Eligible: 2, d30Returned: 1 });
    expect(report.daily.find(row => row.day === "2020-01-03")).toMatchObject({ accounts: 0, active: 2, completed: 2, skipped: 1 });
    expect(report.daily.find(row => row.day === "2020-01-30")?.accounts).toBe(1);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(fixture.secret);
    for (const member of fixture.members) { expect(serialized).not.toContain(member.user.id); expect(serialized).not.toContain(member.user.email); }
  });
  it("keeps waitlist cohorts separate from current queue age and grant acceptance separate from mail receipts", async () => {
    const report = await readAdminReport(fixture.range);
    expect(report.waitlist).toEqual({ requested: 4, confirmed: 1, granted: 2, joined: 1, withdrawn: 1, waitingNow: 1, oldestWaitingDays: 35 });
    expect(report.sources.find(row => row.source === "REFERRAL")).toMatchObject({ issued: 1, accepted: 1, activated: 1, invitingMembers: 1, providerAccepted: 1, delivered: 1, medianJoinHours: 24 });
    expect(report.sources.find(row => row.source === "WAITLIST_FIFO")).toMatchObject({ issued: 1, accepted: 1, activated: 0, providerAccepted: 1, delivered: 0 });
    expect(report.sources.find(row => row.source === "WAITLIST_RANDOM")).toMatchObject({ issued: 1, accepted: 0, providerAccepted: 0, review: 1, medianJoinHours: null });
    expect(report.waves).toHaveLength(1);
    expect(report.waves[0]).toMatchObject({ fifo: 5, random: 5, retainedInvites: 2, accepted: 1, activated: 0, providerAccepted: 1, delivered: 0, queued: 0, review: 1 });
  });
  it("attributes catalog outcomes to the copied version without exposing customer mix titles or multiplying imports", async () => {
    const report = await readAdminReport(fixture.range);
    expect(report.library).toEqual([{ title: "Historical public library title", version: 2, copies: 1, completed: 1, skipped: 0, connected: 1 }]);
    expect(report.daily.find(row => row.day === "2020-01-01")?.emailAttempts).toBe(1);
    expect(report.daily.find(row => row.day === "2020-01-05")?.emailFailures).toBe(1);
  });
  it.each(["REFERRAL", "WAITLIST_FIFO"] as const)("preserves %s delivery evidence across a repeat and counts multiple receipts once per grant", async source => {
    await repeatedDelivery(source, async ({ originalMessageId, currentMessageId }) => {
      await prisma.emailMessage.update({ where: { id: originalMessageId }, data: { deliveredAt: new Date("2020-01-03T12:00:00Z") } });
      for (const acceptedAt of [null, new Date("2020-02-06T12:00:00Z"), new Date("2020-01-07T12:00:00Z")]) {
        await prisma.emailMessage.update({ where: { id: currentMessageId }, data: { acceptedAt, deliveredAt: acceptedAt } });
        const report = await readAdminReport(fixture.range);
        expect(report.sources.find(row => row.source === source)).toMatchObject({ issued: 1, accepted: 1, providerAccepted: 1, delivered: 1, queued: 1 });
        expect(report.waves[0]).toMatchObject({ retainedInvites: 2, accepted: 1, providerAccepted: 1, delivered: source === "WAITLIST_FIFO" ? 1 : 0, queued: source === "WAITLIST_FIFO" ? 1 : 0 });
        expect(report.daily.reduce((sum, day) => sum + day.issued, 0)).toBe(3);
        expect(report.daily.reduce((sum, day) => sum + day.emailAttempts, 0)).toBe(3);
      }
    });
  });
  it("includes a late receipt for an archived generation only once its event time is observed", async () => {
    await repeatedDelivery("WAITLIST_RANDOM", async ({ originalMessageId }) => {
      expect((await readAdminReport(fixture.range)).sources.find(row => row.source === "WAITLIST_RANDOM")).toMatchObject({ providerAccepted: 0, delivered: 0, accepted: 0 });
      await prisma.emailMessage.update({ where: { id: originalMessageId }, data: { acceptedAt: new Date("2020-02-06T12:00:00Z"), deliveredAt: new Date("2020-02-06T12:00:00Z") } });
      expect((await readAdminReport(fixture.range)).sources.find(row => row.source === "WAITLIST_RANDOM")).toMatchObject({ providerAccepted: 0, delivered: 0 });
      const later = await readAdminReport(parseReportRange({ from: fixture.range.fromDay, through: fixture.range.throughDay }, new Date("2020-02-07T00:00:00Z")));
      expect(later.sources.find(row => row.source === "WAITLIST_RANDOM")).toMatchObject({ issued: 1, providerAccepted: 1, delivered: 1, accepted: 0, queued: 1 });
      expect(later.waves[0]).toMatchObject({ retainedInvites: 2, providerAccepted: 2, delivered: 1, accepted: 1 });
      expect(JSON.stringify(later)).not.toContain(fixture.secret);
      expect(JSON.stringify(later)).not.toContain(originalMessageId);
    });
  });
  it("preserves earlier legacy acceptance when a newer generation has a receipt after observation time", async () => {
    await repeatedDelivery("REFERRAL", async ({ originalMessageId, currentMessageId, inviteId }) => {
      await prisma.emailMessage.update({ where: { id: originalMessageId }, data: { acceptedAt: null, deliveredAt: null } });
      await prisma.referralAccessInvite.update({ where: { id: inviteId }, data: { lastSentAt: new Date("2020-01-01T12:00:00Z") } });
      await prisma.emailMessage.update({ where: { id: currentMessageId }, data: { acceptedAt: new Date("2020-02-06T12:00:00Z"), deliveredAt: new Date("2020-02-06T12:00:00Z") } });
      const report = await readAdminReport(fixture.range);
      expect(report.sources.find(row => row.source === "REFERRAL")).toMatchObject({ issued: 1, providerAccepted: 1, delivered: 0 });
    });
  });
  it("excludes designated test accounts and addresses from growth metrics while preserving actual email usage", async () => {
    vi.stubEnv("REPORT_EXCLUDED_USER_IDS", fixture.members[0].user.id);
    vi.stubEnv("REPORT_EXCLUDED_EMAILS", fixture.members[3].user.email);
    const report = await readAdminReport(fixture.range);
    expect(report.accounts.created).toBe(2); expect(report.accounts.activeInRange).toBe(1); expect(report.accounts.activated).toBe(0);
    expect(report.waitlist.requested).toBe(2); expect(report.sources.some(row => row.source === "REFERRAL")).toBe(false);
    expect(report.library).toEqual([]);
    expect(report.daily.reduce((sum, row) => sum + row.emailAttempts, 0)).toBe(3);
  });
  it("uses exclusive UTC end boundaries and does not treat a return on the following day as D7 retention", async () => {
    const action = await prisma.jumpActionEvent.create({ data: { workspaceId: fixture.members[1].workspace.id, jumpId: fixture.members[1].jump.id, actorUserId: fixture.members[1].user.id,
      action: "COPIED", occurredAt: new Date("2020-01-10T12:00:00Z") } });
    try {
      const report = await readAdminReport(fixture.range);
      expect(report.accounts.d7Returned).toBe(1);
      const january = report.daily.reduce((sum, row) => sum + row.active, 0);
      expect(january).toBe(5); // Jan 3: two; Jan 9, Jan 10 and Jan 31: one each.
      expect(report.daily.some(row => row.day.startsWith("2020-02"))).toBe(false);
    } finally { await prisma.jumpActionEvent.delete({ where: { id: action.id } }); }
  });
  it("excludes an outstanding invitation to a designated account and invitations from an excluded inviter", async () => {
    vi.stubEnv("REPORT_EXCLUDED_USER_IDS", fixture.members[2].user.id);
    vi.stubEnv("REPORT_EXCLUDED_EMAILS", fixture.members[1].user.email.toUpperCase());
    const report = await readAdminReport(fixture.range);
    expect(report.sources).toEqual([]);
    expect(report.daily.reduce((sum, row) => sum + row.emailAttempts, 0)).toBe(3);
  });
  it("does not infer a connected outcome from system activity metadata", async () => {
    const recorded = await prisma.contactActivity.findFirstOrThrow({ where: { workspaceId: fixture.members[0].workspace.id, outcome: "CONNECTED" } });
    await prisma.contactActivity.update({ where: { id: recorded.id }, data: { kind: "SYSTEM" } });
    try {
      const report = await readAdminReport(fixture.range);
      expect(report.library[0].connected).toBe(0);
    } finally { await prisma.contactActivity.update({ where: { id: recorded.id }, data: { kind: recorded.kind } }); }
  });
  it("excludes staff-only identities from waitlist and invitation growth, including unaccepted grants", async () => {
    const entry = await prisma.waitlistEntry.create({ data: { email: fixture.staff.email, createdAt: new Date("2020-01-01T00:00:00Z"), verifiedAt: new Date("2020-01-01T00:00:00Z") } });
    let grantId: string | undefined;
    try {
      grantId = (await prisma.referralAccessInvite.create({ data: { recipientEmail: fixture.staff.email, source: "WAITLIST_MANUAL", tokenHash: fixture.prefix, tokenCiphertext: fixture.secret, createdAt: new Date("2020-01-01T00:00:00Z") } })).id;
      const report = await readAdminReport(fixture.range);
      expect(report.waitlist.requested).toBe(4); expect(report.waitlist.waitingNow).toBe(1);
      expect(report.sources.some(s => s.source === "WAITLIST_MANUAL")).toBe(false);
    } finally {
      if (grantId) await prisma.referralAccessInvite.delete({ where: { id: grantId } });
      await prisma.waitlistEntry.delete({ where: { id: entry.id } });
    }
  });
});
