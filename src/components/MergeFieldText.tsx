import { Fragment } from "react";

// A merge field is {{Name}}: braces around at least one visible character, with optional spaces
// inside the braces. Empty braces stay literal text rather than becoming a blank chip.
const MERGE_FIELD = /(\{\{\s*[^{}\s][^{}]*?\s*\}\})/g;
const MERGE_FIELD_NAME = /^\{\{\s*([^{}\s][^{}]*?)\s*\}\}$/;

export const MERGE_FIELD_TITLE = "Filled in from the person or your business details when you send; blank when that detail is missing";

/** Shows {{First Name}}-style placeholders as readable chips instead of raw template syntax. */
export function MergeFieldText({ text }: { text: string }) {
  const parts = text.split(MERGE_FIELD);
  return <>{parts.map((part, index) => {
    const field = part.match(MERGE_FIELD_NAME)?.[1];
    return field ? <span className="merge-field-chip" key={index} title={MERGE_FIELD_TITLE}>{field}</span> : <Fragment key={index}>{part}</Fragment>;
  })}</>;
}
