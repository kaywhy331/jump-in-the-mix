# Waitlist operation

Implemented locally September 8, 2026. This is not a production deployment receipt.

## Setup

1. Set `DATABASE_URL`, `APP_URL`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM`, and `DATA_ENCRYPTION_KEY` on the web service and existing worker. Use the same encryption key on both. Set `PILOT_MODE=false`. Keep production administrator MFA enabled.
2. Back up an existing database, then run `npm run db:deploy` and `npm run db:generate`. Deploy matching web/worker builds. Apply all reviewed migrations, including `20260908120000_waitlist_waves`, `20260908160000_staff_permissions`, `20260908200000_invitation_preferences`, `20260908230000_email_delivery_controls`, `20260908233000_optional_email_preferences`, and `20260909020000_admission_controls`.
3. Start the existing worker with `npm run worker` (or the existing authenticated scheduled worker pass). No new queue service or cron subscription is needed. A sleeping web process by itself cannot release weekly waves.
4. Open **Admin → Waitlist** using a named staff account with `waitlist.read` (see [Staff access](STAFF_ACCESS.md) for first-Owner setup). Confirm sender configuration, worker health, and the next wave date. The first configured worker pass sets that date seven days ahead.
5. Open **Admin → Admission** with `settings.manage`, configure total and outstanding-invitation limits, and save with your password, recent MFA, and an audit reason. Limits default to zero for new and upgraded installations. Collection and existing invitation links continue; new grants wait for configured capacity. See [Admission controls](ADMISSION_CONTROLS.md).
6. Connect the signed Resend webhook and review the free-tier allowances in [Email operations](EMAIL_OPERATIONS.md). Rehearse email confirmation, a manual invitation, signup, and verification with your own test inbox before public activation. Unit/integration tests mock email delivery; local browser tests queue invitations without sending external email.

## What people see

- Homepage and `/waitlist`: email-only request for a free account. Joining does not create an account. A confirmation email is required for selection; the confirmation link lasts 24 hours and requires a button press so email scanners do not confirm requests on GET.
- Duplicate requests preserve the original signup date. Confirmed entries keep their place. Public receipts do not disclose account, waitlist, or invitation status.
- Existing members still send five lifetime personal invitations through the System Mix. An issued referral immediately removes the matching email from the active Waiting queue, including unconfirmed entries.
- A personal access URL creates one account, using only its intended email. Account email verification is still required. Every new verified member has five personal invitations available.

## Automatic waves

Every seven days, choose the five oldest **confirmed, still-waiting** entries by original request timestamp (stable ID breaks ties). Then choose five uniformly randomized entries from the remaining confirmed queue using PostgreSQL sampling. The selections never overlap. With fewer eligible entries, send only those available: at most five FIFO and five random.

The whole eligible batch must fit the configured admission limits. If it does not, the wave keeps its due date and waits for capacity; it does not silently shrink the random half. New-grant pauses also defer it. Existing grants reserve room for signup. See [Admission controls](ADMISSION_CONTROLS.md) for counting and pause behavior.

The schedule is stored in PostgreSQL in UTC. Restarts do not reset it. After downtime, run one overdue wave and skip missed slots; do not send a burst of catch-up waves. A transaction records the recipients, access grants, encrypted email outbox, audit events, and next date together. Retries send that selection; they never draw new recipients for the same wave.

**Pause weekly waves** stops new automatic grants. It does not cancel email already queued or block manual/referral invitations. **Resume** schedules the next wave seven days from resuming. Both controls require an audit reason.

## Manual invitations

1. Open **Admin → Waitlist → Waiting**.
2. Search by email if needed. Select the confirmed people to invite (up to 50 on one page).
3. Enter a reason and click **Send invitations to selected people**.
4. Read the queued/skipped totals. Already granted, joined, unconfirmed, or missing entries are skipped. View recipients under **Access history** and pending email below the queue.

Manual invitations are additional to the weekly ten. They do not change the next wave date or consume the administrator’s personal five slots. Repeated submissions do not issue another grant. All admission paths share a PostgreSQL transaction lock, including referrals and account creation, so concurrent manual/referral/wave requests cannot allocate duplicate access. Existing accounts/grants are reconciled before selection.

After skipping ineligible entries, the whole remaining selection must fit admission capacity. If it does not, nothing is queued; choose fewer people or ask an authorized operator to review the limits.

## Leaving and rejoining

People can use **Leave the waitlist or stop invitation emails** at `/waitlist/leave`, or the personal stop link in newly queued invitation emails. The public email form returns a generic receipt and sends an email confirmation link only for a waiting person or unused grant. The link is hashed, scoped to invitation preferences, expires after 90 days, and requires an explicit button press; opening it never withdraws someone.

Confirmation removes the person from Waiting, records **WITHDRAWN** in history, revokes all unused access invitations to that email, and cancels pending emails. Members cannot issue another invitation to a suppressed recipient. Already transmitted emails may still arrive, but revoked links cannot create an account. An existing account is unaffected. Member invitation slots are not refunded.

Rejoining requires a new waitlist request and email confirmation. Until confirmation, withdrawal stays in effect. Confirmation starts a new FIFO timestamp and clears only the recipient’s invitation opt-out; it cannot clear a hard-bounce or complaint suppression. Earlier stop/confirmation links cannot undo the new request. This permission covers access invitations, not general marketing.

## Delivery and recovery

Member invitations are now queued atomically when a member presses Send in the System Mix; the browser displays **queued** until the provider accepts them. Double-clicks reuse the same grant and frozen message, even if a name or sender configuration later changes.

The worker checks the waitlist each minute during normal operation and processes up to ten pending emails per maintenance pass. The existing scheduled worker entry point also includes the waitlist pass.

- **QUEUED / SENDING:** reserved access with a durable delivery record. Recipients stay out of Waiting while email is pending.
- **SENT:** the provider accepted the email; this does not prove inbox delivery. The provider ID is stored for investigation. Signup changes the entry to **JOINED**.
- **REVIEW:** eight unsuccessful attempts, or the safe retry window expired. Errors shown to operators exclude raw provider responses and secret URLs.
- **CANCELED:** the invitation was used or revoked before a pending attempt.

Budget exhaustion defers queued invitations until capacity is available. Waiting for the first send does not consume a retry or start the 23-hour deadline; already-attempted messages retain their original deadline. Automatic retries reuse the exact stored sender, reply address, content, URL, and idempotency key. [Resend retains idempotency keys for 24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys); retries stop after 23 hours from the first attempt. Within that window, **Retry same invitation** is available for a review item. After that window, inspect the provider record before any further send. Automatic resend/replacement outside the window is deliberately unavailable; operator-assisted resolution is still required. Do not put uncertain sends back in Waiting or clear delivery records to force a new wave.

**Admin → Invitations** lists both member and waitlist grants. `access.read` allows viewing recipient and delivery metadata; `access.revoke` allows revocation; `jobs.retry` allows a safe retry. Each change requires a reason and writes a platform audit event. Revocation does not automatically return a recipient to Waiting. Older member grants without an outbox are shown as legacy delivery records and cannot be blindly resent.

**Admin → Waitlist** shows only platform outbox problems. Its retry permission cannot be used to retry member invitations.

No token or encrypted email payload is selected into the admin page. Waitlist history includes source and sent/accepted status. Platform audit records capture manual selection, schedule changes, and retries, independently of customer workspaces.

## Boundaries and validation

Every page/action requires an active staff membership and administrator MFA. `waitlist.read` controls the queue, `waitlist.manage` controls manual invitations and retries, and `waves.pause` controls the schedule; individual denies override role defaults. Support views cannot perform mutations. See [Staff access](STAFF_ACCESS.md). Recipient withdrawal and confirmed rejoining are implemented. Signed provider events, permanent-bounce/complaint suppression, rolling email budgets with an account-recovery reserve, and Admin Email diagnostics are implemented locally. Provider suppression records use **SUPPRESSED** history, distinct from recipient **WITHDRAWN** entries. Automated retention, global admission ceilings, suppression clearance, and expanded reporting remain part of the broader infrastructure plan. See [Email operations](EMAIL_OPERATIONS.md). Member System Mix invitations now use the same frozen, encrypted outbox and worker as platform invitations.

The migration has been applied to a fresh disposable PostgreSQL 16 database. Automated checks cover normalization and confirmation, FIFO/random selection, small pools, concurrent workers, restart/downtime behavior, manual/referral races, quota preservation, single-use signup/rollback, delivery leases/retries, public/admin authorization, and browser selection/confirmation flows. Public pages were checked at 320–1440px in light/dark themes. No production migration or real invitation email has been sent as part of this implementation.

Previous staff/invitation checkpoint: 486 unit/integration tests passed with all optional database suites enabled; the production build and static checks passed; all 28 migrations passed populated/fresh rehearsals. Twenty focused Chromium cases passed against the packaged standalone server, including admin selection and permission revocation, recipient withdrawal/rejoining, safe retries, and light/dark mobile accessibility. CI is configured to rerun the new fixture suites; its remote run and real email/provider qualification remain pending.

Current email-controls checkpoint: 500 tests across 93 files, production build/typecheck/static checks, all 30 migrations across the populated/fresh and specialist rehearsals, and 21 focused Chromium cases on the standalone package passed. This adds signed provider events, suppression, sending budgets/reserves and email diagnostics. See [the completion ledger](PRODUCT_COMPLETION.md) for the browser retry observation and remaining full-product work. Production activation and real inbox delivery remain unqualified.

Uncertain sends can now be handled in **Admin → Email recovery**: recover the existing ledger receipt, verify a provider record against the frozen invitation, or review a recipient-requested repeat after at least 24 hours. The repeat keeps the same access URL and grant, preserves prior delivery generations and email budget usage, and requires a current password, recent MFA and explicit investigation/recipient/duplicate-risk confirmations. It does not add someone back to Waiting or allocate another invite slot. See [Email operations](EMAIL_OPERATIONS.md) for permissions, migration and provider-key setup.
