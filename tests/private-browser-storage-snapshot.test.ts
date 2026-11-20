import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPrivateBrowserState, privateStorageKey, storageKeys } from "../src/lib/private-browser-state";

// JITM-PRIV-02. Chromium orders sessionStorage keys by hash and table size, so removing an
// item can reorder the keys that remain. This storage does the same: every change re-sorts
// the keys by a hash salted with the current size.
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) value = Math.imul(value ^ text.charCodeAt(index), 0x01000193) >>> 0;
  return value;
}
function reorderingStorage(keys: string[]) {
  const values = new Map<string, string>();
  let order: string[] = [];
  const reorder = () => { order = [...values.keys()].sort((a, b) => hash(`${values.size}:${a}`) - hash(`${values.size}:${b}`)); };
  const storage = {
    get length() { return values.size; },
    key: (index: number) => order[index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); reorder(); },
    removeItem: (key: string) => { if (values.delete(key)) reorder(); },
    order: () => [...order]
  };
  for (const key of keys) storage.setItem(key, "value");
  return storage;
}

const OWN = "own-scope";
const unrelated = Array.from({ length: 64 }, (_, index) => `unrelated-${index}`);
const other = [privateStorageKey("A", "opened-jump"), "jitm:opened-jump", "jitm:contacts:list-state"];
const manyOther = [...other, ...["A", "f".repeat(64)].flatMap(scope => ["capture-draft", "contacts:list-state", "opened-jump:unresolved"].map(name => privateStorageKey(scope, name)))];
const own = [privateStorageKey(OWN, "opened-jump"), privateStorageKey(OWN, "contacts:list-state")];
const keySets = [
  ...unrelated.map(name => ({ clear: other, keep: [name] })),
  ...[2, 3, 5, 9].map(count => ({ clear: other, keep: unrelated.slice(0, count) })),
  ...unrelated.slice(0, 16).map(name => ({ clear: manyOther, keep: [name] })),
  ...unrelated.slice(0, 16).map(name => ({ clear: manyOther, keep: [...own, name, ...unrelated.slice(32, 36)] }))
];

afterEach(() => vi.unstubAllGlobals());

describe("storage key snapshot", () => {
  it("returns every key once, in the storage's order, and is not changed by later removals", () => {
    const storage = reorderingStorage([...manyOther, ...unrelated.slice(0, 5)]);
    const keys = storageKeys(storage);
    expect(keys).toEqual(storage.order());
    expect(new Set(keys).size).toBe(manyOther.length + 5);
    const before = [...keys];
    for (const key of keys) storage.removeItem(key);
    expect(storage.length).toBe(0);
    expect(keys).toEqual(before);
  });

  it("skips indexes that hold no key", () => {
    const keys = ["first", null, "third"];
    expect(storageKeys({ length: keys.length, key: (index: number) => keys[index] ?? null })).toEqual(["first", "third"]);
    expect(storageKeys({ length: 0, key: () => "never" })).toEqual([]);
  });

  it("models the hazard: removals reorder the remaining keys", () => {
    const reordered = keySets.some(({ clear, keep }) => {
      const storage = reorderingStorage([...clear, ...keep]);
      const expected = storage.order().filter(key => key !== clear[0]);
      storage.removeItem(clear[0]);
      return storage.order().join("\n") !== expected.join("\n");
    });
    expect(reordered).toBe(true);
  });
});

describe("private browser cleanup with reordering storage", () => {
  it("removes every other-account and legacy key for any set and order of other keys", () => {
    const survivors: string[] = [];
    for (const { clear, keep } of keySets) {
      for (const keepScope of [undefined, OWN]) {
        for (const keys of [[...clear, ...keep], [...keep, ...clear], [...clear].reverse().concat(keep)]) {
          const storage = reorderingStorage(keys);
          vi.stubGlobal("window", { sessionStorage: storage });
          clearPrivateBrowserState(keepScope);
          const left = storage.order();
          const expected = keepScope ? keep : keep.filter(key => !own.includes(key));
          survivors.push(...left.filter(key => !expected.includes(key)).map(key => `${key} (with ${keep.join(", ")})`));
          expect(expected.filter(key => !left.includes(key))).toEqual([]);
        }
      }
    }
    expect(survivors).toEqual([]);
  });
});
