# Quick Add and Mix activation — September 20, 2026

The owner approved saving the combined Quick Add capture and supporting both Mix activation modes through user configuration. This follows the design audit in `DESIGN_FOLLOWTHROUGH_2026-09-20.md`; the original export remains unchanged.

## Implemented contract

Quick Add reviews an explicitly chosen existing person or a new person, plus optional private note, calendar meeting, and one-time follow-up. The original capture remains visible and can be kept as an editable private note. Recognized phone and email are shown; missing details may be skipped. Selecting an existing person does not overwrite their contact information.

Event and follow-up dates are interpreted separately. All details remain editable. Times that were not stated and follow-up methods that were not specified must be chosen. A proposed event starts with an explicitly displayed, editable one-hour duration. Capture instructions are never treated as customer-facing message copy: written follow-ups require a draft. Dates use the user's saved timezone; nonexistent or ambiguous daylight-saving times are rejected. Calendar overlaps and appointment buffers use the existing calendar checks and an explicit overlap choice.

Saving is atomic: person creation, journey events, private note, calendar entry, follow-up, audit record and retry receipt commit together. Conflicts retain the review for correction. Request IDs prevent repeated or simultaneous saves from duplicating records. Names and normalized contact methods trigger an explicit duplicate choice, including archived matches. Contact selection is limited to the authenticated workspace; do-not-contact prevents creating outreach. Support viewing cannot save captures.

Quick Add follow-ups are explicitly manual. A persisted `Jump.manualOnly` flag excludes them from both automatic-delivery candidate selection and the final delivery check, even when workspace sending is enabled. Today displays the manual status. A specific follow-up link opens its review on phones as well as larger screens.

Account → Personal preferences → Starting mixes offers:

- **Review who gets it before activating** (default).
- **Activate when I save**, with **Review first** still available.

This preference applies to the custom editor, ready-made setup, and starting a Mix from the library. The server reads the saved preference; a submitted field cannot override it. Drafts stay drafts until the user explicitly chooses to start. The preference does not change audience, appointment, scheduling, or sending rules, and changing it does not activate existing drafts.

## Quiet-day decision at this checkpoint

A quiet-day touchpoint would suggest a check-in after a chosen period without meaningful recorded contact, such as 60 days. It is separate from quiet hours, which concern time of day. Existing records include completed follow-ups, call and meeting outcomes, and dated notes, but at this checkpoint the owner had not yet chosen which events should reset an inactivity clock. No inactivity trigger or automatic sending had been enabled at that checkpoint. The pending question offered leaving it off, resetting after any recorded conversation/completed follow-up, or resetting only after a completed follow-up. **Subsequently resolved:** the owner approved completed follow-ups, logged conversations, and explicit Skip/Completed. The later implementation is recorded in [Quiet-day touchpoints](QUIET_DAY_TOUCHPOINTS_2026-09-20.md); this checkpoint’s build evidence remains unchanged.

## Release and verification

Two additive migrations are required before deploying the changed application: `20260920100000_mix_activation_preference` and `20260920101000_quick_capture_manual_followups`. They have been applied only to the disposable local design database. There has been no deployment or customer database migration.

Verified on production build `nB-zQjrSq2iGjhX36fx_c`:

- 53 focused unit/integration and authorization tests passed, including concurrent retry protection, rollback, duplicates, timezone/DST, workspace scoping, do-not-contact, manual delivery exclusion, and persisted activation policy.
- 26 distinct desktop-browser checks passed, exercising phone/tablet/desktop layouts and the existing design-correction workflows. One previous test expected a specific follow-up link to leave the phone review closed; its expectation was updated and that check passed again on this build.
- Four additional mobile Chromium checks passed: Quick Add in both themes, existing-person conflict/retry, and saved activation preferences with optional review.
- Eight Quick Add accessibility scans passed without WCAG A/AA violations across the six desktop-browser theme/width combinations and two mobile theme captures. No horizontal overflow was detected.
- The optimized build, TypeScript, Prisma schema validation, source syntax/import checks and Server Action boundary validation passed.
- The desktop light and phone dark captures were compared with the supplied Quick Add references; tablet dark was also inspected. The review uses the supplied semantic palette, local fonts, original-capture bubble and editable rows. Four selected items and expanded details can scroll; save and close remain reachable.

Verification artifacts and screenshots are in `.artifacts/quick-add-config-20260920/`. `tests.log`, `browser-final.log`, `phone-review-regression.log`, `browser-mobile.log`, `static.log`, and `build.log` retain the results. Earlier failed exploratory runs are not completion evidence.
