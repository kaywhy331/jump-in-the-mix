# Invitation flow audit — 2026-09-16

**Follow-up implementation:** the authorization and usability fixes described below are now applied locally on `fix/invitation-admission-authorization`, based on deployed revision `a4407b1`. Manual issuance and schedule changes recheck current staff/session/MFA authority inside ordered locks; the waitlist form explains admission blocks and prevents unusable submissions. Validation passed: 196 targeted tests (including 24 authorization regressions), six desktop/mobile Chromium checks against the packaged standalone build, TypeScript, static validation and the production build. Browser coverage includes zero limits, paused issuance, exhausted reservations and a smaller manual batch that fits while a weekly batch waits. The original seven audit reproductions remain historical evidence; the new regression suite asserts rejection of revoked authority.

At completion of local validation (**16:13 UTC**), these fixes had **not been deployed**. Production admission limits and the weekly schedule were unchanged, pending the user's rollout configuration choice. No real invitations were sent. Both local test databases used for fix validation were dropped. Fix evidence is retained in `.artifacts/invitation-fix-2026-09-16/`; any later production deployment requires its own receipt. The findings and production snapshot below describe the original audit of `a4407b1`.

The reported error is caused by production admission limits that are still set to zero. The application rejects the selection before creating an invitation or queueing email. Waiting and retrying cannot open capacity while either limit remains zero.

Production was inspected at **2026-09-16 15:39:48 UTC** through the existing Render web service. Its live revision was `a4407b10634d8e08eb0fe8b05bbd48fdfb5b1847`. All database inspection ran in a bounded, repeatable-read, **read-only transaction** and returned configuration and aggregate counts only. No recipient addresses, invitation links, credentials, session values, or message content were collected.

## Findings

### 1. Immediate blocker: admission has never been opened

| Production observation | Value |
| --- | --- |
| Total account and reservation limit | 0 |
| Outstanding invitation limit | 0 |
| Policy revision / recorded policy changes | 0 / 0 |
| Policy last updated | 2026-09-09 21:52:29 UTC |
| Customer accounts / unused customer invitations | 0 / 0 |
| Available invitation reservations | 0 |
| Confirmed / unconfirmed waiting entries | 1 / 1 |
| Invitation outbox records | 0 |
| Collection, issuance, referral and redemption pause flags | All false |
| Weekly waves | Enabled; next due 2026-09-16 21:53:36 UTC |

The admission migration intentionally initializes both ceilings to zero. Available reservations are `max(0, min(total limit − customer accounts − unused invitations, outstanding limit − unused invitations))`. The manual selection is all-or-nothing: its eligible recipients must fit this number before any grant or outbox row is created. The unconfirmed entry is not eligible.

References: [admission calculation and error](../src/lib/admission.ts), [manual allocation transaction](../src/lib/waitlist.ts), [zero-default migration](../prisma/migrations/20260909020000_admission_controls/migration.sql), [operator setup](ADMISSION_CONTROLS.md).

This is an unconfigured launch control, not evidence that Render or the email provider rejected a send. The admission calculation, manual batch capacity check, administrator actions and delivery worker are unchanged between the previous production revision `8402618` and the current deployment. Other waitlist changes carry marketing-scenario choices and update invitation wording; they do not change this capacity decision. The persisted policy also predates this deployment.

**Operational resolution:** a named administrator with `settings.manage` should open [Admin → Admission](https://jumpinthemix.com/admin/admission), choose explicit limits, and save with an audit reason, current password and recent MFA verification. At this snapshot, limits of **1 total and 1 outstanding** would permit the single confirmed recipient; that is the minimum arithmetic requirement, not a capacity recommendation. A broader rollout needs a deliberate choice of limits. Return to Waitlist and select only the intended confirmed recipient after saving.

Weekly waves are enabled. Once capacity is configured, an eligible due wave can allocate invitations automatically; the next due time above is **2:53 PM America/Los_Angeles on September 16**. If the intent is manual-only release, use the existing weekly-wave pause control before opening capacity. No limits or schedules were changed during this audit.

### 2. Security defect: two mutations can use stale staff authorization

Manual issuance and weekly schedule changes call `requirePlatformAdmin` before the mutation. They subsequently acquire only the access lock and do not recheck current staff permissions, session validity or MFA inside the transaction. If authority is revoked after the initial check, an in-flight request can still queue an invitation or pause/resume the schedule.

Affected entry points: `inviteWaitlistSelectionAction` and `setWaitlistScheduleAction` in [waitlist-admin-actions.ts](../src/lib/waitlist-admin-actions.ts), plus the manual allocation transaction in [waitlist.ts](../src/lib/waitlist.ts). The existing retry action in that same action file already demonstrates the stronger pattern: ordered staff/access locks and `staffSessionHasPermissions` before writes.

**Evidence:** six isolated PostgreSQL reproductions modeled a successful route authorization followed by revocation before mutation: permission removal, session deletion and MFA-session deletion for each action. Each reproduction first verified that authority was valid, then verified that the shared live-authority checker rejected the revoked state. Both actions nevertheless committed. The authentication boundary was mocked to deliver its earlier result; database writes and application mutation functions were real. These are controlled reproductions of the transaction gap, not evidence of production exploitation or an unauthenticated bypass. No email was sent.

**Recommended fix:** carry the authenticated session into the mutation, acquire staff then access locks in the established order, and revalidate the required permissions, active verified account, live session and enabled MFA credential/verification before changes. Add regression cases that require rejection and zero mutation after revocation. Preserve admission calculations and all-or-nothing allocation. No runtime fix was applied by this audit.

### 3. Usability defect: the form offers an operation known to be blocked

The manual Send button is disabled only when the displayed entries contain no confirmed email. It remains enabled with zero admission capacity or paused issuance. The resulting message says “Please try again later,” without explaining that an administrator must configure capacity. The page does show remaining capacity and an admission-settings link in the separate Automatic waves section, but the manual form does not make this dependency clear.

References: [manual form](../src/app/(staff)/admin/waitlist/page.tsx), [shared error text](../src/lib/admission.ts).

**Recommended fix:** show the reason beside the manual action, distinguish unconfigured limits from exhausted capacity and paused issuance, and link authorized operators to Admission. Disable submission when no selection can succeed, while retaining authoritative server-side checks for concurrent changes. Do not imply that an oversized weekly batch blocks a smaller manual selection that fits.

## Delivery and redemption audit

- The worker was `RUNNING`, with its latest heartbeat six seconds old. Sender, provider-key and encryption-key settings were present; pilot mode was off.
- The stored email ledger recorded two waitlist-confirmation messages and three authentication messages as provider-accepted and delivered, with no adverse events on those records. There were no access-invitation records to inspect. Recorded delivery events do not establish inbox placement for a new invitation.
- Local email-attempt counters were well below configured application limits: one non-auth attempt in the last 24 hours; five total attempts in the rolling 31-day window. The configured application ceilings were 90/day and 2,700/31 days, with authentication reserves. These are application counters, not an independent provider quota inspection.
- Allocation and redemption share the access transaction lock. Tests confirmed whole-batch rejection, concurrent allocation limits, duplicate handling, email-bound single-use redemption, rollback on failed signup, and preservation of already-issued reservations when limits decrease.
- Queued delivery freezes encrypted content and an idempotency key. Tests exercised lease claims, retry bounds, receipt recovery, suppression, cancellation and generation protection. Staff invitations use separate authority/expiry rules and the shared email outbox; this reported error belongs to customer waitlist issuance.

No production invitation was issued, no existing invitation was retried, and no customer or staff account was used for a live acceptance test. A controlled production invitation-to-signup test remains unperformed by this audit.

## Validation and retained evidence

Local HEAD was `52dc545f281ab604d3d5e5568bea7e7986a19893`. Its source, migrations, scripts, dependencies and Next configuration match the deployed merge revision; only earlier documentation differs. Tests used fresh disposable local PostgreSQL databases initialized from the unchanged committed migrations. Email/provider calls were mocked; the additional audit reproductions prohibited outbound fetches.

- **158 existing tests passed; 0 failed; 0 skipped**, across admission (13), waitlist integration (25), waitlist actions (14), frozen email payloads (3), referral unit/integration (22), staff invitations (11), and invitation recovery/repeat delivery (70).
- **7 audit reproductions completed:** one reproduced the exact zero-limit error and verified unchanged waiting state with no grant/outbox; six demonstrated the authorization defect described above. Their successful execution confirms the defect, not a fix.
- Both disposable databases were dropped and their absence verified. The original local database and original hosted test database were not modified.
- No production configuration, migration history, application source, deployment or release manifest changed. No live outbound send was requested.

Sanitized evidence is retained under `.artifacts/invitation-audit-2026-09-16/`: `production-snapshot.json`, `production-readonly.mjs`, `tests.json`, `tests.log`, `audit.repro.test.ts`, `vitest.config.mjs`, `reproductions.json`, `reproductions.log`, and `cleanup.json`. The reproduction suite is audit evidence outside the normal test suite and deliberately asserts the currently observed faulty behavior; it must be inverted when promoted into fix regression tests.
