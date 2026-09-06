import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearPrivateBrowserState, privateStorageKey, signalBrowserChange } from "../src/lib/private-browser-state";
import { readOpenedJump, validOpenedJump } from "../src/lib/opened-jump-state";
import { readContactListState, saveContactListState } from "../src/lib/contact-list-state";
let entries: Map<string, string>;
beforeEach(() => {
  entries = new Map();
  vi.stubGlobal("window", { location: { pathname: "/contacts", search: "?q=Private" }, scrollY: 80, sessionStorage: { get length() { return entries.size; }, key: (index: number) => [...entries.keys()][index], getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value), removeItem: (key: string) => entries.delete(key) } });
});
afterEach(() => vi.unstubAllGlobals());
describe("private browser recovery", () => {
  it("clears legacy and other-account values while preserving this account and unrelated state", () => {
    for (const key of ["jitm:opened-jump", "jitm:contacts:list-state", privateStorageKey("alpha", "opened-jump"), privateStorageKey("beta", "opened-jump"), "unrelated", "jitm:install-dismissed"]) entries.set(key, "value");
    clearPrivateBrowserState("alpha"); expect([...entries.keys()]).toEqual([privateStorageKey("alpha", "opened-jump"), "unrelated", "jitm:install-dismissed"]);
    clearPrivateBrowserState(); expect([...entries.keys()]).toEqual(["unrelated", "jitm:install-dismissed"]);
  });
  it("restores only a valid, recent same-account composer return", () => {
    const value = { scope: "alpha", jumpId: "jump", contactName: "Private person", channel: "SMS", openedAt: Date.now() };
    entries.set(privateStorageKey("alpha", "opened-jump"), JSON.stringify(value));
    expect(readOpenedJump("alpha")).toEqual(value); expect(readOpenedJump("beta")).toBeNull();
    expect(validOpenedJump({ ...value, scope: "beta" }, "alpha")).toBe(false);
    expect(validOpenedJump({ ...value, openedAt: Date.now() + 60_000 }, "alpha")).toBe(false);
    expect(validOpenedJump({ ...value, openedAt: Date.now() - 3 * 60 * 60_000 }, "alpha")).toBe(false);
    expect(validOpenedJump({ ...value, contactName: {} }, "alpha")).toBe(false);
  });
  it("scopes contact search history and rejects unsafe and expired links", () => {
    saveContactListState("alpha"); expect(readContactListState("alpha")).toMatchObject({ href: "/contacts?q=Private", scrollY: 80 }); expect(readContactListState("beta")).toBeNull();
    for (const value of [{ href: "//evil.test", savedAt: Date.now() }, { href: "/contacts/../account", savedAt: Date.now() }, { href: "/contacts", savedAt: Date.now() - 31 * 60_000 }, { href: "/contacts", savedAt: Date.now() + 60_000 }]) {
      entries.set(privateStorageKey("alpha", "contacts:list-state"), JSON.stringify({ ...value, scrollY: 0 })); expect(readContactListState("alpha")).toBeNull();
    }
  });
  it("tolerates blocked browser storage", () => {
    Object.defineProperty(window, "sessionStorage", { get() { throw new Error("Blocked"); } });
    expect(() => clearPrivateBrowserState()).not.toThrow(); expect(() => saveContactListState("alpha")).not.toThrow();
    expect(readContactListState("alpha")).toBeNull(); expect(readOpenedJump("alpha")).toBeNull();
    vi.stubGlobal("crypto", undefined); vi.stubGlobal("BroadcastChannel", undefined);
    expect(() => signalBrowserChange()).not.toThrow();
  });
});
