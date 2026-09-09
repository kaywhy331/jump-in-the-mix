# Account access and session operations

Implemented locally September 8, 2026. Production deployment remains pending.

## Operator steps

1. Open **Admin → Users**. Search by name, email, or workspace; filter active/suspended accounts as needed. Results have stable pagination and show account access, verification, staff role, and active-session count.
2. Open **Manage account access…** for a customer account. Choose **Suspend account**, **Restore account access**, or **End all sessions** according to your permissions.
3. Enter a case reference/reason and your own administrator password. Administrator MFA must have been verified within the last ten minutes when MFA is enabled. Save the change and read its receipt.
4. Review the platform audit record. After restoration, the member signs in again and reviews **Settings → Sending** and **Settings → Notifications** before enabling any automatic delivery or reminders.

`users.read` controls account metadata; `users.suspend` controls suspension/restoration; `sessions.revoke` controls ending sessions. Both actions require the read permission. Individual denies override defaults. Saved changes recheck the current staff membership, session, MFA proof and password in the database transaction. Conflicting or repeated form submissions reject stale access revisions. Reasons contain 10–500 characters and should not contain credentials or private customer messages.

## Effects

| Operation | Result |
| --- | --- |
| Suspend | Mark the account suspended; end its sessions, prior email sign-in links, and support views; turn off automatic sending and reminders; revoke unused personal referrals and cancel their pending email |
| Restore | Clear suspension, end any stale sessions/sign-in links, and require a new sign-in; sending/reminders remain off; previously revoked referrals remain revoked |
| End all sessions | End current browser sessions and prior email sign-in links while leaving account access available; the member may authenticate again |

Suspension preserves account content and the historical audit trail. Members who already accepted a referral keep their independent accounts. Revoking an unused referral does not refund a lifetime invitation slot or put the recipient automatically back in Waiting. Use invitation/waitlist history to investigate that grant separately.

Messages already handed to an email/SMS/push provider may still arrive. Workers recheck account access or current subscription/preference eligibility before new delivery; suspension turns preferences off and cancels unused invitation grants. Internal records created by a request already in progress can finish; suspension is enforced on subsequent authenticated requests and when creating sessions/referrals. It is not a recall mechanism for completed provider handoffs.

Password recovery remains available to someone proving ownership of their email, but changing the password does not lift suspension. Password and email-link sign-in cannot open a suspended account; the central session creation boundary also covers OAuth sign-in. A stale database session is rejected when resolving the account.

These customer controls cannot change the current administrator or a staff account. Own-session controls live under Account. Staff access is managed through **Admin → Team**, preserving the existing Owner and last-Owner protections. A suspended customer must have account access restored before receiving staff permissions; concurrent suspension/promotion cannot bypass this restriction.

## Deployment and verification

Apply `20260909000000_account_access_controls` with the release migrations, regenerate Prisma, and deploy matching application/worker builds. Older application versions do not enforce suspension and must not run alongside this schema after the controls are activated. Qualify a compatible rollback build before production use.

`tests/user-admin.integration.test.ts` checks atomic cancellation, independent referred accounts, restoration, password/MFA/permission denial, live session checks, stale changes, staff protection, session/referral/promotion races, recovery without restoration, and worker exclusion with real PostgreSQL. Provider email calls are mocked.

`e2e/user-administration.spec.ts` exercises the compiled application with isolated staff/customer fixtures: suspension/restoration, customer-session loss, permission changes from an open form, session revocation, and 320/1440px light/dark accessibility. The fixture-only browser process disables MFA; the request/service integration tests enforce it separately.

Staff invitation onboarding, case-scoped support access, broader reporting and full production qualification remain separate requirements in [the completion ledger](PRODUCT_COMPLETION.md).

Local qualification: the full suite passed 510 tests/94 files; all nine focused account tests passed after the final concurrent-deletion guard. The current production build, static checks, all 31 migrations across populated/fresh and specialist rehearsals, and all 23 selected standalone Chromium cases passed. The new browser cases include suspension/restoration and live permission/session checks; broader production/device qualification remains pending.
