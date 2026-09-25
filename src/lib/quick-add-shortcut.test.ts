import { describe, expect, it } from "vitest";
import { quickAddShortcutEnabled, readQuickAddShortcut, shouldOpenQuickAdd, writeQuickAddShortcut, type ShortcutKeyEvent } from "./quick-add-shortcut";

const inField = { isContentEditable: false, closest: () => ({}) as Element };
const onPage = { isContentEditable: false, closest: () => null };
const press = (overrides: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent => ({ key: "n", altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, isComposing: false, repeat: false, target: onPage, ...overrides });

describe("the Quick Add shortcut predicate", () => {
  it("opens on a plain n pressed on the page", () => {
    expect(shouldOpenQuickAdd(press(), false)).toBe(true);
    expect(shouldOpenQuickAdd(press({ target: null }), false)).toBe(true);
  });

  it("ignores other keys and modified presses", () => {
    expect(shouldOpenQuickAdd(press({ key: "m" }), false)).toBe(false);
    expect(shouldOpenQuickAdd(press({ key: "N", shiftKey: true }), false)).toBe(false);
    expect(shouldOpenQuickAdd(press({ ctrlKey: true }), false)).toBe(false);
    expect(shouldOpenQuickAdd(press({ metaKey: true }), false)).toBe(false);
    expect(shouldOpenQuickAdd(press({ altKey: true }), false)).toBe(false);
  });

  it("ignores held keys and keys typed during composition", () => {
    expect(shouldOpenQuickAdd(press({ repeat: true }), false)).toBe(false);
    expect(shouldOpenQuickAdd(press({ isComposing: true }), false)).toBe(false);
  });

  it("never fires from a text field, an editable region or under an open dialog", () => {
    expect(shouldOpenQuickAdd(press({ target: inField }), false)).toBe(false);
    expect(shouldOpenQuickAdd(press({ target: { isContentEditable: true, closest: () => null } }), false)).toBe(false);
    expect(shouldOpenQuickAdd(press(), true)).toBe(false);
  });
});

describe("the shortcut switch", () => {
  it("is on unless the browser remembers an explicit off", () => {
    expect(quickAddShortcutEnabled(null)).toBe(true);
    expect(quickAddShortcutEnabled(undefined)).toBe(true);
    expect(quickAddShortcutEnabled("")).toBe(true);
    expect(quickAddShortcutEnabled("on")).toBe(true);
    expect(quickAddShortcutEnabled("off")).toBe(false);
  });

  it("keeps this visit's choice when storage is unavailable", () => {
    expect(readQuickAddShortcut()).toBe(true);
    expect(writeQuickAddShortcut(false)).toBe(false);
    expect(readQuickAddShortcut()).toBe(false);
    expect(writeQuickAddShortcut(true)).toBe(false);
    expect(readQuickAddShortcut()).toBe(true);
  });
});
