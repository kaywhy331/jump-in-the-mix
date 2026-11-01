import { describe, expect, it } from "vitest";
import { resolveNextActions, withoutSettledActionVersions, type NextActionCandidate } from "@/lib/next-action";

const version = "2026-11-01T12:00:00.000Z";
const candidate: NextActionCandidate = { id: "workspace:jump:one", jumpId: "one", contactId: "contact", contactName: "Fixture", kind: "follow-up", title: "Check in", detail: "Prepared follow-up", href: "/jumps?jump=one", action: "Review message", dueAt: version, updatedAt: version };
const projection = (items: NextActionCandidate[], observedAt = version) => resolveNextActions(items, { now: new Date(observedAt), timeZone: "UTC" });

describe("H01 versioned settlement", () => {
  for (const status of ["DONE", "SKIPPED"]) it(`${status}: later reads do not reopen an equal or older obligation version`, () => {
    const receipts = new Map([["one", version]]);
    for (const updatedAt of [version, "2026-11-01T11:59:00.000Z"]) {
      const result = withoutSettledActionVersions(projection([{ ...candidate, updatedAt }], "2026-11-01T12:05:00.000Z"), receipts);
      expect(result.items).toEqual([]);
      expect(result.attentionCount).toBe(0);
    }
  });
  it("a newer server version reopens only its obligation and an older replay stays settled", () => {
    const receipts = new Map([["one", version]]);
    const newer = { ...candidate, updatedAt: "2026-11-01T12:01:00.000Z" };
    expect(withoutSettledActionVersions(projection([newer]), receipts).items).toHaveLength(1);
    expect(withoutSettledActionVersions(projection([candidate]), receipts).items).toHaveLength(0);
    expect(withoutSettledActionVersions(projection([candidate, { ...candidate, id: "other", jumpId: "other" }]), receipts).items.map(item => item.id)).toEqual(["other"]);
  });
  it("a real Undo receipt allows the pending obligation again", () => {
    const receipts = new Map([["one", version]]);
    expect(withoutSettledActionVersions(projection([candidate]), receipts).items).toHaveLength(0);
    receipts.delete("one");
    expect(withoutSettledActionVersions(projection([candidate]), receipts).items).toHaveLength(1);
  });
});
