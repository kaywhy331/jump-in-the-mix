# Administration and Observability Control Plane

The administrator control plane provides one protected operational surface for customer support, billing, integrations, Community content, background processing, audit history, and reviewed product defaults.

All routes in this document require a current platform administrator. Customer view-only support sessions may inspect customer-facing pages, but the central mutation boundary blocks them from changing administrator or customer data.

## Navigation

The shared administrator navigation links to:

- **Overview** — high-level product, support, engagement, and operational indicators.
- **Users** — account search and audited, time-limited, view-only support sessions.
- **Billing** — Stripe subscription and webhook diagnostics.
- **Support** — private ticket triage and threaded responses.
- **Mix Templates** — platform authoring and Community moderation.
- **Integrations** — sanitized Google/provider connection diagnostics.
- **Referrals** — attribution and reward analytics.
- **Operations** — background jobs, synchronization runs, provider errors, and webhook state.
- **Audit** — searchable user, administrator, AI, system, and webhook events.
- **System Settings** — allowlisted dropdown options and reviewed feature flags.

The desktop and mobile account header now route administrators to `/admin`, which is the control-plane overview rather than only the User directory.

## Operational overview

The overview shows:

- User and workspace totals.
- New users in the previous seven days.
- Free, Plus, and Pro distribution.
- Active Contacts and Mixes.
- Incomplete Jumps.
- Jumps completed in the previous seven days.
- Support conversations waiting on Jump in the Mix.
- Community Mix Templates awaiting moderation.
- Failed background jobs, webhooks, and integration connections.
- Recent audited activity.

Metrics are operational indicators, not financial accounting. Stripe remains the source of truth for collected revenue and invoice details.

## Background jobs and provider operations

`/admin/operations` provides filters for Pending, Running, Completed, Failed, or all jobs.

A failed job may be retried only when it has a recorded failure state. Retrying:

1. Requires a platform administrator.
2. Resets the failed job's lease, error, attempt count, and execution time.
3. Does not create a second job.
4. Writes an administrator audit record when the job belongs to a workspace.
5. Leaves completed and actively running jobs unchanged.

The page also shows:

- Recent Google/provider SyncRuns and their created, updated, skipped, and failed counts.
- Integration connections reporting a sanitized error.
- Recent webhook identifiers, provider, workspace resolution, processing status, and bounded failure message.

Provider access tokens, refresh tokens, encrypted credential payloads, API keys, webhook secrets, and payment-card information are never rendered.

## Audit explorer

`/admin/audit` is a read-only search surface for `AuditLog` records.

Administrators may filter by:

- Free-text action, workspace, actor, entity, or source.
- Actor type: User, Administrator, System, AI, or Webhook.
- Event source.

Structured before, after, and metadata values are collapsed by default. The audit view does not provide edit or deletion controls.

## No-code system settings

`/admin/settings` stores reviewed overrides in `PlatformSetting`.

Current allowlisted settings cover:

- Mix categories.
- Industries.
- AI Mix Wizard objectives.
- AI tones.
- AI strategic frameworks.
- Human-readable AI refinement guidance.
- Community Mix Template availability.
- Provider-backed AI draft generation.

### Safety rules

- Unknown setting keys are rejected.
- Empty option lists are rejected.
- Duplicate options are removed case-insensitively.
- Lists are capped at 100 values.
- AI tones, Mix categories, and Industries use reviewed canonical values and may be reordered or hidden.
- Objectives and strategic-framework labels may be added, removed, or reordered.
- Reset removes the override and restores the reviewed application default.
- Every saved or reset setting is audited when the administrator has an owning workspace context.

Managed options are consumed by new and existing Mix editors, the AI Mix Wizard, Community submission, and the Mix Template library. Server actions validate the submitted value again; modifying browser HTML does not bypass the allowlist.

### Feature flags

Disabling Community Mix Templates:

- Removes Community discovery.
- Blocks Community voting and Community imports.
- Blocks new or updated Community submissions.
- Preserves existing templates, imports, votes, moderation records, and independent user copies.
- Continues to allow a contributor to unshare an existing submission.
- Leaves platform Mix Templates available.

Disabling provider-backed AI draft generation:

- Prevents a new generation request from calling the external AI provider.
- Uses the deterministic built-in strategist instead.
- Leaves existing review drafts untouched.
- Does not disable manual Mix creation or Mix Template import.

## Migration

The control plane uses:

```text
20260717050000_admin_control_plane
```

This migration creates `PlatformSetting` and its unique and lookup indexes.

The main migration rehearsal continues to exercise both a populated MVP upgrade and a clean installation. A second independent rehearsal deploys every committed migration into a clean isolated schema, verifies the new migration record and table, writes a durable JSON setting, reads it back, and removes the rehearsal schema.

## Production qualification

Before operational launch:

- Require administrator MFA.
- Restore a real encrypted backup in production-like staging.
- Verify application and worker behavior after restoration.
- Complete browser-driven administrator authorization and view-only mutation tests.
- Configure alerts for failed jobs, failed webhooks, integration errors, and support-email failure.
- Define operator response ownership and escalation targets.
- Validate that audit and error retention complies with the published privacy policy.
- Confirm database backups and provider logs do not expose unredacted customer secrets.

The control plane improves visibility and recovery, but it is not a substitute for provider dashboards, database monitoring, backup alerts, or an incident-response process.
