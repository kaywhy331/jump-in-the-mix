import { describe, expect, it } from "vitest";
import { mergeFieldHtml, mergeFieldLabel, mergeFieldOptions, parseMergeFields, serializeMergeFields } from "@/lib/merge-field-parts";

describe("lossless merge fields", () => {
  it.each([
    "", "No fields", "Hi {{First Name}},\n{{SMS Signature}}", "{{First Name}}{{Last Name}}",
    " \t{{ First Name }}\r\n{{contact.first_name}}\n\n", "{{contact.custom.custom_contact_information_1}}",
    "{{Unknown Future Field}} {{}} {{   }} {unfinished {{First Name}",
    "{{ First\r\n Name }}", "🫶 café e\u0301\u00a0{{My Company}} <script> & \"quotes\""
  ])("preserves every byte through load/save: %j", text => {
    expect(serializeMergeFields(parseMergeFields(text))).toBe(text);
  });
  it("inserts the existing canonical spelling", () => {
    const field = mergeFieldOptions().find(option => option.label === "First Name")!;
    expect(serializeMergeFields([...parseMergeFields("Hi "), { value: field.token, field: field.label }])).toBe("Hi {{First Name}}");
    expect(mergeFieldOptions().some(option => option.label === "Private Notes")).toBe(false);
    expect(mergeFieldOptions(true).some(option => option.label === "Private Notes")).toBe(true);
  });
  it("uses a current custom name without changing its key", () => {
    const token = "{{contact.custom.policy_number}}";
    const fields = [{ token, label: "Renewal number" }];
    const part = parseMergeFields(token).find(part => part.field)!;
    expect(mergeFieldLabel(part, fields)).toBe("Renewal number");
    expect(serializeMergeFields([part])).toBe(token);
    expect(mergeFieldLabel(part)).toBe("Custom field");
  });
  it("escapes pasted text and field names before generating HTML", () => {
    const html = mergeFieldHtml('<img src=x onerror="alert(1)"> {{First Name}}\r\n', [{ token: "{{First Name}}", label: "<svg onload=alert(1)>" }]);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<svg");
    expect(html).toContain('data-merge-field="{{First Name}}"');
    expect(html).toContain("&#13;\n");
  });
});
