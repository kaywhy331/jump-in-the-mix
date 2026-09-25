import { describe, expect, it } from "vitest";
import { outcomeRequestKey, stableHash, stableStringify } from "@/components/JumpWorkflow";

// One request id per logical attempt depends on equal payloads producing equal keys and changed
// payloads producing new ones; the hash is pinned to independently computed FNV-1a values so the
// algorithm cannot drift silently between builds.
describe("outcome request keys", () => {
  it("writes equal payloads the same way whatever the key order or undefined members", () => {
    expect(stableStringify({ note: "Hi", visibility: "WORKSPACE", nextDate: undefined })).toBe('{"note":"Hi","visibility":"WORKSPACE"}');
    expect(stableStringify({ visibility: "WORKSPACE", note: "Hi" })).toBe(stableStringify({ note: "Hi", nextTime: undefined, visibility: "WORKSPACE" }));
    expect(stableStringify({ workflowDecisions: [{ ruleId: "rule", outcome: "Won" }] })).toBe('{"workflowDecisions":[{"outcome":"Won","ruleId":"rule"}]}');
    expect(stableStringify([1, undefined, null, "x"])).toBe('[1,null,null,"x"]');
    expect(stableStringify(undefined)).toBe("null");
    expect(stableStringify("a:b")).toBe('"a:b"');
  });

  it("hashes deterministically and changes with the payload", () => {
    expect(stableHash({})).toBe("5465b825");
    expect(stableHash({ workflowDecisions: [] })).toBe("d4097c17");
    expect(stableHash({ workflowDecisions: [], visibility: "WORKSPACE", note: "Called back" })).toBe("9ce0d03c");
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }));
    expect(stableHash({ note: "Called back" })).not.toBe(stableHash({ note: "Called back." }));
    expect(stableHash({ workflowDecisions: [{ ruleId: "rule", outcome: "Won" }] })).not.toBe(stableHash({ workflowDecisions: [{ ruleId: "rule", outcome: "Lost" }] }));
    expect(stableHash({ workflowDecisions: [] })).not.toBe(stableHash({}));
  });

  it("keys one logical attempt per follow-up, outcome, payload and handoff", () => {
    const details = { workflowDecisions: [] };
    expect(outcomeRequestKey("jump_1", "COMPLETED", details)).toBe("jump_1:COMPLETED:d4097c17");
    expect(outcomeRequestKey("jump_1", "COMPLETED", { workflowDecisions: [] })).toBe(outcomeRequestKey("jump_1", "COMPLETED", details));
    expect(outcomeRequestKey("jump_1", "REOPENED")).toBe("jump_1:REOPENED:5465b825");
    // A different follow-up, outcome or payload is a different attempt.
    expect(outcomeRequestKey("jump_2", "COMPLETED", details)).not.toBe(outcomeRequestKey("jump_1", "COMPLETED", details));
    expect(outcomeRequestKey("jump_1", "CONNECTED", details)).not.toBe(outcomeRequestKey("jump_1", "COMPLETED", details));
    expect(outcomeRequestKey("jump_1", "COMPLETED", { note: "Left a message" })).not.toBe(outcomeRequestKey("jump_1", "COMPLETED", { note: "Left a message." }));
    // The tray keys per handoff as well, so two openings of one follow-up never share an id.
    expect(outcomeRequestKey("jump_1", "COMPLETED", details, "attempt-a")).toBe("jump_1:COMPLETED:d4097c17:attempt-a");
    expect(outcomeRequestKey("jump_1", "COMPLETED", details, "attempt-a")).not.toBe(outcomeRequestKey("jump_1", "COMPLETED", details, "attempt-b"));
    expect(outcomeRequestKey("jump_1", "COMPLETED", details, "attempt-a")).not.toBe(outcomeRequestKey("jump_1", "COMPLETED", details));
    // Every key starts with the follow-up id so all of its remembered attempts can be dropped together.
    for (const key of [outcomeRequestKey("jump_1", "SKIPPED"), outcomeRequestKey("jump_1", "NO_ANSWER", { note: "x" }, "attempt-a")]) expect(key.startsWith("jump_1:")).toBe(true);
    expect(outcomeRequestKey("jump_10", "SKIPPED").startsWith("jump_1:")).toBe(false);
  });
});
