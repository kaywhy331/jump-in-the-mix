import { customerReturnPath } from "@/lib/customer-return-path";

/** Continuation is navigation only. The destination still checks ownership and requires Start. */
export function workflowContinuation(value: unknown, contactId?: string): string | null {
  const safe = customerReturnPath(value);
  if (!safe) return null;
  const url = new URL(safe, "https://return.invalid");
  if (url.pathname !== "/journey") return null;
  if (contactId) url.searchParams.set("contactId", contactId);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function workflowStartPath(mixId: string, contactId?: string, label?: string): string {
  return `/journey?${new URLSearchParams({ mix: mixId, start: "1", ...(contactId ? { contactId } : {}), ...(label ? { label: label.slice(0, 160) } : {}) })}`;
}
