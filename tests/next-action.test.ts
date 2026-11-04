import { describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { emptyWorkflowState } from "@/lib/mix-workflow-types";
import { nextActionAttention, readNextActionSnapshot } from "@/lib/next-action-reader";
import { nextActionEmptyText, nextActionsInView, nextActionTime, resolveNextActions, withoutSettledActions, type NextActionCandidate } from "@/lib/next-action";

const now = new Date("2026-11-01T09:30:00.000Z");
const options = { now, timeZone: "America/Los_Angeles" };
const candidate = (id: string, patch: Partial<NextActionCandidate> = {}): NextActionCandidate => ({
  id, contactId: "person", contactName: "Fixture person", kind: "follow-up", title: "Check in", detail: "Prepared follow-up",
  href: "/jumps?jump=fixture", action: "Review message", dueAt: "2026-10-31T19:00:00.000Z", updatedAt: now.toISOString(), ...patch
});

describe("shared next-action resolution", () => {
  it("keeps future obligations in Today's upcoming queue after its due filter", async () => {
    const dueAt = "2026-11-09T17:00:00.000Z", contact = { displayName: "Fixture person" };
    const state = emptyWorkflowState();
    state.commitments = ["CUSTOMER", "OWNER"].map(source => ({
      id: source, updateId: source, runId: "run", dueAt, timezone: "America/New_York",
      source: source as "CUSTOMER" | "OWNER", recordedAt: now.toISOString(), status: "OPEN"
    }));
    const db = {
      $queryRaw: async () => [{ pending: false, delayed: false, failed: false }],
      jump: { findMany: async ({ where }: { where: Prisma.JumpWhereInput }) => where.AND ? [] : [{
        id: "follow-up", contactId: "person", contact, reason: "Scheduled follow-up", scheduledAt: new Date(dueAt),
        updatedAt: now, mixId: "mix", mix: { source: "ONE_TIME" }, workflowInstanceId: null, workflowVisitId: null
      }] },
      mixWorkflowInstance: { findMany: async () => [{
        id: "work", contactId: "person", contact, label: "Estimate follow-up", state,
        definition: { rules: [] }, updatedAt: now
      }] },
      job: { findMany: async () => [], findFirst: async () => null },
      contactRelationshipState: { findMany: async () => [{
        id: "relationship", contactId: "person", contact, nextCommitmentAt: new Date(dueAt), updatedAt: now
      }] },
      calendarEntry: { findMany: async () => [{
        id: "appointment", contactId: "person", contact, title: "Site visit", startsAt: new Date(dueAt),
        endsAt: new Date("2026-11-09T18:00:00.000Z"), updatedAt: now
      }] }
    } as unknown as Prisma.TransactionClient;
    const before = new Date("2026-11-02T08:00:00.000Z");
    const snapshot = await readNextActionSnapshot(db, "workspace", {
      ...options, followUpWhere: { scheduledAt: { lt: before } }, before
    });
    const filtered = nextActionsInView(snapshot);
    expect(filtered.items).toEqual([]);
    expect(snapshot).toMatchObject({ state: "ready", attentionCount: 0, futureCount: 5 });
    expect(snapshot.items.find(item => item.jumpId === "follow-up")).toMatchObject({ kind: "follow-up", timing: "future" });
    const attention = nextActionAttention(filtered, 0, 0, snapshot);
    expect(attention).toMatchObject({ total: 0, futureTotal: 4 });
    expect(attention?.future).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: "Customer requested a callback", timezone: "America/New_York" }),
      expect.objectContaining({ reason: "Your planned check-in", timezone: "America/New_York" }),
      expect.objectContaining({ reason: "Check the commitment you saved." }),
      expect.objectContaining({ reason: "Scheduled appointment" })
    ]));
  });
  it("puts an outcome ahead of future work and keeps separate urgent obligations for one person", () => {
    const items = [candidate("future", { dueAt: "2026-11-02T09:00:00.000Z" }), candidate("overdue"),
      candidate("outcome", { kind: "outcome", dueAt: null, action: "Record outcome" }), candidate("callback", { kind: "commitment", dueAt: now.toISOString() })];
    const result = resolveNextActions(items, options);
    expect(result.items.map(item => item.id)).toEqual(["outcome", "callback", "overdue", "future"]);
    expect(result).toMatchObject({ attentionCount: 3, futureCount: 1, state: "ready" });
    expect(resolveNextActions([...items].reverse(), options)).toEqual(result);
  });
  it("deduplicates obligations instead of people, and a held representation cannot offer Review", () => {
    const duplicate = candidate("visit");
    const held = candidate("visit", { kind: "repair", action: "Choose a date", dueAt: null });
    for (const entries of [[duplicate, held], [held, duplicate]]) {
      const result = resolveNextActions([...entries, candidate("other-visit")], options);
      expect(result.attentionCount).toBe(2);
      expect(result.items.find(item => item.id === "visit")?.action).toBe("Choose a date");
    }
  });
  it("settled receipts win a version tie, while a newer Undo reopens only that obligation", () => {
    const open = candidate("a", { jumpId: "jump-a" });
    const done = { ...open, status: "done" as const };
    expect(resolveNextActions([done, open], options).items).toEqual([]);
    const undone = { ...open, updatedAt: "2026-11-01T09:31:00.000Z" };
    const result = resolveNextActions([undone, done, candidate("b")], options);
    expect(result.attentionCount).toBe(2);
    expect(withoutSettledActions(result, new Set(["jump-a"])).attentionCount).toBe(1);
    expect(withoutSettledActions(result, new Set()).attentionCount).toBe(2);
  });
  it("uses local calendar days across fall-back and spring-forward, with the account's displayed time", () => {
    const result = resolveNextActions([
      candidate("yesterday", { dueAt: "2026-11-01T06:59:00.000Z" }),
      candidate("first-one-thirty", { dueAt: "2026-11-01T08:30:00.000Z" }),
      candidate("second-one-thirty", { dueAt: "2026-11-01T09:30:00.000Z" }),
      candidate("later-today", { dueAt: "2026-11-02T07:59:00.000Z" }),
      candidate("tomorrow", { dueAt: "2026-11-02T08:00:00.000Z" })
    ], options);
    expect(result.items.map(item => item.timing)).toEqual(["overdue", "due", "due", "due", "future"]);
    expect(nextActionTime(result.items[1], result, { locale: "en-US", timeZone: "UTC" })).toBe("Nov 1, 1:30 AM");
    const spring = resolveNextActions([candidate("before", { dueAt: "2026-03-08T07:59:00.000Z" }), candidate("after", { dueAt: "2026-03-08T10:01:00.000Z" })], { ...options, now: new Date("2026-03-08T11:00:00.000Z") });
    expect(spring.items.map(item => item.timing)).toEqual(["overdue", "due"]);
  });
  it("counts the full filtered set independent of a presentation page and retains future context", () => {
    const result = resolveNextActions(Array.from({ length: 650 }, (_, index) => candidate(String(index), { inView: index < 325 })), options);
    expect(result.items.slice(0, 30)).toHaveLength(30);
    expect(nextActionsInView(result).attentionCount).toBe(325);
    const future = resolveNextActions([candidate("future", { dueAt: "2026-11-02T09:00:00.000Z", inView: false })], options);
    expect(future.futureCount).toBe(1);
    expect(nextActionsInView(future).items).toEqual([]);
  });
  it("orders offset timestamps by instant and does not call an ongoing appointment overdue", () => {
    const future = resolveNextActions([
      candidate("later", { kind: "appointment", dueAt: "2026-11-01T01:30:00-08:00" }),
      candidate("earlier", { kind: "appointment", dueAt: "2026-11-01T02:00:00-07:00" })
    ], { ...options, now: new Date("2026-11-01T07:00:00Z") });
    expect(future.items.map(item => item.id)).toEqual(["earlier", "later"]);
    expect(resolveNextActions([candidate("ongoing", { kind: "appointment", dueAt: "2026-11-01T06:00:00Z" })], options).items[0].timing).toBe("due");
  });
  it("distinguishes truly empty, preparation, failure and unreadable sources", () => {
    expect(nextActionEmptyText(resolveNextActions([], options))).toBe("Nothing scheduled.");
    for (const state of ["preparing", "failed", "unavailable"] as const) {
      expect(nextActionEmptyText(resolveNextActions([], { ...options, state }))).not.toBe("Nothing scheduled.");
    }
    expect(resolveNextActions([candidate("bad-date", { dueAt: "unknown" })], options).state).toBe("unavailable");
  });
});
