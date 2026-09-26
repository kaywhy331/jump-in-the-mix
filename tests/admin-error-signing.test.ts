import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(), identity: vi.fn(), rate: vi.fn(), transaction: vi.fn(), findUser: vi.fn(), compare: vi.fn(),
  manageUser: vi.fn(), changeStaff: vi.fn(), assign: vi.fn(), triage: vi.fn(), status: vi.fn(), reply: vi.fn(),
  saveSystemMix: vi.fn(), releaseSystemMix: vi.fn(), saveLibrary: vi.fn(), releaseLibrary: vi.fn(), exportReport: vi.fn(),
  acknowledge: vi.fn(), retryJob: vi.fn(), clearSuppression: vi.fn(), changeAdmission: vi.fn(), readDraft: vi.fn(),
  enableMfa: vi.fn(), consumeMfa: vi.fn()
}));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw Object.assign(new Error(path), { digest: "NEXT_REDIRECT" }); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { authRateLimitSecret: "admin-error-signing-secret-000000001", requireAdminMfa: false } }));
vi.mock("@/lib/auth", () => ({ requirePlatformAdmin: mocks.admin, requirePlatformAdminIdentity: mocks.identity }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: mocks.rate }));
vi.mock("@/lib/request-context", () => ({ getRequestMetadata: async () => ({ ipAddress: "203.0.113.5" }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction, user: { findUnique: mocks.findUser }, platformAuditEvent: { create: vi.fn() }, auditLog: { create: vi.fn() } } }));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare } }));
vi.mock("@/lib/access-lock", () => ({ lockAccess: vi.fn() }));
vi.mock("@/lib/waitlist-delivery", () => ({ WAITLIST_RETRY_WINDOW_MS: 23 * 60 * 60_000 }));
vi.mock("@/lib/invitation-preferences", () => ({ invitationEmailSuppressed: vi.fn() }));
vi.mock("@/lib/staff-access", () => ({ lockStaff: vi.fn(), staffSessionHasPermissions: vi.fn(), changeStaffAccess: mocks.changeStaff, StaffAccessError: class StaffAccessError extends Error {} }));
vi.mock("@/lib/staff-invitation-actions", () => ({ sendStaffInvitationAction: vi.fn() }));
vi.mock("@/lib/user-admin", () => ({ manageUserAccess: mocks.manageUser, UserAdminError: class UserAdminError extends Error { constructor(message: string, readonly needsMfa = false) { super(message); } } }));
vi.mock("@/lib/support-case-access", () => ({ assignSupportTicket: mocks.assign, SupportAccessError: class SupportAccessError extends Error {} }));
vi.mock("@/lib/support-service", () => ({ adminReplyToSupportTicketRecord: mocks.reply, updateSupportTicketStatus: mocks.status, updateSupportTicketTriage: mocks.triage, SupportTicketError: class SupportTicketError extends Error {} }));
vi.mock("@/lib/support-email-recovery", () => ({ retrySupportEmail: vi.fn(), recoverSupportEmailReceipt: vi.fn(), repeatSupportEmail: vi.fn(), cancelSupportEmail: vi.fn() }));
vi.mock("@/lib/email-suppression-admin", () => ({ clearRecipientSuppression: mocks.clearSuppression, EmailReviewError: class EmailReviewError extends Error { constructor(message: string, readonly needsMfa = false) { super(message); } } }));
vi.mock("@/lib/invitation-receipt-recovery", () => ({ recoverInvitationReceipt: vi.fn(), repeatInvitationDelivery: vi.fn() }));
vi.mock("@/lib/system-mix-admin", () => ({ saveSystemMixDraft: mocks.saveSystemMix, releaseSystemMix: mocks.releaseSystemMix }));
vi.mock("@/lib/library-admin", () => ({ saveLibraryDraft: mocks.saveLibrary, releaseLibraryVersion: mocks.releaseLibrary }));
vi.mock("@/lib/report-exports", () => ({ requestReportExport: mocks.exportReport }));
vi.mock("@/lib/operations-alerts", () => ({ acknowledgeOperationsCheck: mocks.acknowledge, OperationsReviewError: class OperationsReviewError extends Error {} }));
vi.mock("@/lib/admin-job-retry", () => ({ retryFailedJob: mocks.retryJob, JobRetryError: class JobRetryError extends Error {} }));
vi.mock("@/lib/admission-admin", () => ({ changeAdmissionPolicy: mocks.changeAdmission }));
vi.mock("@/lib/admission-draft-cookie", () => ({ readAdmissionDraft: mocks.readDraft, writeAdmissionDraft: vi.fn(), clearAdmissionDraft: vi.fn() }));
vi.mock("@/lib/admin-mfa", () => ({ AdminMfaError: class AdminMfaError extends Error {}, enableAdminMfaCredential: mocks.enableMfa, consumeAdminMfaCode: mocks.consumeMfa, markAdminMfaSessionVerified: vi.fn() }));

import { UNVERIFIED_ERROR_MESSAGE, viewerErrorMessage, withViewerError } from "../src/lib/form-errors";
import { adminActionDestination } from "../src/lib/admin-navigation";
import { manageAccessInvitationAction } from "../src/lib/access-admin-actions";
import { manageUserAccessAction } from "../src/lib/user-admin-actions";
import { addStaffAccessAction, saveStaffAccessAction } from "../src/lib/staff-actions";
import { adminReplyToSupportTicketAction, adminUpdateSupportTicketStatusAction, adminUpdateSupportTicketTriageAction } from "../src/lib/support-admin-actions";
import { releaseSystemMixAction, saveSystemMixDraftAction } from "../src/lib/system-mix-admin-actions";
import { releaseSharedMixAction, saveSharedMixAdminAction } from "../src/lib/shared-mix-admin-actions";
import { requestReportExportAction } from "../src/lib/report-actions";
import { acknowledgeOperationsCheckAction } from "../src/lib/operations-actions";
import { retryFailedJobAction } from "../src/lib/admin-operations-actions";
import { clearRecipientSuppressionAction } from "../src/lib/email-suppression-actions";
import { changeAdmissionPolicyAction } from "../src/lib/admission-admin-actions";
import { enableAdminMfaAction, verifyAdminMfaAction } from "../src/lib/admin-mfa-actions";
import { INITIAL_ADMIN_MFA_STATE } from "../src/lib/admin-mfa-action-state";
import { UserAdminError } from "@/lib/user-admin";
import { StaffAccessError } from "@/lib/staff-access";
import { SystemMixError } from "@/lib/system-mix";
import { ReportError } from "@/lib/admin-report-range";
import { OperationsReviewError } from "@/lib/operations-alerts";
import { EmailReviewError } from "@/lib/email-suppression-admin";
import { AdmissionError } from "@/lib/admission";
import { AdminMfaError } from "@/lib/admin-mfa";

// The signed-in staff member (the session every staff guard returns) and another staff member.
const session = { id: "staff-session", authUser: { id: "staff-1" } };
const colleague = { authUser: { id: "staff-2" } };
const staff = { role: "OWNER", status: "ACTIVE", grants: [], denies: [] };
const DATABASE_TEXT = "Invalid prisma.user.update() invocation: connect ECONNREFUSED 10.0.4.2:5432";

const query = (location: string) => new URL(location, "https://jumpinthemix.com").searchParams;
const params = (location: string) => Object.fromEntries(query(location));
const form = (fields: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.set(key, value); return data; };
async function redirectOf(action: Promise<unknown>): Promise<string> {
  try { await action; } catch (error) { if (error instanceof Error && "digest" in error) return error.message; throw error; }
  throw new Error("Expected a redirect");
}
/** The page shows `message` to the staff member who caused it, and only the fixed sentence to anyone else. */
function expectSignedFor(location: string, message: string) {
  expect(query(location).getAll("error")).toEqual([message]);
  expect(viewerErrorMessage(params(location), session)).toBe(message);
  expect(viewerErrorMessage(params(location), colleague)).toBe(UNVERIFIED_ERROR_MESSAGE);
  expect(location).not.toContain("ECONNREFUSED");
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ session, user: { id: "staff-1", passwordHash: "stored-hash" }, staff, permissions: [] });
  mocks.identity.mockResolvedValue({ session, user: { id: "staff-1", passwordHash: "stored-hash", memberships: [] }, staff, permissions: [] });
  mocks.rate.mockResolvedValue({ allowed: true, remaining: 5, retryAfterSeconds: 0 });
  mocks.compare.mockResolvedValue(true);
});

describe("admin return pages carry one error, signed for the staff member", () => {
  it("drops an earlier signed error and notices before adding updates", () => {
    const data = form({ returnTo: "/admin/team?view=roster&q=ana&error=Old&at=1790000000&sig=old-signature&saved=1" });
    expect(adminActionDestination(data, "/admin/team")).toBe("/admin/team?view=roster&q=ana");
    expect(adminActionDestination(data, "/admin/team", { saved: "2" })).toBe("/admin/team?view=roster&q=ana&saved=2");
    expectSignedFor(withViewerError(adminActionDestination(data, "/admin/team"), "Reload the staff member before saving.", session), "Reload the staff member before saving.");
    // @ts-expect-error an error is signed with withViewerError, never passed as a notice
    adminActionDestination(data, "/admin/team", { error: "Unsigned" });
  });

  it("checks the staff member before refusing an unlisted invitation or account operation", async () => {
    const access = await redirectOf(manageAccessInvitationAction(form({ operation: "delete", returnTo: "/admin/access/invite-1?returnTo=%2Fadmin%2Faccess" })));
    expect(mocks.admin).toHaveBeenCalledExactlyOnceWith("access.read");
    expect(access.startsWith("/admin/access/invite-1?returnTo=%2Fadmin%2Faccess&error=")).toBe(true);
    expectSignedFor(access, "Choose a listed operation.");
    mocks.admin.mockClear();
    const account = await redirectOf(manageUserAccessAction(form({ operation: "erase", returnTo: "/admin/users/user-9?error=Old&at=1790000000&sig=x&updated=suspend" })));
    expect(mocks.admin).toHaveBeenCalledExactlyOnceWith("users.read");
    expect(query(account).has("updated")).toBe(false);
    expectSignedFor(account, "Choose a listed account operation.");
  });

  it("signs invitation and account refusals that follow the guard", async () => {
    mocks.transaction.mockResolvedValue(false);
    expectSignedFor(await redirectOf(manageAccessInvitationAction(form({ operation: "retry", inviteId: "invite-1", reason: "Recipient asked for another email" }))), "The invitation changed or cannot be safely retried. Check the provider record.");
    expect(mocks.admin).toHaveBeenCalledWith(["access.read", "jobs.retry"]);
    mocks.transaction.mockResolvedValue(true);
    expect(await redirectOf(manageAccessInvitationAction(form({ operation: "retry", inviteId: "invite-1", reason: "Recipient asked for another email" })))).toBe("/admin/access?done=retry");
    mocks.manageUser.mockRejectedValue(new UserAdminError("Enter your current administrator password."));
    expectSignedFor(await redirectOf(manageUserAccessAction(form({ operation: "suspend", userId: "user-9" }))), "Enter your current administrator password.");
  });

  it("signs staff access refusals on the team page", async () => {
    expectSignedFor(await redirectOf(addStaffAccessAction(form({ email: "not-an-email" }))), "Enter a valid staff email.");
    mocks.findUser.mockResolvedValue({ id: "user-7" });
    mocks.changeStaff.mockRejectedValue(new StaffAccessError("Keep at least one active owner."));
    const location = await redirectOf(saveStaffAccessAction(form({ currentPassword: "correct", email: "ana@example.test", revision: "0", returnTo: "/admin/team?edit=m1&error=Old&at=1790000000&sig=x" })));
    expect(location.startsWith("/admin/team?edit=m1&error=")).toBe(true);
    expectSignedFor(location, "Keep at least one active owner.");
  });

  it("signs support refusals and keeps database errors off the ticket", async () => {
    mocks.rate.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 300 });
    const limited = await redirectOf(adminUpdateSupportTicketTriageAction(form({ ticketId: "ticket-1" })));
    expect(limited.startsWith("/admin/support?error=")).toBe(true);
    expectSignedFor(limited, "Too many support actions. Please wait five minutes.");
    mocks.rate.mockResolvedValue({ allowed: true, remaining: 5, retryAfterSeconds: 0 });
    mocks.status.mockRejectedValue(new Error(DATABASE_TEXT));
    const failed = await redirectOf(adminUpdateSupportTicketStatusAction(form({ ticketId: "ticket-1", status: "OPEN", returnTo: "/admin/support?view=mine" })));
    expect(failed.startsWith("/admin/support/ticket-1?returnTo=%2Fadmin%2Fsupport%3Fview%3Dmine&error=")).toBe(true);
    expectSignedFor(failed, "Ticket status could not be updated.");
  });

  it("checks the staff member before a plain-form reply so its refusal can be signed", async () => {
    const location = await redirectOf(adminReplyToSupportTicketAction(form({ ticketId: "ticket-1", body: "x" })));
    expect(mocks.admin).toHaveBeenNthCalledWith(1, "support.manage");
    expectSignedFor(location, "Write a response of 2–5000 characters before sending it.");
    expect(mocks.reply).not.toHaveBeenCalled();
  });

  it("maps unknown System Mix and library failures to the fixed sentence and signs known ones", async () => {
    mocks.saveSystemMix.mockRejectedValue(new Error(DATABASE_TEXT));
    expectSignedFor(await redirectOf(saveSystemMixDraftAction(form({ subject: "s", body: "b", reason: "Adjust the wording" }))), "System Mix could not be updated. Please try again later.");
    mocks.releaseSystemMix.mockRejectedValue(new SystemMixError("Enter your administrator password."));
    expectSignedFor(await redirectOf(releaseSystemMixAction(form({ version: "2", operation: "publish" }))), "Enter your administrator password.");
    mocks.releaseLibrary.mockRejectedValue(new Error(DATABASE_TEXT));
    const release = await redirectOf(releaseSharedMixAction(form({ sharedMixId: "shared-1", returnTo: "/admin/templates" })));
    expect(release.startsWith("/admin/templates/shared-1/edit?returnTo=%2Fadmin%2Ftemplates&error=")).toBe(true);
    expectSignedFor(release, "The library change could not be saved. Please try again later.");
  });

  it("checks the staff member before a plain-form library save so its refusal can be signed", async () => {
    mocks.rate.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    const location = await redirectOf(saveSharedMixAdminAction(form({ title: "Draft" })));
    expect(mocks.admin).toHaveBeenNthCalledWith(1, "mixes.edit");
    expect(location.startsWith("/admin/templates/new?error=")).toBe(true);
    expectSignedFor(location, "Too many draft saves. Try again later.");
  });

  it("signs report, alert, job and suppression refusals on their return pages", async () => {
    mocks.exportReport.mockRejectedValue(new ReportError("Choose valid start and end dates."));
    const report = await redirectOf(requestReportExportAction(form({ from: "2026-09-01", through: "2026-09-02" })));
    expect(report.startsWith("/admin/reports/exports?from=2026-09-01&through=2026-09-02&error=")).toBe(true);
    expectSignedFor(report, "Choose valid start and end dates.");
    mocks.acknowledge.mockRejectedValue(new OperationsReviewError("Reload this alert before acknowledging it."));
    const alert = await redirectOf(acknowledgeOperationsCheckAction(form({ code: "email", revision: "1", reason: "Investigating", returnTo: "/admin/operations/alerts?view=all&error=Old&at=1790000000&sig=x" })));
    expect(alert.startsWith("/admin/operations/alerts?view=all&error=")).toBe(true);
    expectSignedFor(alert, "Reload this alert before acknowledging it.");
    mocks.retryJob.mockRejectedValue(new Error(DATABASE_TEXT));
    expectSignedFor(await redirectOf(retryFailedJobAction(form({ jobId: "job-1", failedAt: "x", returnTo: "/admin/operations?status=failed" }))), "The job could not be retried. Reload Operations.");
    mocks.clearSuppression.mockRejectedValue(new EmailReviewError("Enter your current administrator password."));
    const suppression = await redirectOf(clearRecipientSuppressionAction(form({ suppressionId: "sup-1" })));
    expect(suppression.startsWith("/admin/email/suppressions/sup-1?error=")).toBe(true);
    expectSignedFor(suppression, "Enter your current administrator password.");
  });

  it("signs admission refusals, keeps the draft in the address and hides unknown failures", async () => {
    expectSignedFor(await redirectOf(changeAdmissionPolicyAction(form({ operation: "not-a-draft", revision: "3" }))), "Reload admission controls and use a reason of at most 500 characters.");
    const operation = "0b7d4a4e-9a1c-4c1e-8f5e-2a9f3f1b6c7d";
    const fields = { operation, revision: "3", accountCeiling: "10", outstandingCeiling: "5", reason: "Open the next wave" };
    mocks.changeAdmission.mockRejectedValue(new AdmissionError("The administrator password is incorrect."));
    const refused = await redirectOf(changeAdmissionPolicyAction(form(fields)));
    expect(refused.startsWith(`/admin/admission?draft=${operation}&error=`)).toBe(true);
    expectSignedFor(refused, "The administrator password is incorrect.");
    mocks.changeAdmission.mockRejectedValue(new Error(DATABASE_TEXT));
    expectSignedFor(await redirectOf(changeAdmissionPolicyAction(form(fields))), "Admission controls could not be saved. Your draft is retained. Reload and review the saved settings before trying again.");
  });
});

describe("administrator MFA form messages", () => {
  it("show MFA wording and replace any other error with the fixed sentence", async () => {
    mocks.enableMfa.mockRejectedValue(new Error(DATABASE_TEXT));
    expect(await enableAdminMfaAction(INITIAL_ADMIN_MFA_STATE, form({ currentPassword: "correct", code: "123456" }))).toEqual({ status: "error", message: "Administrator MFA could not be enabled." });
    mocks.enableMfa.mockRejectedValue(new AdminMfaError("The authenticator code was not accepted. Check the device time and try again."));
    expect(await enableAdminMfaAction(INITIAL_ADMIN_MFA_STATE, form({ currentPassword: "correct", code: "123456" }))).toEqual({ status: "error", message: "The authenticator code was not accepted. Check the device time and try again." });
    mocks.consumeMfa.mockRejectedValue(new Error(DATABASE_TEXT));
    expect(await verifyAdminMfaAction(INITIAL_ADMIN_MFA_STATE, form({ code: "123456" }))).toEqual({ status: "error", message: "Administrator verification failed." });
  });
});
