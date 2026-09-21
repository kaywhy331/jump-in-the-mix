# Journey connection save recovery

The reported save error did not include its exact message. Read-only inspection found the account's saved configuration valid. Three separate save-recovery failures were then reproduced in a disposable local account before changing the implementation:

- Saving a connection after another window changed any part of Journey rejected the entire request, even when the edited connection was untouched.
- A successful write followed by a failed graph refresh was reported as a failed save. The editor retained an obsolete revision and retries became blocked.
- Losing the HTTP response after the transaction committed left the draft in place, but retrying the save failed its old revision check.

## Correction

Journey now submits the edited connection and its original saved version. Under the existing workspace lock, the server merges that connection into the latest configuration. Unrelated rules, Beat gates and intentional endings are preserved. A retry matching the saved connection returns the existing revision without adding another rule, audit entry or preparation job. Ownership, route validation, repeat limits and the account-wide configuration limit still apply.

A genuinely conflicting edit returns HTTP 409 with the current connection. The editor retains the draft, presents the saved settings and offers either loading that version or explicitly saving the user's version. A removed connection requires an explicit restore. Inputs are disabled during a pending save, and unsaved changes are tracked from the actual draft rather than unnamed form fields.

Once the server acknowledges a write, Journey updates the map from the returned configuration and reports the save immediately. A subsequent refresh failure offers a separate refresh retry. Network and unreadable-response failures keep the draft and explain that the save could not be confirmed. Outdated graph reads cannot replace a newer acknowledged configuration.

The shared loop validator now also exposes repeat-limit settings before an enabled return path is submitted. Native validation reveals invalid fields inside collapsed disclosures. Join setup uses the chosen source Mix instead of an empty selection when opened from a drag gesture. These changes retain the supplied design tokens and existing connection/activation semantics; no database migration or execution-engine change is required.

## Verification

The three failure cases failed against the previous implementation and passed after the correction. The browser suite also covers all four endpoint combinations, save/reload, conflicting edits and explicit replacement, hidden-field validation, loops, pointer cancellation, zoom, scrolling, mouse/touch/keyboard input and read-only views. Its light/dark screenshots include the new conflict view on a phone; those screenshots were inspected.

Forty-six focused tests cover independent concurrent saves, idempotent retries, actual conflicts, deletion/restore, ownership, draft Mixes, Beat gating, loop validation, existing durable workflow behavior and saved-timezone rendering. Additional build, browser and live verification results are recorded below after completion. Evidence is retained under ignored `.artifacts/workflow-save-fix-20260921/`.
