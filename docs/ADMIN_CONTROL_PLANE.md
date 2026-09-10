# Administration and operations

**Current implementation reference.** Waitlist waves, individual staff permissions, staff invitation onboarding, versioned library/System Mix releases, live aggregate reports, saved daily reports and background exports are implemented locally. Remaining operations work is tracked in [Waitlist, referrals, and live administration](ADMIN_OPERATIONS_INFRASTRUCTURE_PLAN.md). See [Staff access](STAFF_ACCESS.md) for the role matrix and first-Owner setup.

Each admin route requires an active staff membership, its specific permission, and, in production, an MFA step-up for the current application session. Staff accounts do not need a customer workspace. Individual denies override role defaults; role changes revoke the affected account’s sessions.

## Navigation

The desktop sidebar groups destinations into Workspace, People, Content, Operations, and Settings. On phones, **Menu** opens the same permission-filtered links; the current section stays visible when the menu is closed. Nested routes highlight their most specific destination.

- **Overview** — three aggregate activity totals, a permission-filtered **Needs attention** queue, quick actions, and compact content/invitation links. Missing or stale independent monitoring remains visible as an attention item; a zero alert count alone never implies current health. Support links open the **Needs a reply** filter, covering new tickets and those waiting on support.
- **Reports** — bounded UTC cohorts, waitlist conversion/age, invitation sources and time to join, wave outcomes, activation, D7/D30 returns, library version use, daily trends and operational usage. Saved daily reports retain observation times and storage history; background CSV exports expire and require the requesting sign-in. Requires `reports.read`; see [Report definitions and limits](ADMIN_REPORTS.md).
- **Invitations** — member/platform grant history, revocation, and safe outbox retry with individual permissions.
- **Waitlist** — confirmed queue, seven-day waves, manual selection, schedule controls, and delivery recovery.
- **Team** — Owner-controlled staff roles, individual overrides, and access revocation.
- **Users** — account search/filter/pagination, suspension/restoration, session revocation, and time-limited view-only support sessions. Account changes require individual permissions, password reauthentication, recent MFA and an audit reason; see [Account administration](USER_ADMINISTRATION.md).
- **Support** — private customer conversations and replies.
- **Ready-made plans** — create drafts, review saved previews, publish, hide, and roll back immutable library versions. Drafting and publication have separate permissions. Existing customer copies remain independent; see [Library administration](LIBRARY_ADMINISTRATION.md).
- **System Mix** — draft, preview, publish and roll back the personal invitation subject/introduction. Future member previews change; queued invitation content and access links stay frozen. See [System Mix administration](SYSTEM_MIX_ADMINISTRATION.md).
- **Operations** — worker heartbeat, background jobs, failures, and safe retry.
- **Email** — sending allowances and account reserve, verified provider events, suppression totals, and delivery review; requires `operations.read`. See [Email operations](EMAIL_OPERATIONS.md).
- **Audit** — read-only security and product-event search.
- **System settings** — reviewed plan-library categories and industries.

Retired billing, provider-sync, community-submission, reward, and AI-draft surfaces are not hidden routes; they no longer compile into the application.

## MFA and support views

An administrator without MFA is redirected to enrollment. Enrollment requires the current password and a valid TOTP code and returns one-time recovery codes. A new application session requires a new MFA step-up.

A support view requires an active ticket assigned to the handler, `support.manage`, and the separate `support.view_customer` permission (no role receives it by default). The server derives the requester/workspace from that case and binds the time-limited, read-only view to the originating staff session. Each resolution rechecks staff/session/MFA and case/membership state. Reassignment or resolution ends access; reopening cannot revive a prior view. Private conversation and customer-page reads are audited without their content or search queries. The persistent banner identifies the case, reason and expiry. The centralized boundary rejects unsafe methods except ending the view, and personal account controls remain private. See [Support case operations and limitations](SUPPORT_CASE_ACCESS.md).

## Operations

Workers write a durable heartbeat every 15 seconds. `/api/health/worker` reports unhealthy after `WORKER_HEARTBEAT_STALE_SECONDS` without a current heartbeat. Customer jobs run before report jobs. Failed jobs may be retried only from the exact recorded terminal failure shown, while unlocked and incomplete. The transaction rechecks permission/session/MFA, locks the job, clears the old failure on that same record and audits the retry. A previous attempt's error cannot authorize stealing a running lease. Matching failed report records return to queued; stale failure forms are rejected.

Never render contact details, message bodies, provider credentials, access tokens, encryption material, MFA secrets, recovery codes, or raw session tokens in administrator diagnostics.

## Email recovery

The separate `email.manage` permission enables audited provider-suppression review and recovery of acceptance already recorded in the local send ledger. Clearance requires the current password, recent MFA, provider/recipient review references and the displayed state; it preserves recipient opt-out and never reactivates an old grant or delivery. Receipt recovery additionally requires the invitation-type permission, matches the frozen payload and performs no send. See [Email operations](EMAIL_OPERATIONS.md) for operator steps and remaining recovery limits.

## Release qualification

Before enabling the control plane on a public origin:

1. Set `AUTH_REQUIRE_ADMIN_MFA=true` and rehearse enrollment plus lost-device recovery.
2. Use named operator accounts rather than shared credentials.
3. Verify the support-view mutation boundary in the browser suite.
4. Alert on repeated MFA failures, unusual support access, stale workers, and failed jobs.
5. Confirm audit retention and support-data handling match the published privacy policy.

See [Admin MFA](ADMIN_MFA.md), [Browser E2E](BROWSER_E2E.md), and [Hosted deployment](HOSTED_DEPLOYMENT.md).

Invitation recovery now supports verified provider-record import and explicitly reviewed repeat delivery of the original invitation, with generation history and unchanged access quota. Customer repeats require `email.manage`, `access.read` and `jobs.retry`; staff repeats require `email.manage` and `staff.manage`. A current password, recent MFA, provider investigation, recipient request and duplicate-email acknowledgment are required. See [Email operations](EMAIL_OPERATIONS.md) for migration, provider-key scope, cooldown and eligibility details.

**Operations → Operational alerts** now shows persistent aggregate incidents, monitor freshness and bounded notification receipts. `operations.manage` allows a reasoned acknowledgment with current staff/session/MFA checks; it does not resolve the condition. Owner and Operator templates include it. See [Operational alerts](OPERATIONAL_ALERTS.md) for independent monitoring and backup evidence.
