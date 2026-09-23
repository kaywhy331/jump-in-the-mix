import { Fragment } from "react";

/** Shows {{First Name}}-style placeholders as readable chips instead of raw template syntax. */
export function MergeFieldText({ text }: { text: string }) {
  const parts = text.split(/(\{\{\s*[^{}]+?\s*\}\})/g);
  return <>{parts.map((part, index) => {
    const field = /^\{\{\s*([^{}]+?)\s*\}\}$/.exec(part)?.[1];
    return field ? <span className="merge-field-chip" key={index} title={`Filled in automatically: ${field}`}>{field}</span> : <Fragment key={index}>{part}</Fragment>;
  })}</>;
}
