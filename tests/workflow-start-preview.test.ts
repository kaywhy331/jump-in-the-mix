import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkspaceProfile } from "@/generated/prisma/client";
import type { WorkflowDefinition, WorkflowStep } from "@/lib/mix-workflow-types";

const mocks = vi.hoisted(() => ({ definition: vi.fn(), eligible: vi.fn(), db: {
  workspace: { findUniqueOrThrow: vi.fn() }, contact: { findFirst: vi.fn() },
  workspacePreference: { findUnique: vi.fn() }, automationPreference: { findUnique: vi.fn() },
  userPreference: { findUnique: vi.fn() }, calendarEntry: { findMany: vi.fn() },
  mixWorkflowInstance: { findUnique: vi.fn() }
} }));
// Only read methods exist: any accidental persistence makes these previews fail.
vi.mock("@/lib/prisma", () => ({ prisma: { ...mocks.db, $transaction: (read: (db: typeof mocks.db) => unknown) => read(mocks.db) } }));
vi.mock("@/lib/mix-workflow", () => ({ readWorkflowDefinition: mocks.definition }));
vi.mock("@/lib/mix-start-eligibility", () => ({ assertMixStartEligible: mocks.eligible }));

import { previewBeatWording, previewWorkflowStart, readBeatPreviewContext } from "@/lib/workflow-start-preview";
import { renderJumpSnapshot } from "@/lib/jump-render";
import { MixBeatPreview } from "@/components/MixBeatPreview";

const now = new Date("2026-03-07T17:00:00Z");
const contact = {
  id: "person", displayName: "Jordan Lee", firstName: "Jordan", lastName: "Lee", company: "Northstar",
  publicNotes: null, privateNotes: "Private talking point",
  emails: [{ email: "other@example.test", isPrimary: false }, { email: "jordan@example.test", isPrimary: true }],
  phones: [{ phone: "+15550101010", isPrimary: true }], addresses: [],
  customFieldValues: [{ value: "Roof repair", definition: { key: "project" } }]
};
const owner = { name: "Alex Morgan", email: "alex@example.test" };
const profile: WorkspaceProfile = {
  workspaceId: "workspace", industry: null, primaryGoal: null, company: "Morgan Services", website: null,
  phone: null, street: null, city: null, state: null, postalCode: null, mailingAddress: null,
  product1: null, product2: null, product3: null, product4: null, product5: null,
  myCustom1: null, myCustom2: null, myCustom3: null, products: [], senderDetails: [],
  smsSignature: "— Alex", emailSignature: "Alex at Morgan Services", reviewUrl: null,
  onboardingStep: 5, useCases: [], onboardingDone: true, createdAt: now, updatedAt: now
};
const step: WorkflowStep = {
  id: "hello", versionId: "version", name: "Say hello", channel: "EMAIL", dayOffset: 1,
  sendTimeMinutes: 600, plannedAt: null, anchor: "CALENDAR_DAY", offsetMinutes: null,
  subject: "Hello {{First Name}}", body: "{{My Company}}: {{contact.custom.project}}. {{Email Signature}}", script: null
};
const definition = (steps: WorkflowStep[] = [step], gatedStepIds: string[] = []): WorkflowDefinition => ({
  revision: 3, rules: [], gatedStepIds, intentionalEnds: [],
  mixes: [{ id: "mix", name: "Welcome", status: "ACTIVE", source: "CUSTOM", triggerMode: "MANUAL_START", steps }]
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.definition.mockResolvedValue(definition());
  mocks.eligible.mockResolvedValue(undefined);
  mocks.db.workspace.findUniqueOrThrow.mockResolvedValue({ ownerId: "owner", profile, owner });
  mocks.db.contact.findFirst.mockResolvedValue(contact);
  mocks.db.workspacePreference.findUnique.mockResolvedValue({ defaultFollowUpMinutes: 600, quietHoursStart: 1200, quietHoursEnd: 480, weekendScheduling: "KEEP" });
  mocks.db.userPreference.findUnique.mockResolvedValue({ timezone: "America/Los_Angeles" });
  mocks.db.automationPreference.findUnique.mockResolvedValue({ enabled: false });
  mocks.db.calendarEntry.findMany.mockResolvedValue([]);
  mocks.db.mixWorkflowInstance.findUnique.mockResolvedValue(null);
});

describe("read-only Beat wording", () => {
  it("matches production subject, business, custom fields and channel signatures", () => {
    const email = previewBeatWording(step, contact, profile, owner, "EMAIL");
    expect(email).toMatchObject(renderJumpSnapshot(step, contact, profile, owner, "EMAIL"));
    expect(email.subject).toBe("Hello Jordan");
    expect(email.body).toBe("Morgan Services: Roof repair. Alex at Morgan Services");
    expect(email.recipient).toBe("jordan@example.test");
    expect(email.warnings).toEqual([]);
    expect(previewBeatWording({ body: "{{SMS Signature}}" }, contact, profile, owner, "SMS")).toMatchObject({ body: "— Alex", recipient: "+15550101010" });
  });

  it("shows missing details and production fallbacks without inventing a recipient", () => {
    const result = previewBeatWording({ subject: "Hi {{First Name}}", body: "{{My Company}} {{My Website}} {{unknown}} {{Email Signature}}" }, { ...contact, firstName: null, emails: [] }, null, owner, "EMAIL");
    expect(result).toMatchObject({ subject: "Hi there", body: "my business Alex Morgan", recipient: "" });
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("{{First Name}}"), expect.stringContaining("{{My Company}}"),
      expect.stringContaining("{{My Website}}"), expect.stringContaining("{{unknown}}"),
      expect.stringContaining("{{Email Signature}}"), "This person has no saved email address."
    ]));
  });

  it("keeps private notes out of messages and allows them in call talking points", () => {
    expect(previewBeatWording({ body: "{{Private Notes}}" }, contact, profile, owner, "SMS").body).toBe("");
    expect(previewBeatWording({ script: "{{Private Notes}}" }, contact, profile, owner, "PHONE_CALL").script).toBe("Private talking point");
  });

  it("loads only an active contact in the requested workspace", async () => {
    await readBeatPreviewContext("workspace", "person");
    expect(mocks.db.contact.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "person", workspaceId: "workspace", archivedAt: null } }));
    mocks.db.contact.findFirst.mockResolvedValue(null);
    await expect(readBeatPreviewContext("workspace", "foreign-person")).rejects.toThrow("Choose a saved person in this account");
  });
});

describe("workflow start preview", () => {
  it("uses saved workspace time across DST and renders real saved details without writes", async () => {
    const result = await previewWorkflowStart("workspace", "person", "mix", now);
    expect(result.timezone).toBe("America/Los_Angeles");
    expect(result.steps[0].dueAt).toBe("2026-03-08T17:00:00.000Z");
    expect(result.steps[0].wording.body).toContain("Morgan Services");
    expect(mocks.db.userPreference.findUnique).toHaveBeenCalledWith({ where: { userId: "owner" }, select: { timezone: true } });
    expect(mocks.eligible).toHaveBeenCalledWith(mocks.db, "workspace", "person", "mix");
  });

  it("honors the saved default time, quiet hours and weekend preference", async () => {
    mocks.db.workspacePreference.findUnique.mockResolvedValue({ defaultFollowUpMinutes: 420, quietHoursStart: 1200, quietHoursEnd: 540, weekendScheduling: "NEXT_MONDAY" });
    mocks.definition.mockResolvedValue(definition([{ ...step, sendTimeMinutes: null }]));
    const result = await previewWorkflowStart("workspace", "person", "mix", now);
    expect(result.steps[0].dueAt).toBe("2026-03-09T16:00:00.000Z");
  });

  it("never dates a gated Beat or an appointment/outcome wait, even with a stored planned date", async () => {
    const waiting: WorkflowStep[] = [
      { ...step, id: "gated" },
      ...(["APPOINTMENT_START", "APPOINTMENT_END", "VISIT_COMPLETED"] as const).map(anchor => ({ ...step, id: anchor, anchor, offsetMinutes: 90, plannedAt: now.toISOString() }))
    ];
    mocks.definition.mockResolvedValue(definition(waiting, ["gated"]));
    const result = await previewWorkflowStart("workspace", "person", "mix", now);
    expect(result.steps).toHaveLength(3);
    expect(result.steps.every(item => item.dueAt === null)).toBe(true);
    expect(result.steps[2].note).toContain("1 hour 30 minutes after the visit is marked completed");
    expect(result.steps[2].note).toContain("nothing to count from");
    const html = renderToStaticMarkup(createElement(MixBeatPreview, {
      steps: waiting.map(item => ({ ...item, plannedAt: now, stepVersion: { ...item, stepTemplate: { name: item.name, channel: item.channel } } })),
      gatedStepIds: ["gated"], timezone: "America/Los_Angeles", locale: "en-US"
    }));
    expect(html).toContain("After a connection");
    expect(html).toContain("nothing to count from");
    expect(html).not.toContain("2026");
    expect(html).not.toContain("AM");
  });

  it("preserves admission failures and retry receipts", async () => {
    mocks.eligible.mockRejectedValueOnce(new Error("This Mix is stopped for this person."));
    await expect(previewWorkflowStart("workspace", "person", "mix", now)).rejects.toThrow("stopped");
    mocks.db.mixWorkflowInstance.findUnique.mockResolvedValue({ id: "saved", label: "Welcome", contact: { displayName: "Jordan Lee" } });
    const receipt = await previewWorkflowStart("workspace", "person", "mix", now, "request");
    expect(receipt).toMatchObject({ savedInstanceId: "saved", steps: [] });
    expect(mocks.db.mixWorkflowInstance.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId_admissionKey: { workspaceId: "workspace", admissionKey: "manual:person:mix:request" } } }));
    expect(mocks.eligible).toHaveBeenCalledTimes(1);
  });
});
