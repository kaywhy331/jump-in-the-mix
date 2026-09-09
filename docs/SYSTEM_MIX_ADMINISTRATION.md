# System Mix invitation releases

System Mix is the introductory networking flow for members. The administrator workflow controls its email subject and introduction. It uses the existing database and invitation worker; it adds no paid service or AI dependency.

## Draft and review

Open **Admin → System Mix** with `mixes.edit`. A staff account does not need a customer workspace. Edit the plain-text subject and introduction, enter an audit reason, and save a new draft. Saving has no effect on the published wording.

Use `{{Sender Name}}` in both fields and `{{Contact Name}}` in the introduction. Other placeholders, HTML, explicit links and control characters are rejected. Review the saved preview using example names, long names, missing names and original placeholders. Names are inserted once, with line breaks removed from display names; HTML email output escapes the resulting text. Blank names have explicit fallbacks.

Jump supplies the unique account link, recipient-bound single-use notice and separate invitation-preference link. Editors cannot change access permissions, five lifetime invitations, sender configuration, waitlist waves, delivery budgets, or preference handling through copy fields. The preview creates no invitation and sends no email. Prefer factual, personal language; do not invent testimonials, urgency, usage results or promises about replies and delivery.

## Publish and roll back

Publication requires `mixes.edit` and `mixes.publish`, an active verified staff account and session, a current password, a reason, and recent MFA when required. Authorization and the control revision are rechecked in the transaction. A stale browser form cannot overwrite another editor or publisher.

Publish the exact saved version after review. Unsaved form changes are not released. Version history permits rollback only to a version that was previously published. A rollback appends a release event and switches future previews to the selected version; later drafts remain available. PostgreSQL rejects direct updates/deletion of revision and release records. The separate platform audit stores actor, reason, timestamp and version transition without invitation tokens or customer message data.

Staff with `access.read` can follow a version-history link to **Admin → Invitations**, filter by System Mix version and inspect the prepared grants. Legacy version attribution remains explicitly unknown. Existing revocation and bounded retry controls retain their separate permissions.

The impact panel counts active verified members with invitations remaining and referral emails currently queued/sending. The count is context for review, not a promise that every member will see or send an invitation. To stop new referrals, use **Admin → Admission** with `settings.manage`; hiding content is not a separate admission mechanism. Waitlist and staff onboarding emails remain separate workflows.

## Member review and frozen delivery

The member reviews the published subject and introduction for a selected saved contact/email. Submission supplies the displayed version and names. Allocation independently checks current ownership, contact/email, account state, preferences, admission capacity and the five-slot limit. It compares current wording and names with the preview before spending a slot. A changed preview produces an explicit request to review again.

Publication and invitation allocation share the System Mix lock. A concurrent release can either follow an allocation of the already-reviewed version or invalidate that member's old preview; it cannot silently substitute new wording. The existing access lock also preserves capacity and referral limits. Lock ordering is Staff → Access → System Mix where applicable; no path acquires these in reverse.

Each new referral stores `systemMixVersion`. Its complete subject, rendered introduction, recipient links, sender settings and preference footer are frozen in the existing encrypted outbox in the same transaction. Publication and rollback do not alter queued payloads or tokens. Retrying an already allocated invitation returns that invitation, even after a release change, preserving its payload and five-slot accounting. Provider recovery still uses the original idempotency key and bounded safe retry window.

## Upgrade and qualification

Apply `20260909040000_system_mix_releases` with the matching web build. It installs version 1 from the previously shipped wording and labels it as a migration baseline, not a new human review. Existing invitation rows retain an unknown/null version; their frozen emails and tokens are not reconstructed or changed. Local `db push` setup installs a missing baseline through the seed, and repeated seeding preserves all administrator changes.

Tests cover validation, staff-only authoring, authorization, MFA/password/session failures, stale and concurrent edits, publication/allocation races, immutable history, rollback eligibility, frozen emails, ownership, changed names, missing configuration, and repeatable local setup. The migration rehearsal reconstructs the preceding schema with a queued referral and verifies exact payload/token preservation through the upgrade.

The browser suite `e2e/system-mix-administration.spec.ts` requires `SYSTEM_MIX_E2E=1`, `AUTH_REQUIRE_ADMIN_MFA=true` and a disposable loopback `jitm_design_*` database. It uses synthetic staff/members/contacts, preserves the prior singleton configuration, runs without a worker or real email, and uses `PLAYWRIGHT_CAPTURE=off`. It covers the real draft/review/publish/member-send/rollback sequence and permission removal, with DOM overflow and WCAG checks in phone/desktop widths and both themes.

Current phase evidence is recorded in the [product completion ledger](PRODUCT_COMPLETION.md). Real provider inbox rendering, physical devices, deployment, retention and the rest of the launch checklist remain separate qualification.
