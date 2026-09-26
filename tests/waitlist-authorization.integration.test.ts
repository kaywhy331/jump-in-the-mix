import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/env", async original => {
  const mod = await original<typeof import("../src/lib/env")>();
  return { ...mod, env: { ...mod.env, requireAdminMfa: true, pilotMode: false, appUrl: "https://example.test", dataEncryptionKey: "waitlist-authorization-test-key", resendApiKey: "test-key", emailFrom: "sender@example.test", authRateLimitSecret: "waitlist-authorization-signing-secret" } };
});
const auth = vi.hoisted(() => ({ require: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requirePlatformAdmin: auth.require }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { prisma } from "../src/lib/prisma";
import { inviteWaitlistSelectionAction, setWaitlistScheduleAction } from "../src/lib/waitlist-admin-actions";
import { inviteSelectedWaitlistEntries } from "../src/lib/waitlist";
import { lockStaff, staffSessionHasPermissions } from "../src/lib/staff-access";
import { createEmailReviewFixture } from "./helpers/email-review-fixture";
import { openTestAdmission } from "./helpers/admission-fixture";
import { viewerErrorMessage } from "../src/lib/form-errors";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const changes = ["valid", "permission", "read-permission", "disabled-staff", "session", "expired-session", "mfa", "expired-mfa", "credential", "suspended", "unverified"] as const;
describe.skipIf(!local).sequential("waitlist mutation authorization on PostgreSQL", () => {
  let fixture: Awaited<ReturnType<typeof createEmailReviewFixture>>;
  let restore: () => Promise<void>;
  let previousSchedule: Awaited<ReturnType<typeof prisma.waitlistSchedule.findUnique>>;
  beforeEach(async () => {
    restore = await openTestAdmission();
    previousSchedule = await prisma.waitlistSchedule.findUnique({ where: { id: "default" } });
    fixture = await createEmailReviewFixture();
    auth.require.mockReset();
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected outbound operation"); }));
  });
  afterEach(async () => {
    if (previousSchedule) await prisma.waitlistSchedule.upsert({ where: { id: "default" }, create: previousSchedule, update: previousSchedule });
    else await prisma.waitlistSchedule.deleteMany();
    await prisma.waitlistAudit.deleteMany({ where: { actorUserId: fixture.user.id } });
    await fixture.cleanup();
    await restore();
    vi.unstubAllGlobals();
  });

  it.each(["manual", "schedule"].flatMap(action => changes.map(change => [action, change] as const)))("%s checks live %s after route authorization", async (action, change) => {
    const actor = { userId: fixture.user.id, sessionId: fixture.session.id };
    const permission = action === "manual" ? "waitlist.manage" : "waves.pause";
    const currentAuthority = () => prisma.$transaction(async tx => { await lockStaff(tx); return staffSessionHasPermissions(tx, actor, ["waitlist.read", permission]); });
    expect(await currentAuthority()).toBe(true);
    const entry = await prisma.waitlistEntry.create({ data: { email: fixture.email, verifiedAt: new Date() } });
    const initialSchedule = await prisma.waitlistSchedule.upsert({ where: { id: "default" }, create: { paused: false, nextRunAt: new Date() }, update: { paused: false } });
    // A real route guard succeeded, then authority changed before the mutation.
    auth.require.mockImplementationOnce(async () => {
      if (change === "permission" || change === "read-permission") await prisma.staffMembership.update({ where: { userId: actor.userId }, data: { denies: [change === "permission" ? permission : "waitlist.read"] } });
      if (change === "disabled-staff") await prisma.staffMembership.update({ where: { userId: actor.userId }, data: { status: "DISABLED" } });
      if (change === "session") await prisma.session.delete({ where: { id: actor.sessionId } });
      if (change === "expired-session") await prisma.session.update({ where: { id: actor.sessionId }, data: { expiresAt: new Date(0) } });
      if (change === "mfa") await prisma.adminMfaSession.deleteMany({ where: { userId: actor.userId } });
      if (change === "expired-mfa") await prisma.adminMfaSession.updateMany({ where: { userId: actor.userId }, data: { expiresAt: new Date(0) } });
      if (change === "credential") await prisma.adminMfaCredential.update({ where: { userId: actor.userId }, data: { enabledAt: null } });
      if (change === "suspended") await prisma.user.update({ where: { id: actor.userId }, data: { suspendedAt: new Date() } });
      if (change === "unverified") await prisma.user.update({ where: { id: actor.userId }, data: { emailVerifiedAt: null } });
      expect(await currentAuthority()).toBe(change === "valid");
      return { user: fixture.user, session: { ...fixture.session, authUser: fixture.user } };
    });
    const form = new FormData(); form.set("entryId", entry.id); form.set("scheduleAction", "pause"); form.set("reason", "Waitlist authorization regression");
    const run = action === "manual" ? inviteWaitlistSelectionAction : setWaitlistScheduleAction;
    const location = await run(form).then(() => "", (error: Error) => error.message.replace(/^REDIRECT /, ""));
    if (change === "valid") expect(location).toContain(action === "manual" ? "queued=1&skipped=0" : "/admin/waitlist");
    // The refusal is signed for the staff member who acted, whose access just changed.
    else expect(viewerErrorMessage(Object.fromEntries(new URL(location, "https://example.test").searchParams), { authUser: fixture.user })).toBe(`Your staff access changed. Sign in and verify your current permissions before ${action === "manual" ? "sending invitations" : "changing weekly waves"}.`);
    const granted = change === "valid" && action === "manual";
    expect(await prisma.waitlistEntry.findUnique({ where: { id: entry.id } })).toMatchObject({ status: granted ? "ACCESS_GRANTED" : "WAITING" });
    expect(await prisma.referralAccessInvite.count({ where: { recipientEmail: fixture.email } })).toBe(granted ? 1 : 0);
    expect(await prisma.waitlistDelivery.count({ where: { invite: { recipientEmail: fixture.email } } })).toBe(granted ? 1 : 0);
    expect(await prisma.waitlistAudit.count({ where: { actorUserId: actor.userId } })).toBe(change === "valid" ? 1 : 0);
    const schedule = await prisma.waitlistSchedule.findUnique({ where: { id: "default" } });
    if (change === "valid" && action === "schedule") expect(schedule).toMatchObject({ paused: true, nextRunAt: initialSchedule.nextRunAt });
    else expect(schedule).toEqual(initialSchedule);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires live authority in the allocation service even without the route guard", async () => {
    const entry = await prisma.waitlistEntry.create({ data: { email: fixture.email, verifiedAt: new Date() } });
    await expect(inviteSelectedWaitlistEntries([entry.id], { userId: fixture.user.id, sessionId: "missing" }, "Direct service access")).rejects.toThrow("staff access changed");
    expect(await prisma.referralAccessInvite.count({ where: { recipientEmail: fixture.email } })).toBe(0);
  });

  it("keeps zero limits closed and explains the required configuration without queueing anything", async () => {
    await prisma.admissionPolicy.update({ where: { id: "default" }, data: { accountCeiling: 0, outstandingCeiling: 0 } });
    const entry = await prisma.waitlistEntry.create({ data: { email: fixture.email, verifiedAt: new Date() } });
    await expect(inviteSelectedWaitlistEntries([entry.id], { userId: fixture.user.id, sessionId: fixture.session.id }, "Zero-capacity regression")).rejects.toThrow("The selected invitations were not queued. Invitation limits are not configured.");
    expect(await prisma.waitlistEntry.findUnique({ where: { id: entry.id } })).toMatchObject({ status: "WAITING", accessGrantedAt: null });
    expect(await prisma.referralAccessInvite.count({ where: { recipientEmail: fixture.email } })).toBe(0);
    expect(await prisma.waitlistDelivery.count({ where: { invite: { recipientEmail: fixture.email } } })).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});
