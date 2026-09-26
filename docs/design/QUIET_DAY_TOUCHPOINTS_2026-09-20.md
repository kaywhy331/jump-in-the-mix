# Quiet-day touchpoints — September 20, 2026

The owner approved keeping a “Check in with Maria” suggestion actionable until a completed follow-up, a logged conversation, or an explicit Skip/Completed decision resolves it. This closes the quiet-day question recorded in the earlier design and Quick Add reports. The original design export remains unchanged.

## Implemented behavior

Account → Personal preferences → Quiet-day check-ins enables suggestions and sets the workspace interval, from 1 to 365 calendar days. **Implementation assumptions:** existing workspaces start with suggestions off; the initial interval is 60 days, as shown in the export. Each resolution starts a fresh quiet period, so Skip does not immediately bring the same suggestion back. People with sufficiently old history can appear immediately when enabled. The settings explain this behavior and their workspace scope.

The clock starts at the person's creation date and resets at the latest qualifying record:

- A follow-up currently marked done, using its completion date. Existing follow-up outcome semantics are preserved.
- A dated note explicitly marked “This records a conversation,” including private conversation notes.
- A recorded Conversation started journey event, including trusted intake events. Connected-call events are counted through their current follow-up record so Undo remains effective.
- A completed, non-canceled calendar meeting, using its recorded outcome date.
- An explicit Completed or Skip decision on this quiet-day suggestion.

An ordinary note, scheduled meeting, message handoff, or skipped unrelated follow-up does not reset the clock. Removing a conversation note or reopening a completed follow-up recalculates eligibility from the remaining history. Calendar days use the viewer's saved timezone, including local midnight and daylight-saving boundaries; dates are not fixed 24-hour durations. Changing the interval recalculates eligibility.

Suggestions are derived from current records. They create no scheduled follow-up, outbound message, or stage movement. Archived and do-not-contact people are excluded. Contacts without a stage can still appear. Existing journey rules on real conversation/call outcomes retain their normal behavior; resolving the suggestion itself does not run a transition.

Today shows up to three due suggestions and a View all link. Journey adds the lower “Just saying hello” node, exact due count, represented-stage dots, and a searchable roster with 20 people per page. Phones use the touchpoint row; tablets put the roster before the touchpoint list. Each person offers their existing follow-up review when available, Log conversation, Skip, and Completed. Log conversation opens the contact's note composer with the conversation choice checked. History labels these notes as conversations and includes them in the communications filter.

Updates refresh the list after an outcome, contact activity, or returning to the tab. A resolution is recorded in history with an audit entry. Retrying the same decision does not extend the interval or clear a later cycle. Changed or already-resolved suggestions are refreshed safely. Workspace membership scopes all reads and mutations; support viewing remains read-only.

## Release status

Migration `20260920120000_quiet_day_suggestions` adds the workspace settings and enforces the interval range. It has been applied only to the disposable local design database, alongside the earlier Quick Add and activation migrations. No customer database migration or deployment has been performed.

## Verification

Verified on production build `Ah_HB_gqP9XbybpM9zgf7` against the disposable local database:

- 20 focused unit/integration and authorization checks passed. Coverage includes local midnight and daylight-saving boundaries, qualifying versus ordinary notes, completed and reopened follow-ups, meeting outcomes, repeated/concurrent decisions, stale cycles after configuration or history changes, workspace isolation, archived/do-not-contact exclusions, and exact pagination/search.
- 29 distinct desktop-browser workflow checks passed: 13 quiet-day checks and 16 existing design/workflow regressions. These cover completed follow-ups, explicit outcomes, conversation capture and communications history, preferences, anonymous access, keyboard focus, pagination after the last result is removed, and search from the phone header. The anonymous POST check passed on a focused rerun after its test request supplied the same-origin header required by the existing CSRF policy.
- Three additional mobile Chromium workflows passed: Today resolution and follow-up completion, conversation capture, and saved interval/enablement preferences.
- Eight quiet-day accessibility scans passed with no reported WCAG A/AA violations across light/dark at 320, 390, 834 and 1440 pixels. Those views had no horizontal overflow. Skip works by keyboard and moves focus to its result announcement.
- Final light desktop/narrow-phone and dark phone/tablet screenshots were inspected against the supplied Journey references. The implementation retains the lower quiet-day node, flat roster, stage dots, semantic palette and shared fonts. The added resolution controls wrap on narrow screens; the underlying workflow has no fictional counts or records.
- The optimized build, TypeScript, Prisma schema, syntax/import checks, Server Action boundaries and whitespace checks passed. Database release verification reports all 64 required migrations present with no mismatches on the isolated database.

Artifacts are in `.artifacts/quiet-days-20260920/`: `tests.log`, `browser-final.log`, `authorization.log`, `browser-mobile.log`, `build.log`, `typecheck.log`, `static.log`, `database-release.log`, and the theme/width screenshots. Earlier exploratory failures are retained for diagnosis and are superseded by the passing checks described above.
