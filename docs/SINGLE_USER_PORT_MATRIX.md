# Single-user consolidation port matrix

This matrix governs selective porting from the validated stacked branches onto `main`. No pull request is accepted wholesale. Exact commits and files are recorded as the unique diffs are reviewed.

## PR #25 — release blockers and commercial truth

- **KEEP:** scoped Server Actions; obsolete-action removal; CSV formula-injection protection; deterministic installs; non-root production image; production configuration and request-origin protections; sanitized health responses; Docker/CI hardening; Important Date deactivation.
- **MODIFY FOR SINGLE USER:** retain security and operational behavior without plan lookup or paid capability checks.
- **EXCLUDE:** plan/pricing catalogs, Free/Plus/Pro limits, public pricing synchronization, billing navigation, and upgrade/downgrade behavior.
- **DEFER:** commercial packaging decisions.

## PR #28 — durable worker reconciliation

- **KEEP:** worker leases and renewal; task recognition; unknown-task failure; retry classification; independent maintenance scheduling; reconciliation fencing; completed-Jump immutability; logical-date and scheduling-horizon correctness; duplicate-safe Jump creation; reduced reconciliation writes.
- **MODIFY FOR SINGLE USER:** user-facing workspace language becomes personal-data language; internal workspace scoping remains.
- **EXCLUDE:** none identified in the approved worker core.
- **DEFER:** multi-tenant worker administration.

## PR #29 — provider integrity hardening

- **KEEP:** none by default; any provider-independent utility requires an explicit separate review.
- **MODIFY FOR SINGLE USER:** none planned.
- **EXCLUDE:** Stripe, subscriptions, billing events, Checkout, payment recovery, webhook ordering, Google OAuth qualification, provider-token hardening, and provider credentials.
- **DEFER:** all external-provider work on the preserved PR branch.

## PR #30 — database integrity constraints

- **KEEP:** primary Contact field integrity; Mix assignment and ordering integrity; date and worker-lock consistency; safer atomic Mix saves; explicit audiences; duration correction; normalization; address cleanup; email-length validation.
- **MODIFY FOR SINGLE USER:** remove tier-limit and paid-plan checks while retaining integrity rules.
- **EXCLUDE:** subscription-derived capability constraints.
- **DEFER:** destructive removal of dormant commercial schema fields.

## PR #31 — Today and Contact memory

- **KEEP:** return-from-composer; in-place completion; structured outcomes; immediate Undo; completion notes; next follow-up; append-only Contact activities; dated Customer Notes and Private Relationship Updates; relationship timeline; privacy-safe metadata; channel validation; going-quiet accuracy.
- **MODIFY FOR SINGLE USER:** keep all activity scoped to the signed-in user's personal data container.
- **EXCLUDE:** none identified in the approved core workflow.
- **DEFER:** shared timeline collaboration.

## PR #32 — Contact search and import jobs

- **KEEP:** bounded live search; pagination and announcements; PostgreSQL search indexes; durable, resumable worker imports; progress; failed-row retry; imported-Contact view; simplified import stages.
- **MODIFY FOR SINGLE USER:** remove plan/owner assumptions and make import state personal.
- **EXCLUDE:** paid import access and team ownership.
- **DEFER:** shared import administration.

## PR #33 — Mix and template convergence

- **KEEP:** inline action authoring; optional reusable templates; pointer and keyboard ordering; activation-impact review; explicit audiences; timezone picker; negative date offsets; focused template setup and direct Mix navigation; template pagination/version awareness.
- **MODIFY FOR SINGLE USER:** manual authoring is the complete default path with no provider configuration.
- **EXCLUDE:** external AI generation, provider configuration/API keys, and AI paid-tier restrictions.
- **DEFER:** the preserved AI implementation and any future local-only AI design.

## PR #34 — account, team, and privacy

- **KEEP:** personal display name, timezone, scheduling defaults, quiet hours, weekend scheduling, simple personal notifications, data export, retention cleanup, and password/security email reliability.
- **MODIFY FOR SINGLE USER:** settings operate on the user's one personal data container.
- **EXCLUDE:** workspace switching, invitations, teams, roles, ownership transfer, organization settings, shared workspace structures, commercial settings, campaigns, and nonessential provider notification infrastructure.
- **DEFER:** collaboration and organization administration on the preserved branch.

## PR #35 — Contact lifecycle management

- **KEEP:** archive/restore; duplicate review and audited merge; inline primary fields/company/Customer Notes; priority, preferred channel, relationship status, next commitment, and do-not-contact; optimistic versions; saved personal views; cross-device card layout and accessible ordering.
- **MODIFY FOR SINGLE USER:** saved views and personalization are owned by the signed-in individual only.
- **EXCLUDE:** Contact owner, teammate assignee, member filters, team permissions, and workspace-member ownership.
- **DEFER:** collaborative Contact assignment.

