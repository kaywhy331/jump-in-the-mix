# Admission controls

Implemented locally. No production setting, real invitation, or paid service was activated.

## Operator setup

1. Apply all migrations, including `20260909020000_admission_controls`, and deploy matching web and worker builds.
2. Sign in to a named administrator account with `settings.manage`. Owners have this permission by default; other roles require an explicit grant. Production MFA must remain enabled.
3. Open **Admin → Admission**. Choose a total account-and-reservation limit and a separate outstanding-invitation limit. Both start at **0**, so a new or upgraded installation cannot issue new customer invitations until configured. Set limits from your budget and measured performance; these controls do not establish a safe hosting capacity.
4. Enter an audit reason and your current administrator password. Authenticator verification must be less than ten minutes old. Save, then check **Admin → Waitlist** for the eligible count, available reservations, wave date, and worker health.
5. Rehearse confirmation, manual selection, referral, and signup against a controlled test inbox before authorizing a live wave. Review performance, provider allowances, and support demand before raising limits.

Changing limits adds no service or subscription. The existing PostgreSQL database and worker enforce them.

## What counts

Total committed capacity is customer accounts plus active unused customer invitations. Suspended and unverified customers count; restoring or verifying them does not create a new seat. Staff-only accounts do not count, but staff with a customer workspace do. Non-staff accounts without a workspace count conservatively.

Every active unused grant counts, including queued, sent, legacy, and uncertain deliveries. Email delivery status does not release a reservation. Acceptance converts the reservation into a customer account in the same transaction. Revocation releases it without refunding the sender's lifetime allowance. Existing customer invitations have no expiry in the current product; do not assume an old link releases capacity automatically. Legacy duplicate grants each count conservatively until explicitly resolved.

New grants must fit both limits. The limit on outstanding invitations cannot exceed the total limit. Lowering either below current usage stops new issuance; existing accounts and issued links remain valid. Issuing staff-only access is governed by Team permissions and its own expiry, not these customer limits.

## Batches and races

Every allocation and customer signup uses the same PostgreSQL transaction lock as admission changes. Competing referrals, waves, and manual requests cannot each take the last available reservation. Denied referral attempts do not spend a personal invitation. Repeating an existing grant does not reserve another seat or queue another email.

A due wave needs room for its entire eligible batch, up to ten. It retains the due date while capacity is unavailable. When room is available, it selects up to five oldest confirmed requests and then five random remaining requests; the selection and all writes commit together. If fewer than ten are eligible, the smaller eligible batch must fit. After downtime or a capacity delay, one wave runs and missed cadence slots are skipped. There is no burst of catch-up waves.

Manual invitations are additional to the weekly ten and use the same capacity. Unconfirmed, missing, or already-granted entries are skipped; the remaining eligible selection must fit as a whole. If it does not fit, nothing from that selection is queued. Choose fewer people or have an authorized operator adjust capacity. Manual selection never changes the weekly schedule or consumes a staff member's five personal invitations.

## Pause controls

| Control | Effect | Existing commitments |
| --- | --- | --- |
| Pause new waitlist requests | Rejects new requests and rejoin requests with a clear retry message | Existing confirmations and recipient withdrawal continue |
| Pause all new customer invitations | Stops new wave, manual, and member grants | Queued emails and issued links continue |
| Pause new member referrals | Stops new System Mix grants | Platform waves/manual grants and existing referrals continue |
| Pause weekly waves, on the Waitlist page | Stops automatic waves only | Manual/referral issuance continues within limits; resume schedules seven days ahead |
| Emergency pause account creation | Stops customer invitation redemption | Link remains unused for later retry; existing sign-in and staff onboarding continue |

The emergency signup pause does not automatically pause issuance or sending. If an incident requires both, select both controls. To invalidate a specific existing invitation, use **Admin → Invitations → Revoke**. An email already in transit may arrive with a revoked link.

## Authorization and evidence

Admission changes recheck the actor's current permission, verified/active account, session expiry, password, and recent MFA inside ordered staff/access transaction locks. A revision prevents an older form from overwriting a newer configuration. The platform audit records the reason and before/after values, excluding passwords and tokens. Configuration is a private singleton, not a public mix-library setting.

`tests/admission.integration.test.ts` covers default closure, independent limits and pauses, concurrent reservations, whole batches, cadence after delays, reservation conversion, revocation, suspended/staff counting, current credentials, stale revisions, audit data, and database constraints. `e2e/admission-controls.spec.ts` uses isolated local fixtures with required MFA and no email worker; it checks administrator forms, manual-limit errors, emergency recipient pages, stale/denied saves, and accessibility at phone/desktop widths in both themes. Test fixtures explicitly configure capacity and restore the original policy afterward.

Real-provider and production-load qualification remain separate requirements. See the [completion ledger](PRODUCT_COMPLETION.md).
