# Draft protection and save recovery — September 20, 2026

This release corrects the five reproduced findings in [the remaining interaction review](DESIGN_REMAINING_ISSUES_2026-09-20.md) and adds recovery for stalled Quick Add requests.

- Calendar searches preserve the new/existing event context, typed fields, and selected contact even when that contact does not match the search. Date changes that replace the editor ask before discarding a draft. Canceling restores the filter controls.
- Calendar locks the submitted fields while saving, preventing later edits from being silently replaced by the submitted snapshot.
- Contact preferences display a saving status and temporarily disable further changes until the current save returns with a fresh version. The More pane stays open after saving so the next preference remains reachable. Existing cross-tab version protection remains in place.
- Quick Add reports an uncertain network outcome without exposing browser error text. Retries keep the original request ID. When a prior save committed with different reviewed details, the authorized response includes its receipt; the dialog retains later edits and links to the saved person. Opening that person asks before discarding those later edits.
- Quick Add warns before reload or closing a draft. Private draft contents remain in memory; they are not copied into browser storage.
- Quick Add offers Stop waiting and a 30-second request timeout. Both retain the draft and retry identity. The copy explains that stopping the wait cannot cancel a save already received by the server.

The supplied export remains unchanged. The recovery notice and status text use the existing dialog, button, notice, and semantic color tokens. The prior design work included in this release adds three additive migrations: Mix activation review preference, explicitly manual Quick Add follow-ups, and opt-in quiet-day suggestions. Deploy the worker with the manual-delivery exclusion before exposing the new web capture workflow.

Verification and production deployment evidence will be recorded after the release checks finish. Tests use disposable synthetic records and deliberately delayed/dropped local requests.
