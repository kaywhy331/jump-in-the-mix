import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MERGE_FIELD_TITLE, MergeFieldText } from "@/components/MergeFieldText";

const render = (text: string) => renderToStaticMarkup(createElement(MergeFieldText, { text }));

describe("MergeFieldText", () => {
  it("turns named fields into chips and leaves empty braces as ordinary text", () => {
    const html = render("Hi {{ }} and {{First Name}}, see {{ contact.custom.x }}.");
    expect(html).toContain(`<span class="merge-field-chip" title="${MERGE_FIELD_TITLE}">First Name</span>`);
    expect(html).toContain(`<span class="merge-field-chip" title="${MERGE_FIELD_TITLE}">contact.custom.x</span>`);
    expect(html.match(/merge-field-chip/g)).toHaveLength(2);
    expect(html.startsWith("Hi {{ }} and <span")).toBe(true);
    expect(html.endsWith("</span>.")).toBe(true);
  });

  it("does not promise a value the person may not have", () => {
    expect(MERGE_FIELD_TITLE).toBe("Filled in from the person or your business details when you send; blank when that detail is missing");
    expect(render("{{Company}}")).not.toContain("Filled in automatically");
  });

  it("keeps text without fields, and braces that hold nothing, untouched", () => {
    expect(render("Plain words.")).toBe("Plain words.");
    expect(render("{{}} {{ }} {{   }}")).toBe("{{}} {{ }} {{   }}");
  });
});
