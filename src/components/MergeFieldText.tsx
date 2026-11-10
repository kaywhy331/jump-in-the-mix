import { Fragment } from "react";

import { parseMergeFields } from "@/lib/merge-field-parts";

export const MERGE_FIELD_TITLE = "Filled in from the person or your business details when you send; blank when that detail is missing";

/** Shows {{First Name}}-style placeholders as readable chips instead of raw template syntax. */
export function MergeFieldText({ text, title = MERGE_FIELD_TITLE }: { text: string; title?: string }) {
  const parts = parseMergeFields(text);
  return <>{parts.map((part, index) => {
    const field = part.field;
    return field ? <span className="merge-field-chip" key={index} title={title}>{field}</span> : <Fragment key={index}>{part.value}</Fragment>;
  })}</>;
}
