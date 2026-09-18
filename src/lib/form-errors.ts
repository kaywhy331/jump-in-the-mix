import { AsyncLocalStorage } from "node:async_hooks";

export type FormResult = { error?: string };
const recoverable = new AsyncLocalStorage<boolean>();
class FormValidationError extends Error {}
/** Only the explicitly wrapped request returns validation; normal action redirects stay intact. */
export function captureFormFailure(message: string): void {
  if (recoverable.getStore()) throw new FormValidationError(message);
}
export async function recoverableFormAction(action: () => Promise<void>): Promise<FormResult> {
  return recoverable.run(true, async () => {
    try { await action(); return {}; }
    catch (error) { if (error instanceof FormValidationError) return { error: error.message }; throw error; }
  });
}
