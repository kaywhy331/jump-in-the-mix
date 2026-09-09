// Only this class carries a message intended for the import HTTP response.
export class ContactImportInputError extends Error {}

export function contactImportFailure(error: unknown) {
  return error instanceof ContactImportInputError
    ? { status: 400, error: error.message }
    : { status: 503, error: "The import was interrupted. Open its saved results before trying again." };
}
