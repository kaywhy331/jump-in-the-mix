import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runAutomaticDeliveries } from "../src/lib/automatic-delivery";
import { recordJumpAttempt, type AttemptPayload } from "../src/lib/jump-attempts";
import { saveJumpDraft } from "../src/lib/jump-drafts";
import { reconcileJumps } from "../src/lib/jump-engine";
import { selectJumpVariant } from "../src/lib/jump-variants";
import { prisma } from "../src/lib/prisma";
import { createBroadcastFixture, type BroadcastFixture } from "./helpers/broadcast-fixture";

const mocks = vi.hoisted(() => ({ session: vi.fn(), requireWorkspace: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentSession: mocks.session, requireWorkspace: mocks.requireWorkspace }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/request-context", () => ({ getRequestMetadata: async () => ({ ipAddress: null, userAgent: "Variant test" }) }));
import { GET as exportAccount } from "../src/app/api/account/export/route";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const email = { subject: "Your estimate", body: "Hi {{First Name}}, the estimate is attached. {{Email Signature}}" };
const call = { script: "Ask about the timeline. {{Private Notes}}" };

describe.skipIf(!local).sequential("one follow-up, channel alternatives", () => {
  let fixture: BroadcastFixture;
  let workspaceId: string;
  let stepVersionId: string;
  let jumpId: string;
  let singleJumpId: string;
  let plainContactId: string;
  const uuid = (n: number) => `0f1f4e5a-1b2c-4d3e-8f9a-${String(n).padStart(12, "0")}`;

  async function plan(name: string, contactId: string, variants: Array<{ family: "TEXT" | "EMAIL" | "CALL"; subject?: string; body?: string; script?: string }>) {
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name, channel: "SMS" } });
    const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Hi {{First Name}}, quick text. {{SMS Signature}}", variants: { create: variants } } });
    const mix = await prisma.mix.create({ data: { workspaceId, name, triggerMode: "MANUAL_START", status: "ACTIVE" } });
    await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: version.id, sortOrder: 1, dayOffset: 0 } });
    await prisma.mixAssignment.create({ data: { assignmentKey: `${workspaceId}:${mix.id}:${contactId}`, workspaceId, mixId: mix.id, contactId, mode: "SNAPSHOT", startDate: new Date() } });
    await reconcileJumps({ workspaceId, mixId: mix.id });
    const jump = await prisma.jump.findFirstOrThrow({ where: { workspaceId, mixId: mix.id, contactId } });
    return { versionId: version.id, mixId: mix.id, jumpId: jump.id };
  }
  const attempt = (n: number, jump: string, overrides: Partial<AttemptPayload>): AttemptPayload => ({
    id: uuid(n), contactId: fixture.contactId, channel: "SMS", family: "TEXT", recipient: "+15550100600", subject: null, body: "Hi Casey", script: null,
    draftRevision: null, stepVersionId, contextVersions: { contactVersion: "c1", businessProfileVersion: "b1" }, openedAt: new Date().toISOString(), ...overrides
  });

  beforeAll(async () => {
    fixture = await createBroadcastFixture("variants", "Casey");
    workspaceId = fixture.workspaceId;
    mocks.session.mockResolvedValue({ user: { id: fixture.userId, memberships: [{ workspaceId }] }, impersonation: null });
    mocks.requireWorkspace.mockResolvedValue({ user: { id: fixture.userId, name: "Variant owner", email: "variants@example.test", createdAt: new Date(), updatedAt: new Date() }, workspace: { id: workspaceId }, impersonation: null });
    await prisma.contact.update({ where: { id: fixture.contactId }, data: { phones: { create: { phone: "+15550100600", normalized: "+15550100600", isPrimary: true } }, emails: { create: { email: "casey@example.com", normalized: "casey@example.com", isPrimary: true } } } });
    const multi = await plan("Estimate follow-up", fixture.contactId, [{ family: "EMAIL", ...email }, { family: "CALL", ...call }]);
    stepVersionId = multi.versionId; jumpId = multi.jumpId;
    plainContactId = (await prisma.contact.create({ data: { workspaceId, firstName: "Sam", displayName: "Sam", phones: { create: { phone: "+15550100601", normalized: "+15550100601", isPrimary: true } } } })).id;
    singleJumpId = (await plan("Single text", plainContactId, [])).jumpId;
  });
  afterAll(async () => { await fixture.cleanup(); });

  it("carries authored variants on the follow-up's snapshot and leaves a single-channel row without them", async () => {
    const multi = await prisma.jump.findUniqueOrThrow({ where: { id: jumpId } });
    expect((multi.templateSnapshot as { variants?: unknown }).variants).toEqual({ EMAIL: { subject: email.subject, body: email.body, script: null }, CALL: { subject: null, body: null, script: call.script } });
    expect((multi.renderedSnapshot as { body: string }).body).toContain("Hi Casey, quick text.");
    const single = await prisma.jump.findUniqueOrThrow({ where: { id: singleJumpId } });
    expect(single.templateSnapshot).not.toHaveProperty("variants");
    expect(single.selectedFamily).toBeNull();
  });

  it("keeps a separate draft per family for authored alternatives only, detaching tokens against that family's wording", async () => {
    expect(await saveJumpDraft({ workspaceId, jumpId, family: "TEXT", body: "Hi {{First Name}}, my own text.", revision: null })).toMatchObject({ ok: true, draft: { family: "TEXT", revision: 1 } });
    const emailDraft = await saveJumpDraft({ workspaceId, jumpId, family: "EMAIL", subject: "Your estimate", body: "Hi Casey, the estimate is attached. Thanks", revision: null });
    expect(emailDraft).toMatchObject({ ok: true, draft: { family: "EMAIL", revision: 1, subject: "Your estimate" } });
    // The email draft dropped the email signature token: recorded against the email variant, not the plan's text.
    expect(emailDraft.ok && emailDraft.draft.detached).toEqual(expect.objectContaining({ "{{First Name}}": "Casey", "{{Email Signature}}": expect.any(String) }));
    expect(await saveJumpDraft({ workspaceId, jumpId, family: "CALL", script: "Ask about the timeline.", revision: null })).toMatchObject({ ok: true, draft: { family: "CALL" } });
    expect(await saveJumpDraft({ workspaceId, jumpId: singleJumpId, family: "EMAIL", subject: "x", body: "y", revision: null })).toMatchObject({ ok: false, reason: "unavailable" });
    expect(await prisma.jumpDraft.count({ where: { jumpId } })).toBe(3);
  });

  it("records the owner's choice for one follow-up, only among authored families, and never creates another action", async () => {
    const before = await prisma.jump.count({ where: { workspaceId } });
    expect(await selectJumpVariant({ workspaceId, jumpId, family: "EMAIL" })).toEqual({ ok: true, selectedFamily: "EMAIL" });
    expect((await prisma.jump.findUniqueOrThrow({ where: { id: jumpId } })).selectedFamily).toBe("EMAIL");
    expect(await selectJumpVariant({ workspaceId, jumpId, family: "TEXT" })).toEqual({ ok: true, selectedFamily: null });
    expect(await selectJumpVariant({ workspaceId, jumpId, family: "CALL" })).toEqual({ ok: true, selectedFamily: "CALL" });
    expect(await selectJumpVariant({ workspaceId, jumpId, family: "FAX" })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await selectJumpVariant({ workspaceId, jumpId: singleJumpId, family: "EMAIL" })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await selectJumpVariant({ workspaceId: "another-workspace", jumpId, family: "EMAIL" })).toMatchObject({ ok: false, reason: "unavailable" });
    expect(await prisma.jump.count({ where: { workspaceId } })).toBe(before);
    expect(await prisma.jump.count({ where: { id: jumpId, status: "PENDING" } })).toBe(1);
  });

  it("freezes a handoff on the plan's channel or an authored alternative's, respects the stated WhatsApp preference, and never rewrites it after a switch", async () => {
    expect(await recordJumpAttempt({ workspaceId, jumpId, payload: attempt(1, jumpId, { channel: "EMAIL", family: "EMAIL", recipient: "casey@example.com", subject: "Your estimate", body: "Hi Casey, the estimate is attached." }) })).toEqual({ ok: true, attemptId: uuid(1), duplicate: false });
    expect(await recordJumpAttempt({ workspaceId, jumpId, payload: attempt(2, jumpId, { channel: "PHONE_CALL", family: "CALL", body: null, script: "Ask about the timeline." }) })).toEqual({ ok: true, attemptId: uuid(2), duplicate: false });
    expect(await recordJumpAttempt({ workspaceId, jumpId, payload: attempt(3, jumpId, {}) })).toEqual({ ok: true, attemptId: uuid(3), duplicate: false });
    expect(await recordJumpAttempt({ workspaceId, jumpId, payload: attempt(4, jumpId, { channel: "WHATSAPP" }) })).toMatchObject({ ok: false, reason: "invalid", message: "This follow-up uses a different channel." });
    expect(await recordJumpAttempt({ workspaceId, jumpId, payload: attempt(5, jumpId, { channel: "VOICEMAIL", family: "CALL", body: null, script: "notes" }) })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await recordJumpAttempt({ workspaceId, jumpId: singleJumpId, payload: attempt(6, singleJumpId, { contactId: plainContactId, channel: "EMAIL", family: "EMAIL", recipient: "sam@example.com" }) })).toMatchObject({ ok: false, reason: "invalid" });
    // WhatsApp becomes a legitimate channel for the alternative text only once the person prefers it; the plan's own SMS still is not WhatsApp.
    await prisma.contactRelationshipState.upsert({ where: { contactId: fixture.contactId }, create: { workspaceId, contactId: fixture.contactId, preferredChannel: "WHATSAPP" }, update: { preferredChannel: "WHATSAPP" } });
    expect(await recordJumpAttempt({ workspaceId, jumpId, payload: attempt(7, jumpId, { channel: "WHATSAPP" }) })).toMatchObject({ ok: false, reason: "invalid" });
    const emailPlan = await plan("Email first", fixture.contactId, [{ family: "TEXT", body: "Quick text {{First Name}}" }]);
    await prisma.stepTemplate.update({ where: { id: (await prisma.stepVersion.findUniqueOrThrow({ where: { id: emailPlan.versionId } })).stepTemplateId }, data: { channel: "EMAIL" } });
    expect(await recordJumpAttempt({ workspaceId, jumpId: emailPlan.jumpId, payload: attempt(8, emailPlan.jumpId, { channel: "WHATSAPP", stepVersionId: emailPlan.versionId }) })).toEqual({ ok: true, attemptId: uuid(8), duplicate: false });
    // Switching afterwards leaves every recorded attempt exactly as it was.
    const recorded = await prisma.jumpAttempt.findMany({ where: { jumpId }, orderBy: { openedAt: "asc" } });
    await selectJumpVariant({ workspaceId, jumpId, family: "EMAIL" });
    await reconcileJumps({ workspaceId });
    expect(await prisma.jumpAttempt.findMany({ where: { jumpId }, orderBy: { openedAt: "asc" } })).toEqual(recorded);
    expect(recorded.map((row) => [row.channel, row.family])).toEqual([["EMAIL", "EMAIL"], ["PHONE_CALL", "CALL"], ["SMS", "TEXT"]]);
  });

  it("keeps the selection and every family's draft through a source refresh that updates the row in place", async () => {
    await prisma.workspaceProfile.update({ where: { workspaceId }, data: { smsSignature: "Casey's Roofing" } });
    const result = await reconcileJumps({ workspaceId });
    expect(result.canceled).toBe(0);
    const jump = await prisma.jump.findUniqueOrThrow({ where: { id: jumpId }, include: { drafts: true } });
    expect(jump.status).toBe("PENDING");
    expect(jump.selectedFamily).toBe("EMAIL");
    expect(jump.drafts.map((draft) => draft.family).sort()).toEqual(["CALL", "EMAIL", "TEXT"]);
    expect((jump.renderedSnapshot as { body: string }).body).toContain("Casey's Roofing");
  });

  it("holds a switched follow-up from automatic delivery and releases the claim rather than reusing it", async () => {
    await prisma.automationPreference.upsert({ where: { workspaceId }, create: { workspaceId, enabled: true, smsEnabled: true, reviewWindowMinutes: 15 }, update: { enabled: true, smsEnabled: true, reviewWindowMinutes: 15 } });
    const delivery = await plan("Delivery text", plainContactId, [{ family: "EMAIL", ...email }]);
    const past = new Date(Date.now() - 2 * 60 * 60_000);
    await prisma.jump.update({ where: { id: delivery.jumpId }, data: { scheduledAt: past, createdAt: past, selectedFamily: "EMAIL" } });
    await runAutomaticDeliveries("variant-test-worker");
    expect(await prisma.automatedDelivery.count({ where: { jumpId: delivery.jumpId } })).toBe(0);
    expect((await prisma.jump.findUniqueOrThrow({ where: { id: delivery.jumpId } })).status).toBe("PENDING");
    // Back on the plan's own channel the follow-up is claimable again (the unconfigured provider then fails the send, not the claim).
    await prisma.jump.update({ where: { id: delivery.jumpId }, data: { selectedFamily: null } });
    await runAutomaticDeliveries("variant-test-worker");
    expect(await prisma.automatedDelivery.count({ where: { jumpId: delivery.jumpId, channel: "SMS" } })).toBe(1);
    await prisma.automationPreference.update({ where: { workspaceId }, data: { enabled: false, smsEnabled: false } });
  });

  it("exports authored variants with the plan and the selection with the follow-up", async () => {
    const response = await exportAccount(new Request("https://example.test/api/account/export"));
    expect(response.status).toBe(200);
    const document = await response.json() as Record<string, unknown>;
    const templates = Object.values(document).find((value): value is Array<{ versions: Array<{ id: string; variants?: unknown[] }> }> => Array.isArray(value) && value.some((item) => item && typeof item === "object" && Array.isArray((item as { versions?: unknown }).versions)));
    const version = templates?.flatMap((item) => item.versions).find((item) => item.id === stepVersionId);
    expect(version?.variants).toHaveLength(2);
    expect(version?.variants).toEqual(expect.arrayContaining([expect.objectContaining({ family: "CALL", script: call.script }), expect.objectContaining({ family: "EMAIL", subject: email.subject, body: email.body })]));
    const jumps = Object.values(document).find((value): value is Array<{ id: string; selectedFamily?: string | null }> => Array.isArray(value) && value.some((item) => item && typeof item === "object" && (item as { id?: string }).id === jumpId));
    expect(jumps?.find((item) => item.id === jumpId)?.selectedFamily).toBe("EMAIL");
  });
});
