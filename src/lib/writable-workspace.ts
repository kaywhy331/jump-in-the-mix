import { requireWorkspace } from "@/lib/auth";
import { captureFormFailure } from "@/lib/form-errors";

export const VIEW_ONLY_SUPPORT_MESSAGE = "This support session is view-only. End the support view before making changes.";

/** Thrown when a mutating action runs during an administrator support view. */
export class ViewOnlySupportSessionError extends Error {
  constructor() {
    super(VIEW_ONLY_SUPPORT_MESSAGE);
    this.name = "ViewOnlySupportSessionError";
  }
}

/**
 * requireWorkspace() for actions that change data. The proxy already rejects unsafe requests
 * while the impersonation cookie is present; this refuses in the action itself as well, so a
 * request that reaches the action without that cookie check still cannot write as the customer.
 * Inside a recoverable form action the refusal comes back as the form's error message. A plain
 * form action passes `refuse` (its own error redirect) so the message appears on the page; an
 * error thrown from a plain action would only reach the generic error page.
 */
export async function requireWritableWorkspace(refuse?: (message: string) => never) {
  const context = await requireWorkspace();
  if (context.impersonation) {
    captureFormFailure(VIEW_ONLY_SUPPORT_MESSAGE);
    refuse?.(VIEW_ONLY_SUPPORT_MESSAGE);
    throw new ViewOnlySupportSessionError();
  }
  return context;
}
