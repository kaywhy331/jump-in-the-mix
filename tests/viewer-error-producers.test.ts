import { beforeEach, describe, expect, it, vi } from "vitest";

// Error redirects from the signed-in pages' actions carry text only when it is known wording, signed for the
// person who caused it; a database, network or unexpected failure shows the action's fixed sentence instead.
const mocks = vi.hoisted(() => ({
  workspace: vi.fn(),
  transaction: vi.fn(),
  calendarCount: vi.fn(), calendarCreate: vi.fn(), calendarDelete: vi.fn(),
  contactFindMany: vi.fn(), contactFindFirst: vi.fn(), relationshipStates: vi.fn(), mixFindFirst: vi.fn(),
  importCalendar: vi.fn(), syncCalendar: vi.fn(), recordOutcome: vi.fn(),
  setActiveGroups: vi.fn(), resolveIntake: vi.fn(), startEligible: vi.fn(),
  createTicket: vi.fn(), replyTicket: vi.fn(), reopenTicket: vi.fn()
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/env")>();
  return { ...actual, env: { ...actual.env, authRateLimitSecret: "viewer-error-producers-secret-00001" } };
});
vi.mock("@/lib/auth", () => ({ requireWorkspace: mocks.workspace }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  $transaction: mocks.transaction,
  calendarConnection: { count: mocks.calendarCount, create: mocks.calendarCreate, delete: mocks.calendarDelete },
  contact: { findMany: mocks.contactFindMany, findFirst: mocks.contactFindFirst },
  contactRelationshipState: { findMany: mocks.relationshipStates },
  mix: { findFirst: mocks.mixFindFirst },
  userPreference: { findUnique: async () => null }
} }));
vi.mock("@/lib/calendar", () => ({ importCalendar: mocks.importCalendar, syncCalendarConnection: mocks.syncCalendar, queueBoundReconciliation: vi.fn() }));
vi.mock("@/lib/appointment-bindings", () => ({ ContactChoiceRequiredError: class ContactChoiceRequiredError extends Error {}, recordAppointmentOutcome: mocks.recordOutcome, scheduleVisit: vi.fn(), setAppointmentBindingDelivery: vi.fn(), setAppointmentBindingHold: vi.fn() }));
vi.mock("@/lib/integration-crypto", () => ({ encryptIntegrationCredentials: () => "encrypted" }));
vi.mock("@/lib/group-activity", () => ({ isGroupActive: vi.fn(), setActiveWorkspaceGroups: mocks.setActiveGroups }));
vi.mock("@/lib/intake", () => ({ IntakeError: class IntakeError extends Error {}, resolveIntake: mocks.resolveIntake }));
vi.mock("@/lib/mix-start-eligibility", () => ({ assertMixStartEligible: mocks.startEligible }));
vi.mock("@/lib/support-service", () => ({ SupportTicketError: class SupportTicketError extends Error {}, createSupportTicketRecord: mocks.createTicket, replyToSupportTicketRecord: mocks.replyTicket, reopenSupportTicketRecord: mocks.reopenTicket }));
vi.mock("@/lib/support-case-access", () => ({ SupportAccessError: class SupportAccessError extends Error {} }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: async () => ({ allowed: true, remaining: 5, retryAfterSeconds: 0 }) }));
vi.mock("@/lib/request-context", () => ({ getRequestMetadata: async () => ({ ipAddress: "203.0.113.9", userAgent: "vitest" }) }));
vi.mock("@/lib/placeholders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/placeholders")>();
  // A stand-in for an unexpected failure inside the one-time follow-up's checks.
  return { ...actual, findUnknownPlaceholders: (content: string) => { if (content.includes("{{explode}}")) throw new TypeError("renderer crashed reading 10.0.0.5"); return actual.findUnknownPlaceholders(content); } };
});

import { applyJumpToContactsAction } from "../src/lib/bulk-contact-actions";
import { appointmentOutcomeAction, calendarConnectionAction } from "../src/lib/calendar-actions";
import { assignMixToContactAction } from "../src/lib/contact-mix-actions";
import { UNVERIFIED_ERROR_MESSAGE, viewerErrorMessage } from "../src/lib/form-errors";
import { saveActiveGroupsAction } from "../src/lib/group-actions";
import { IntakeError } from "../src/lib/intake";
import { intakeConnectionAction, reviewIntakeAction } from "../src/lib/intake-actions";
import { createSupportTicketAction, reopenSupportTicketAction, replyToSupportTicketAction } from "../src/lib/support-actions";
import { SupportAccessError } from "../src/lib/support-case-access";
import { SupportTicketError } from "../src/lib/support-service";
import { UserFacingError } from "../src/lib/user-facing-error";

const owner = { authUser: { id: "owner" } }, someoneElse = { authUser: { id: "someone-else" } };
const databaseFailure = () => new Error("Invalid `prisma.x.create()` invocation: Can't reach database server at db.internal:5432");

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  return data;
}
async function redirected(action: Promise<unknown>): Promise<string> {
  try { await action; } catch (error) { if (error instanceof Error && error.message.startsWith("REDIRECT ")) return error.message.slice("REDIRECT ".length); throw error; }
  throw new Error("The action did not redirect.");
}
/** The page's banner text for `viewer`, and the path and fragment the redirect kept. */
function shown(location: string, viewer = owner) {
  const url = new URL(location, "https://app.invalid");
  return { path: url.pathname, hash: url.hash, text: viewerErrorMessage(Object.fromEntries(url.searchParams), viewer) };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.workspace.mockResolvedValue({ session: owner, user: { id: "owner", name: "Owner" }, workspace: { id: "workspace-1", ownerId: "owner", profile: null }, impersonation: null });
});

describe("calendar", () => {
  it("keeps its own refusals and advice for an address it will not fetch", async () => {
    const unnamed = await redirected(calendarConnectionAction(form({ intent: "connect", name: "", timezone: "UTC", url: "https://calendar.example/feed.ics" })));
    expect(shown(unnamed)).toEqual({ path: "/calendar", hash: "#calendar-connections", text: "Give this calendar a name of up to 100 characters." });
    expect(shown(unnamed, someoneElse).text).toBe(UNVERIFIED_ERROR_MESSAGE);
    mocks.calendarCount.mockResolvedValue(0);
    for (const url of ["http://calendar.example/feed.ics", "not a url"]) {
      expect(shown(await redirected(calendarConnectionAction(form({ intent: "connect", name: "Work", timezone: "UTC", url })))).text).toBe("Use an HTTPS calendar URL without a username, password, or custom port.");
    }
    expect(mocks.calendarCreate).not.toHaveBeenCalled();
  });

  it("shows the fixed sentence for an import or refresh that fails, never the failure's text", async () => {
    mocks.calendarCount.mockResolvedValue(0);
    mocks.calendarCreate.mockResolvedValue({ id: "connection-1" });
    mocks.importCalendar.mockRejectedValue(databaseFailure());
    const file = new File(["BEGIN:VCALENDAR\nEND:VCALENDAR"], "work.ics", { type: "text/calendar" });
    const data = form({ intent: "import", name: "Work", timezone: "UTC" });
    data.set("file", file);
    const imported = await redirected(calendarConnectionAction(data));
    expect(shown(imported)).toEqual({ path: "/calendar", hash: "#calendar-connections", text: "The calendar could not be updated." });
    expect(decodeURIComponent(imported)).not.toContain("db.internal");
    expect(mocks.calendarDelete).toHaveBeenCalledWith({ where: { id: "connection-1" } });
    mocks.syncCalendar.mockRejectedValue(new Error("getaddrinfo ENOTFOUND calendar.internal"));
    expect(shown(await redirected(calendarConnectionAction(form({ intent: "sync", id: "connection-1" })))).text).toBe("The calendar could not be updated.");
    mocks.syncCalendar.mockRejectedValue(new UserFacingError("This calendar was just refreshed. Try again in a minute."));
    expect(shown(await redirected(calendarConnectionAction(form({ intent: "sync", id: "connection-1" })))).text).toBe("This calendar was just refreshed. Try again in a minute.");
  });

  it("signs the appointment outcome's refusal and keeps the chosen day", async () => {
    mocks.recordOutcome.mockResolvedValue({ ok: false, message: "This visit changed. Refresh the calendar before recording it." });
    const refused = await redirected(appointmentOutcomeAction(form({ id: "entry-1", version: "2", outcome: "COMPLETED", date: "2026-09-25" })));
    expect(refused.startsWith("/calendar?date=2026-09-25&error=")).toBe(true);
    expect(shown(refused).text).toBe("This visit changed. Refresh the calendar before recording it.");
    mocks.recordOutcome.mockResolvedValue({ ok: true });
    expect(await redirected(appointmentOutcomeAction(form({ id: "entry-1", version: "2", outcome: "COMPLETED", date: "2026-09-25" })))).toBe("/calendar?date=2026-09-25&saved=1");
  });
});

describe("Contacts", () => {
  const people = [{ id: "c1", displayName: "Maria Lopez", emails: [], phones: [], addresses: [], customFieldValues: [] }];

  it("names the people a one-time follow-up cannot reach, for the owner only", async () => {
    mocks.contactFindMany.mockResolvedValue(people);
    mocks.relationshipStates.mockResolvedValue([{ contactId: "c1" }]);
    const location = await redirected(applyJumpToContactsAction(form({ contactIds: "c1", applyMode: "manual", manualChannel: "SMS", manualBody: "Hi" })));
    expect(shown(location)).toMatchObject({ path: "/contacts", text: "Do-not-contact is enabled for Maria Lopez. Clear that permission before creating outreach." });
    expect(shown(location, someoneElse).text).toBe(UNVERIFIED_ERROR_MESSAGE);
  });

  it("keeps a one-time follow-up's own validation and hides an unexpected failure", async () => {
    mocks.contactFindMany.mockResolvedValue(people);
    mocks.relationshipStates.mockResolvedValue([]);
    expect(shown(await redirected(applyJumpToContactsAction(form({ contactIds: "c1", applyMode: "manual", manualChannel: "FAX" })))).text).toBe("Choose a valid message type.");
    const crashed = await redirected(applyJumpToContactsAction(form({ contactIds: "c1", applyMode: "manual", manualChannel: "SMS", manualBody: "Hi {{explode}}" })));
    expect(shown(crashed).text).toBe("The one-time follow-up could not be prepared.");
    expect(decodeURIComponent(crashed)).not.toContain("10.0.0.5");
  });

  it("shows the fixed sentence when starting a Mix fails", async () => {
    mocks.mixFindFirst.mockResolvedValue({ id: "mix-1", triggerMode: "MANUAL_START", steps: [] });
    mocks.contactFindFirst.mockResolvedValue({ id: "c1" });
    mocks.transaction.mockRejectedValue(databaseFailure());
    expect(shown(await redirected(assignMixToContactAction(form({ contactId: "c1", mixId: "mix-1" }))))).toEqual({ path: "/contacts/c1", hash: "", text: "This Mix could not be started." });
  });

  it("shows the fixed sentence when saving the active tags fails", async () => {
    mocks.setActiveGroups.mockRejectedValue(databaseFailure());
    expect(shown(await redirected(saveActiveGroupsAction(form({ activeGroupIds: "group-1" }))))).toMatchObject({ path: "/contacts", text: "The active tag selection could not be saved." });
  });

  it("shows a service's own user-facing refusal", async () => {
    mocks.mixFindFirst.mockResolvedValue({ id: "mix-1", triggerMode: "MANUAL_START", steps: [] });
    mocks.contactFindFirst.mockResolvedValue({ id: "c1" });
    mocks.transaction.mockRejectedValue(new UserFacingError("This Mix is stopped for this person. Open More on their contact profile to review and resume the stopped Mix."));
    expect(shown(await redirected(assignMixToContactAction(form({ contactId: "c1", mixId: "mix-1" })))).text).toBe("This Mix is stopped for this person. Open More on their contact profile to review and resume the stopped Mix.");
    mocks.setActiveGroups.mockRejectedValue(new UserFacingError("One or more selected tags are unavailable."));
    expect(shown(await redirected(saveActiveGroupsAction(form({ activeGroupIds: "group-1" })))).text).toBe("One or more selected tags are unavailable.");
  });
});

describe("lead connections", () => {
  const tx = { $queryRaw: vi.fn(), intakeConnection: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn() }, auditLog: { create: vi.fn() } };

  it("keeps the page's own refusals and the inquiry service's, and hides anything else", async () => {
    mocks.transaction.mockImplementation(async (run: (client: typeof tx) => Promise<unknown>) => run(tx));
    expect(shown(await redirected(intakeConnectionAction(form({ intent: "create", name: "", kind: "HOSTED_FORM" }))))).toMatchObject({ path: "/settings/connections", text: "Give your connection a name and choose a source." });
    mocks.transaction.mockRejectedValue(databaseFailure());
    expect(shown(await redirected(intakeConnectionAction(form({ intent: "rotate", id: "connection-1" })))).text).toBe("The connection could not be saved.");

    mocks.resolveIntake.mockRejectedValue(new IntakeError("This inquiry was already reviewed or is unavailable."));
    expect(shown(await redirected(reviewIntakeAction(form({ decision: "create", receiptId: "receipt-1" }))))).toEqual({ path: "/settings/connections", hash: "#needs-review", text: "This inquiry was already reviewed or is unavailable." });
    expect(shown(await redirected(reviewIntakeAction(form({ decision: "maybe", receiptId: "receipt-1" })))).text).toBe("Choose how to handle this inquiry.");
    mocks.resolveIntake.mockRejectedValue(new Error("Unique constraint failed on the fields: (`normalized`)"));
    expect(shown(await redirected(reviewIntakeAction(form({ decision: "create", receiptId: "receipt-1" })))).text).toBe("The inquiry could not be reviewed.");
  });
});

describe("support", () => {
  it("keeps the support service's refusals and hides anything else", async () => {
    mocks.replyTicket.mockRejectedValue(new SupportTicketError("This ticket is closed. Open a new ticket for additional help."));
    expect(shown(await redirected(replyToSupportTicketAction(form({ ticketId: "ticket-1", body: "Still broken" }))))).toMatchObject({ path: "/account/tickets/ticket-1", text: "This ticket is closed. Open a new ticket for additional help." });
    mocks.replyTicket.mockRejectedValue(new SupportAccessError("Support ticket not found."));
    expect(shown(await redirected(replyToSupportTicketAction(form({ ticketId: "ticket-1", body: "Still broken" })))).text).toBe("Support ticket not found.");
    mocks.replyTicket.mockRejectedValue(databaseFailure());
    expect(shown(await redirected(replyToSupportTicketAction(form({ ticketId: "ticket-1", body: "Still broken" })))).text).toBe("The reply could not be added.");
    mocks.reopenTicket.mockRejectedValue(databaseFailure());
    expect(shown(await redirected(reopenSupportTicketAction(form({ ticketId: "ticket-1" })))).text).toBe("The ticket could not be reopened.");
    mocks.createTicket.mockRejectedValue(databaseFailure());
    const created = await redirected(createSupportTicketAction(form({ title: "Calendar will not sync", body: "The calendar stopped updating yesterday.", category: "BUG" })));
    expect(shown(created)).toEqual({ path: "/help", hash: "#contact-support", text: "The support ticket could not be created." });
    expect(shown(created, someoneElse).text).toBe(UNVERIFIED_ERROR_MESSAGE);
  });
});
