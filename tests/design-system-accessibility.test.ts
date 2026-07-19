import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const sourceFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? sourceFiles(join(directory, entry.name)) : [join(directory, entry.name)]);

describe("design-system accessibility preferences", () => {
  it("defines canonical tokens and operating-system accessibility modes", () => {
    const css = read("src/styles/base.css");
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
    const tsx = sourceFiles("src").filter((path) => path.endsWith(".tsx")).map(read).join("\n");
    expect(tsx).not.toMatch(/<details[^>]+destructive-confirm/);
    for (const workflow of ["deleteContactGroupAction", "bulkArchiveContactsAction", "archiveContactAction", "archiveMixAction", "removeMixAssignmentAction", "stopMixForContactAction"]) {
      const location = sourceFiles("src").filter((path) => path.endsWith(".tsx") && read(path).includes(workflow));
      expect(location.some((path) => read(path).includes("ConfirmDialog"))).toBe(true);
    }
  });

  it("centralizes stylesheet ordering and uses SVG workflow icons", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain('import "@/styles/index.css"');
    expect(sourceFiles("src/app").some((path) => /prd-.*\.css$/.test(path))).toBe(false);
    const icons = read("src/components/AppIcon.tsx");
    for (const name of ["email", "phone", "message", "arrowUp", "arrowDown", "check", "refresh"]) expect(icons).toContain(`${name}:`);
  });
});
