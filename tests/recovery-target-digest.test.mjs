import { describe, expect, it } from "vitest";
import { recoveryStateDigest, recoveryTargetDigest } from "../scripts/lib/recovery-state.mjs";

const fixture = () => ({
  schemaHash: "a".repeat(64),
  tables: {
    Example: {
      keys: ["id"], columns: [{ name: "id", type: "text", nullable: false }],
      rows: [
        { key: "b".repeat(64), digest: "c".repeat(64), state: { roles: ["first", "second"] } },
        { key: "a".repeat(64), digest: "d".repeat(64), state: { roles: [] } },
      ],
    },
  },
});

describe("recovery content comparison across database collations", () => {
  it("ignores SQL row order while preserving authenticated state and its input", () => {
    const source = fixture(), target = structuredClone(source), before = structuredClone(source);
    target.tables.Example.rows.reverse();
    expect(recoveryTargetDigest(target)).toBe(recoveryTargetDigest(source));
    expect(recoveryStateDigest(target)).not.toBe(recoveryStateDigest(source));
    expect(source).toEqual(before);
  });

  it.each(["changed", "removed", "duplicated", "identity", "safety", "array", "schema", "columns"])("still rejects %s content", change => {
    const source = fixture(), target = structuredClone(source), table = target.tables.Example;
    if (change === "changed") table.rows[0].digest = "e".repeat(64);
    if (change === "removed") table.rows.pop();
    if (change === "duplicated") table.rows.push(structuredClone(table.rows[0]));
    if (change === "identity") table.rows[0].key = "f".repeat(64);
    if (change === "safety") table.rows[0].state.roles.push("third");
    if (change === "array") table.rows[0].state.roles.reverse();
    if (change === "schema") target.schemaHash = "b".repeat(64);
    if (change === "columns") table.columns[0].nullable = true;
    expect(recoveryTargetDigest(target)).not.toBe(recoveryTargetDigest(source));
  });
});
