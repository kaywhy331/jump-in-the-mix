import { APPROVED_PLACEHOLDERS, PRIVATE_NOTE_PLACEHOLDERS } from "@/lib/placeholders";

export type MergeFieldOption = { token: string; label: string };
export type MergeFieldPart = { value: string; field?: string };

/** Keep each original spelling, including whitespace and aliases, for lossless storage. */
export function parseMergeFields(text: string): MergeFieldPart[] {
  return text.split(/(\{\{\s*[^{}\s][^{}]*?\s*\}\})/g).map(value => ({
    value, field: value.match(/^\{\{\s*([^{}\s][^{}]*?)\s*\}\}$/)?.[1]
  }));
}

export function serializeMergeFields(parts: MergeFieldPart[]): string {
  return parts.map(part => part.value).join("");
}

export function mergeFieldOptions(includePrivate = false): MergeFieldOption[] {
  return APPROVED_PLACEHOLDERS.filter(token => !token.includes(".") &&
    (includePrivate || !(PRIVATE_NOTE_PLACEHOLDERS as readonly string[]).includes(token)))
    .map(token => ({ token, label: parseMergeFields(token).find(part => part.field)!.field! }));
}

export function mergeFieldLabel(part: MergeFieldPart, fields: MergeFieldOption[] = []): string {
  const known = fields.find(field => field.token === part.value);
  if (known) return known.label;
  if (part.field?.startsWith("contact.custom.")) return "Custom field";
  return (part.field ?? "").replace(/^contact\./, "").replace(/^my\./, "My ")
    .replace(/^appointment\./, "Appointment ").replaceAll("_", " ");
}

const escapeHtml = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("\r", "&#13;");

/** Only generated spans and escaped text enter the editable DOM. */
export function mergeFieldHtml(text: string, fields: MergeFieldOption[]): string {
  return parseMergeFields(text).map(part => part.field
    ? `<span contenteditable="false" class="merge-field-chip" data-merge-field="${escapeHtml(part.value)}">${escapeHtml(mergeFieldLabel(part, fields))}</span>`
    : escapeHtml(part.value)).join("");
}

export function readMergeFieldDom(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? "";
  if (node instanceof HTMLElement) {
    if (node.dataset.mergeField !== undefined) return node.dataset.mergeField;
    if (node.tagName === "BR") return "\n";
  }
  const children = Array.from(node.childNodes);
  // Browsers use block elements for Enter and multiline insertText, and a lone
  // BR as the caret placeholder in an empty block. Neither is authored markup.
  if (children.length === 1 && children[0] instanceof HTMLElement && children[0].tagName === "BR") return "";
  const block = (child: Node) => child instanceof HTMLElement && ["DIV", "P"].includes(child.tagName);
  return children.map((child, index) => `${index && (block(child) || block(children[index - 1])) ? "\n" : ""}${readMergeFieldDom(child)}`).join("");
}
