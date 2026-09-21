# Draft protection and save recovery — September 20, 2026

This release corrects the five reproduced findings in [the remaining interaction review](DESIGN_REMAINING_ISSUES_2026-09-20.md) and adds recovery for stalled Quick Add requests.

- Calendar searches preserve the new/existing event context, typed fields, and selected contact even when that contact does not match the search. Date changes that replace the editor ask before discarding a draft. Canceling restores the filter controls.
- Calendar locks the submitted fields while saving, preventing later edits from being silently replaced by the submitted snapshot.
- Contact preferences display a saving status and temporarily disable further changes until the current save returns with a fresh version. The More pane stays open after saving so the next preference remains reachable. Existing cross-tab version protection remains in place.
- Quick Add reports an uncertain network outcome without exposing browser error text. Retries keep the original request ID. When a prior save committed with different reviewed details, the authorized response includes its receipt; the dialog retains later edits and links to the saved person. Opening that person asks before discarding those later edits.
- Quick Add warns before reload or closing a draft. Private draft contents remain in memory; they are not copied into browser storage.
- Quick Add offers Stop waiting and a 30-second request timeout. Both retain the draft and retry identity. The copy explains that stopping the wait cannot cancel a save already received by the server.

The supplied export remains unchanged. The recovery notice and status text use the existing dialog, button, notice, and semantic color tokens. The prior design work included in this release adds three additive migrations: Mix activation review preference, explicitly manual Quick Add follow-ups, and opt-in quiet-day suggestions. Deploy the worker with the manual-delivery exclusion before exposing the new web capture workflow.

## Verified locally

- Production build `OgsRaffqYtR1XavtWVBm9`, TypeScript and static/schema/action-boundary checks passed.
- 1,293 distinct unit/integration tests passed across the fresh-database run and targeted reruns; 68 conditional tests were skipped. Three assertions referenced the old page/component structure and were updated to verify the current delegation and desktop Help placement. The initial broad run on an already populated local database was excluded from acceptance.
- 51 distinct browser scenarios passed: 16 save-recovery desktop/phone scenarios and 35 existing Quick Add, activation, quiet-day and sheet workflows. The enlarged-text check exposed a native fieldset focus/scroll problem with `display: contents`; the fields now use grid layout. The corrected keyboard/Calendar scenarios and all six affected desktop/phone save scenarios passed on the final build.
- Recovery screenshots were inspected in light and dark themes. Browser checks include native reload/discard confirmations, actual database writes, lost responses, an explicit 30-second timeout, retry identity, accessible errors, phone reflow, enlarged root text and keyboard focus.

Evidence is retained in `.artifacts/recovery-release-20260920/`. Tests use disposable synthetic records and deliberately delayed/dropped local requests. Coverage is Chromium desktop and phone emulation; real-device keyboards and other browser engines were not tested.

## Production release

Deployed to https://jumpinthemix.com/ on September 20, 2026 (PDT; September 21 UTC).

- Release commit: `9ec7daf4a25af1e4ca86ed2d686d6f4d0579feee`, branch `release/save-recovery-20260920`.
- Render web deployment: `dep-daoal8btqb8s73eiu6tg`; worker: `dep-daoak8n40ujc73ei3to0`.
- Live build: `U6Pl5KC7P6kojebIXIowU`.
- Verified all 745 checked source/configuration files and 20 served static assets against the release. All 64 required migrations match; none are missing or mismatched.
- Fresh encrypted backup completed before the three additive migrations. Existing production record counts were unchanged by migration, the restricted runtime role remained qualified, and the recovery boundary stayed clear.
- The worker deployed first, completed a scoped synthetic queue job, and removed that job without creating follow-ups or deliveries.
- Live web, database readiness, worker and recovery-boundary health checks passed. Protected routes still redirect unauthenticated requests to sign-in.
- 12 public browser checks passed across the homepage, contractor page and FAQ at phone/desktop widths in both themes, including the interactive demo and appearance persistence. No browser errors, failed static assets, unintended writes, horizontal overflow or axe violations were found in these checks.
- 13 authenticated checks passed: real password sign-in; guarded Calendar date changes; retained drafts and selected contacts during search; actual Calendar saving; successive preference changes; actual committed Quick Add recovery after a dropped response; retained later edits; authorized receipt navigation; and Calendar/recovery layouts in both themes at 390px/1440px. The temporary account and workspace were removed. These checks created no outbound follow-ups.

The live domain was verified on Render. The separately linked Netlify site does not own `jumpinthemix.com`; no Netlify production or staging deployment was performed. A transient deployment-status connection timeout and an older draining instance were observed during rollout; final acceptance used the verified new revision after the old instance drained.

Retain the additive schema if correcting or rolling back the web release. Keep the worker's `manualOnly` exclusion: rolling the worker back to the previous revision could expose newly captured manual follow-ups to automatic delivery. Prefer a forward correction.
