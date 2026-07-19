import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("design-system accessibility preferences", () => {
  it("defines canonical tokens and operating-system accessibility modes", () => {
    const css = read("src/app/globals.css");
    for (const token of ["--font-size-sm", "--line-height-body", "--z-modal", "--motion-fast", "--status-danger-bg"]) expect(css).toContain(token);
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("prefers-contrast: more");
    expect(css).toContain("forced-colors: active");
  });

  it("uses the native modal dialog contract for destructive confirmation", () => {
    const dialog = read("src/components/ConfirmDialog.tsx");
    expect(dialog).toContain("showModal()");
    expect(dialog).toContain("onClose");
    expect(dialog).toContain("Close confirmation");
  });
});
