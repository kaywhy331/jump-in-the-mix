import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createConnectionToken } from "@/lib/connection-tokens";
import { receiveIntake, resolveIntake } from "@/lib/intake";
import { readIntakeReviewCount, readIntakeReviews } from "@/lib/intake-review-reader";
import { readNextActions } from "@/lib/next-action-reader";
import { resolveNextActions } from "@/lib/next-action";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const options = { now: new Date("2026-10-28T12:00:00Z"), timeZone: "America/Los_Angeles" };
describe.skipIf(!local)("daily receipt review", () => {
  let userId: string, workspaceId: string, foreignId: string;
  beforeEach(async () => {
    userId = (await prisma.user.create({ data: { name: "Review owner", email: `review-${randomUUID()}@example.test` } })).id;
    workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: randomUUID(), name: "Review fixture" } })).id;
    foreignId = (await prisma.workspace.create({ data: { ownerId: userId, slug: randomUUID(), name: "Foreign fixture" } })).id;
  });
  afterEach(async () => { await prisma.workspace.deleteMany({ where: { id: { in: [workspaceId, foreignId] } } }); await prisma.user.delete({ where: { id: userId } }); });
  afterAll(async () => { await prisma.$disconnect(); });
  const person = (archivedAt: Date | null = null) => prisma.contact.create({ data: { workspaceId, displayName: "Review person", archivedAt, emails: { create: { email: "review@example.test", normalized: "review@example.test" } } } });
  const source = (owner = workspaceId) => prisma.intakeConnection.create({ data: { workspaceId: owner, name: "Review source", kind: "CRM", ...createConnectionToken() } });
  const payload = { eventId: "inquiry", displayName: "Incoming inquiry", email: "review@example.test" };

  it("counts an ambiguous receipt once in both readers without creating a person or exposing credentials", async () => {
    const a = await person(); await person(); const connection = await source();
    const received = await receiveIntake(connection.id, payload, { tokenHash: connection.tokenHash });
    const repeat = await receiveIntake(connection.id, payload, { tokenHash: connection.tokenHash });
    expect(repeat).toMatchObject({ duplicate: true, receiptId: received.receiptId });
    expect(await readIntakeReviewCount(workspaceId)).toBe(1);
    const review = await readIntakeReviews(workspaceId), next = await readNextActions(workspaceId, options);
    expect(review.count).toBe(1); expect(review.items[0].matches).toHaveLength(2);
    expect(review.items[0].work).toMatchObject({ receiptId: received.receiptId, contactId: null, kind: "intake-review" });
    expect(next.items[0]).toMatchObject(review.items[0].work); expect(next.attentionCount).toBe(1);
    expect(resolveNextActions([review.items[0].work, review.items[0].work], options).attentionCount).toBe(1);
    expect((await readNextActions(workspaceId, { ...options, contactId: a.id })).items).toEqual([]);
    expect(await prisma.contact.count({ where: { workspaceId } })).toBe(2);
    const serialized = JSON.stringify(review);
    expect(serialized).not.toContain(connection.tokenHash); expect(serialized).not.toContain(connection.tokenEncrypted);
    expect(await readIntakeReviewCount(foreignId)).toBe(0);
    expect((await readIntakeReviews(foreignId, { receipt: received.receiptId })).items).toEqual([]);
    await expect(resolveIntake(foreignId, received.receiptId, "create")).rejects.toThrow("unavailable");
  });
  it("refreshes counts after linking and concurrent create retries yield one contact and enrollment", async () => {
    const a = await person(); await person(); const connection = await source();
    const first = await receiveIntake(connection.id, payload, { tokenHash: connection.tokenHash });
    await resolveIntake(workspaceId, first.receiptId, "link", a.id);
    expect(await readIntakeReviewCount(workspaceId)).toBe(0);
    expect((await readNextActions(workspaceId, options)).items.filter(item => item.kind === "intake-review")).toEqual([]);
    const mix = await prisma.mix.create({ data: { workspaceId, name: "Source Mix", status: "ACTIVE", triggerMode: "MANUAL_START" } });
    await prisma.intakeConnection.update({ where: { id: connection.id }, data: { newContactPlacement: "MIX", newContactMixId: mix.id } });
    const second = await receiveIntake(connection.id, { ...payload, eventId: "second" }, { tokenHash: connection.tokenHash });
    const results = await Promise.allSettled([resolveIntake(workspaceId, second.receiptId, "create"), resolveIntake(workspaceId, second.receiptId, "create")]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await prisma.contact.count({ where: { workspaceId } })).toBe(3);
    expect(await prisma.mixAssignment.count({ where: { mixId: mix.id } })).toBe(1);
    expect(await readIntakeReviewCount(workspaceId)).toBe(0);
  });
  it("retains archived choices and permits an explicit separate contact", async () => {
    const archived = await person(new Date("2026-10-01T12:00:00Z")), connection = await source();
    const result = await receiveIntake(connection.id, payload, { tokenHash: connection.tokenHash });
    expect((await readIntakeReviews(workspaceId)).items[0].matches[0]).toMatchObject({ id: archived.id, archivedAt: archived.archivedAt });
    await expect(resolveIntake(workspaceId, result.receiptId, "link", archived.id)).rejects.toThrow("active contact");
    expect(await readIntakeReviewCount(workspaceId)).toBe(1);
    const created = await resolveIntake(workspaceId, result.receiptId, "create");
    expect(created?.id).not.toBe(archived.id); expect(await readIntakeReviewCount(workspaceId)).toBe(0);
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: archived.id } })).archivedAt).not.toBeNull();
  });
  it("keeps a no-contact receipt after matches disappear and ignores it without making anyone", async () => {
    await person(); await person(); const connection = await source();
    const result = await receiveIntake(connection.id, payload, { tokenHash: connection.tokenHash });
    await prisma.contact.deleteMany({ where: { workspaceId } });
    const review = await readIntakeReviews(workspaceId);
    expect(review.items[0].matches).toEqual([]); expect(review.items[0].work.receiptId).toBe(result.receiptId);
    expect(review.items[0].work.contactId).toBeNull();
    await resolveIntake(workspaceId, result.receiptId, "ignore");
    expect(await readIntakeReviewCount(workspaceId)).toBe(0); expect(await prisma.contact.count({ where: { workspaceId } })).toBe(0);
  });
  it("opens the exact receipt page beyond the first ten and keeps searches tenant scoped", async () => {
    const connection = await source(), foreign = await source(foreignId);
    for (const c of [connection, foreign]) await prisma.intakeReceipt.createMany({ data: Array.from({ length: 12 }, (_, i) => ({ id: `${c.id}-${i.toString().padStart(2, "0")}`, connectionId: c.id, eventKey: `event-${i}`, payloadHash: "fixture", status: "REVIEW", payload: { ...payload, eventId: `event-${i}`, displayName: i === 11 ? "Last inquiry" : "Earlier inquiry" }, createdAt: options.now })) });
    const last = `${connection.id}-11`, page = await readIntakeReviews(workspaceId, { receipt: last });
    expect(page).toMatchObject({ count: 12, page: 2, pages: 2 }); expect(page.items.map(item => item.work.receiptId)).toContain(last);
    expect((await readIntakeReviews(workspaceId, { reviewQ: "Last inquiry" })).count).toBe(1);
    expect((await readNextActions(workspaceId, options)).attentionCount).toBe(12);
  });
});
