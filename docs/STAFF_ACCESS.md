# Staff access and owner setup

Implemented locally September 8, 2026. Production rollout is still pending.

## First owner

1. Back up the database and apply `npm run db:deploy`, including `20260908160000_staff_permissions`. Generate the client and deploy matching web/worker versions. Keep administrator MFA enabled in production.
2. From the operator environment run `npm run admin:bootstrap -- --email you@example.com` against the intended database. This command sends no email. It prepares a staff-only operator account if needed; it does not create a customer workspace or personal-referral access.
3. Use email-link sign-in to confirm the address if needed. Use password recovery to set an account password, then open `/account/admin-mfa` and enroll an authenticator. Save the recovery codes securely.
4. Repeat the bootstrap command. It only assigns Owner after email verification and MFA enrollment, and only while no active Owner exists. Sign in again and verify MFA.
5. Open **Admin → Team**. Review the effective permissions of every existing staff account before activating the release.

Existing `isPlatformAdmin` flags migrate to limited **Operator** memberships, not Owners. The boolean remains for compatibility with older display/fixture code; it no longer grants administration rights. No inferred mass promotion occurs. Once an active Owner exists, bootstrap refuses further changes; owners use the authenticated Team controls.

Deploy the matching application version with these migrations. An older build that treats `isPlatformAdmin` as authority cannot enforce individual permissions. Do not run that build alongside this release or use it as a rollback while staff memberships are active; qualify a compatible rollback build before production activation.

## Roles and individual permissions

| Role | Defaults |
| --- | --- |
| Owner | Administration and team management; customer-content support views still need a separate grant |
| Operator | Account metadata, operational diagnostics, job retries, audit and aggregate reports |
| Growth | Waitlist review/manual invitations, automatic-wave pause/resume, acquisition aggregates |
| Editor | Library editing; publication needs a separate grant |
| Support | Account metadata and support conversations; customer-content views need a separate grant |
| Analyst | Aggregate dashboard/report access |

The exact enforced list lives in `src/lib/admin-permissions.ts`. Some reserved permissions anticipate operations still being built; a permission does not mean the associated new feature is already complete. Owners can grant or deny listed permissions per person. Denial wins. Only Owners can manage staff, even if another role submits a forged grant field.

For an existing verified account, use **Add staff access**. For a new person, use **Invite a new staff account** on the same Team page. To promote another Owner, first grant a staff role, have that person enroll MFA, then promote them. The operator bootstrap is solely for the first Owner.

## Invite a new teammate

1. Apply `20260909010000_staff_invitations` and deploy matching web/worker builds. Configure the same sender, encryption key, signed provider webhook and scheduled worker used for waitlist invitations.
2. In **Admin → Team**, enter the teammate’s email, initial role, optional permission overrides, reason and your Owner password. Your MFA verification must be under ten minutes old in production.
3. The worker emails a recipient-bound, single-use setup link valid for seven days. The administrator sees delivery history, never the secret URL. Repeating the same request keeps the original email and link. Revoke the old invitation before changing offered access.
4. The recipient enters the invited email, name and a new password, then enrolls an authenticator and saves recovery codes. Until MFA is verified, protected admin routes remain unavailable. This creates a staff-only account without a customer workspace or personal invitations.
5. Use the invitation history to revoke unused access or retry a review item within the original 23-hour safe email window. Retries reuse the frozen email and provider key. After that window, inspect the provider record before revoking and replacing the invitation. Provider acceptance does not prove inbox delivery.

An invitation cannot overwrite an existing account, replace its password, or attach privileges to it. If its recipient creates a customer account before accepting, use **Add staff access** for the existing verified account. Initial Owner invitations are prohibited; Owner promotion is a separate MFA-protected Team operation.

Changing the issuing Owner’s staff access revokes their unused invitations. Acceptance also checks the Owner’s current status and permission revision. Recipient opt-out and permanent provider suppression revoke unused invitations and cancel queued email. Acceptance removes the same email from the waiting list and cancels outstanding customer admission links. Account deletion removes recipient invitation/outbox data and revokes unused invitations issued by that account.

`StaffInvitation` stores only a hash of the secret; the frozen email is encrypted in the existing `WaitlistDelivery` outbox. Each outbox item belongs to exactly one customer access grant or staff invitation, enforced by a database constraint. The existing rolling email budgets, account-email reserve, delivery leases and idempotency limits cover both. Staff issue/revoke/retry/accept events are recorded in the platform audit without secret links or password data. Waitlist and customer-grant permissions cannot manage staff invitations.

Every staff change requires a reason and the acting Owner’s password. When administrator MFA is enabled, the current session’s MFA verification must be under ten minutes old. Changes reject stale revisions, end the affected person’s sessions and support views, and write a platform audit event. Changing your own access signs you out. Last-Owner demotion, disablement and account deletion are blocked, including competing demotions.

Staff routes live outside the customer workspace layout. Staff without customer membership can open `/admin` and enroll MFA; password and email-link sign-in route them there. A staff account does not receive a fabricated customer workspace. If a revoked support session leaves a browser cookie, the public layout offers a clear-support-view action so signing in is not blocked.

## Enforcement and audit

All admin data pages, Server Actions and the support-view API name their required permission. Layouts protect identity/MFA and render only permitted navigation; they are not the sole permission check. Permissions are read from PostgreSQL on each request. Permission changes and disabling staff therefore apply immediately on the next request, including existing support-view tokens.

Mix publication and edits to already-published content require publication permission. The service rechecks that permission inside the serialized save transaction so a concurrent publish cannot bypass it. Customer mixes remain scoped to their owners.

Platform audit events survive customer/workspace deletion. Team changes, permission denials, MFA events, settings changes, job retries and curated-mix edits have platform records. The audit page redacts secret/content keys and URLs from structured JSON. Broader audit field minimization, retention enforcement and case-scoped support grants remain part of the launch review.

## Invitation operations

`/admin/access` shows grant source, recipient, delivery status, attempts and provider record ID without secret URLs or encrypted messages. `access.read` permits viewing, `access.revoke` permits cancellation, and `jobs.retry` permits a review-item retry only inside the original 23-hour window. Actions require a reason, recheck the staff membership and live session in the transaction, and write platform audit events. The Waitlist page’s retry action is restricted to platform invitations.

## Email diagnostics

`/admin/email` requires `operations.read`. It shows rolling email use and the essential-account reserve, sender/webhook configuration state, suppression totals, and recent verified provider events without message content. `/admin/access` adds delivery/bounce/complaint facts under its existing recipient-data permission. See [Email operations](EMAIL_OPERATIONS.md) for limits, signed webhook setup, and recovery boundaries.

## Validation and remaining launch work

PostgreSQL tests cover role defaults/overrides, legacy-flag denial, password/MFA request boundaries, session revocation, stale edits, owner bootstrap, last-Owner concurrency/self-deletion, and immediate invalidation of support access. Browser checks cover staff without customer workspaces, forbidden direct routes, role-filtered navigation, saving a per-person denial, and mobile/theme accessibility.

Customer suspension/restoration and session revocation are implemented; see [Account administration](USER_ADMINISTRATION.md). Delivery resolution outside the provider retry window, scoped case grants, reports, immutable mix revisions, global admission controls, and production qualification remain required in the [completion ledger](PRODUCT_COMPLETION.md).

Staff invitation delivery recovery is also available through **Admin → Email recovery** with both `email.manage` and `staff.manage`. Provider verification makes no sending request. An explicitly reviewed repeat preserves the original offer, access URL and expiration and still requires a valid issuer revision; it cannot revive an expired, revoked or accepted offer. See [Email operations](EMAIL_OPERATIONS.md) for the password/MFA, cooldown and evidence requirements.
