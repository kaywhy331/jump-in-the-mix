# Referral Rewards

Jump in the Mix referral rewards are workspace-scoped, auditable Plus entitlements that remain separate from Stripe subscription truth.

## Reward policy

A qualified referral provides:

```text
Referred friend: 30 days of Plus
Referring workspace: 30 days of Plus
Referrer maximum: 360 earned days
```

A referral is attributed when the friend creates a new workspace through the invitation. It becomes qualified immediately when mandatory email verification is disabled, or only after the friend completes email verification when verification is required.

One referred workspace may be attributed once. Each qualified referral has exactly two reward records:

```text
REFERRER
REFERRED
```

The referrer reward cap is enforced from durable reward history rather than a browser-visible counter.

## User flow

Every normal workspace receives a unique code such as:

```text
AB12CD34EF
```

The public invitation route is:

```text
https://YOUR_HOST/r/AB12CD34EF
```

Following the route stores the normalized code in a 30-day, HTTP-only, SameSite=Lax cookie and redirects to registration. The registration form also carries the code as a hidden value after the server validates it.

The browser never submits a trusted referrer workspace ID. The server resolves the code to the owning workspace.

Users can share from:

- The desktop application shell.
- The mobile header.
- My Account → Invite friends to Jump in the Mix.

The share control uses the device Web Share API where available and falls back to copying a friendly invitation message.

## My Account

My Account shows:

- The unique invitation code and URL.
- Qualified and pending invitations.
- Plus days earned.
- Active referral days.
- Banked days.
- Progress toward the 360-day cap.
- Referral Plus expiration.
- The recent invitation and reward history.
- Whether the workspace originally joined through another user's invitation.

During a view-only administrator support session, the user-facing share action and invitation code remain hidden. Existing history may be inspected without creating a new referral account or modifying state.

## Stripe and plan precedence

Stripe remains the source of truth for a paid Plus or Pro subscription.

Referral state follows these rules:

```text
Free workspace + qualified reward
→ Plus activates immediately

Referral Plus + another reward
→ expiration extends

Paid Plus or Pro + new reward
→ reward is banked

Referral Plus upgrades to paid Plus or Pro
→ unused referral time is banked

Paid access ends
→ banked referral time activates automatically

Referral time ends with no remaining banked days
→ workspace returns to Free and downgrade safeguards run
```

Past-due Stripe subscriptions retain paid access according to the billing policy, so referral days do not start while Stripe is still in its recovery window.

Referral expiration uses the same downgrade safeguards as an ordinary paid-plan downgrade:

- Excess active Mixes pause.
- Their future incomplete Jumps cancel.
- Excess custom Jump Date Types become inactive.
- Excess Community contributions become unpublished.
- Contacts, Groups, completed Jumps, and user-authored data remain stored.

## Background reconciliation

The worker checks referral entitlement state periodically.

It:

- Marks expired active reward records as consumed.
- Activates banked days when paid access has ended.
- Removes expired referral Plus access.
- Applies Free-plan safeguards when needed.

Authenticated requests also reconcile a non-Stripe Plus workspace so an expired referral entitlement cannot remain active merely because the worker was temporarily unavailable.

Stripe webhook processing reconciles referral state immediately after the Stripe subscription state is persisted.

## Data model

The migration is:

```text
20260717010000_referral_rewards
```

It adds:

```text
ReferralAccount
Referral
ReferralReward
```

`ReferralAccount` stores one workspace code, the active referral Plus expiration, and banked days.

`Referral` stores the code used, referrer workspace, referred workspace, attribution state, and qualification time.

`ReferralReward` stores the recipient, earned days, lifecycle status, activation window, and consumption time.

Reward lifecycle states are:

```text
PENDING
ACTIVE
BANKED
CONSUMED
CAPPED
REVOKED
```

The database prevents:

- More than one attribution for one referred workspace.
- More than one referrer reward for one referral.
- More than one friend reward for one referral.
- Duplicate invitation codes.

## Administration

Platform administrators use:

```text
/admin/referrals
```

The dashboard provides:

- Qualified referral count.
- Awaiting-qualification count.
- Active referral Plus count.
- Total banked days.
- Search by invitation code, workspace, owner name, or email.
- Status filtering.
- Referrer and referred workspace context.
- Reward status and expiration.
- Referrer banked and active balance.
- Visibility into cap enforcement.

Referral attribution, qualification, friend rewards, referrer rewards, and expiration are written to workspace audit logs.

## Security and abuse boundaries

- Invitation codes are random and normalized before lookup.
- Raw workspace IDs are not accepted from public signup forms.
- A workspace cannot refer itself.
- Existing email-account collisions follow the normal registration boundary.
- Email verification can be required before rewards qualify.
- Referral sharing is unavailable during view-only support access.
- Stripe payment state cannot be overridden by referral metadata.
- The 360-day cap is calculated server-side from reward records.
- Registration and verification retain the existing persistent rate limits.

The current policy does not attempt device fingerprinting or household detection. Operational review should monitor unusual referral velocity before adding stronger fraud controls that could block legitimate customers.

## Deployment

No new environment variables are required.

For an existing populated database:

```bash
npm run db:deploy
```

Confirm that `20260717010000_referral_rewards` completes after the core, Mix Template, and support-center migrations.

The production worker must be running so expired and banked entitlements reconcile promptly.

## Staging smoke test

1. Open an ordinary user's My Account and copy the invitation.
2. Follow the `/r/<code>` link in a separate browser profile.
3. Confirm the registration page identifies the inviter without exposing a workspace ID.
4. Register a new account.
5. When verification is required, confirm no reward activates before email verification.
6. Complete email verification and confirm both workspaces become Plus.
7. Confirm each workspace has one 30-day reward and the referrer history shows the friend.
8. Repeat with the referrer on an active Pro subscription and confirm the new reward is Banked.
9. End the paid subscription in Stripe test mode and confirm banked referral time becomes Active.
10. Set a referral expiration into the past in staging, run reconciliation, and confirm Free-plan safeguards preserve data while reducing active entitlements.
11. Attempt to reuse the same referred workspace and confirm a second attribution is rejected.
12. Open Admin · Referrals and verify counts, search, status, and reward details.
13. Start a view-only support session and confirm the invitation code and share control are not exposed or created.
14. Deliver repeated Stripe webhook events and confirm referral time is not duplicated.
