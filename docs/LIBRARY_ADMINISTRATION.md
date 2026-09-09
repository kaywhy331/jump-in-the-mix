# Library administration

This workflow is implemented locally. Deployment and real-user qualification remain separate release gates.

## Draft and review

Open **Admin → Ready-made mixes → Create library draft**. Named staff with `mixes.edit` can write a draft without a customer workspace. Staff who also own customer mixes can copy one into a draft from the library page; another customer's mix cannot be used as that source.

Set the description, category, industry, start rule, and beats. Add, remove, or reorder up to 50 beats. Message placeholders, channel requirements, date rules, content lengths, and exact integer timing are validated on the server. Long-SMS and opt-out settings are preserved explicitly. Private Notes may appear only in phone-call notes.

Enter an audit reason and **Save draft for review**. A new immutable version is created. Published content stays as it was. The saved preview shows original placeholders or invented example data, including long names and missing contact fields. Examples use the application's text renderer and never send a message. Review wording, empty-field behavior, channel, timing, subject, signatures, and opt-out choices.

## Publish, hide, and roll back

Publication requires both `mixes.edit` and `mixes.publish`, an active verified staff account and session, a current password, an audit reason, and recent MFA in production. A role without publication permission can save drafts but cannot publish, hide, or roll back.

**Publish version N** releases exactly that saved draft. Unsaved form changes are not included. A concurrent edit or release invalidates stale forms and requires another review. **Hide from customer library** prevents new imports. **Version history** offers rollback only for versions that have previously been published. Rollback points the library at that immutable content and records a new release event; it does not rewrite the old version or discard newer drafts.

The impact panel reports copies and customer workspaces. Every release affects future library use. Existing customer copies, customized messages, active assignments, and queued follow-ups remain independent. Changing customer-owned mixes is a separate operation requiring its own scope and review; this workflow cannot silently overwrite them or enable sending.

## Customer version consistency

Customer setup records the version shown in its preview. Creating or activating a copy rechecks visibility and that version under the same database lock as publication. If the content changed, the customer sees a clear message and must review the refreshed preview. A completed request retries to the same owned copy, even if the original has since changed or been hidden. Concurrent repeated submissions create one copy.

Imports retain their source version for attribution. Import-count changes do not create content revisions. Staff-only accounts do not need customer data to manage library content.

## Migration, setup, and history

Apply `20260909030000_library_revisions` and `20260909031000_catalog_retirement_history` with the matching web build. The first migration snapshots current content and records existing publication without implying a new human approval. Earlier versions were not stored and cannot be reconstructed. Invalid legacy content remains visible for review and can be hidden or corrected with a new draft; publishing always requires current validation.

PostgreSQL rejects direct changes or deletion of revision/release records. Explicit parent removal during database maintenance permits cascading cleanup; the admin UI offers hiding, not deletion. History stores staff identifiers, reasons, timestamps, and the immutable content. The platform audit records publication transitions independently of customer workspaces.

Catalog setup installs missing reviewed plans only. Every shipped entry is checked against the same publication validator; existing category names remain supported. Re-running setup cannot overwrite staff drafts, republish a hidden mix, or undo a rollback. A one-time migration records the old catalog retirement that previously ran on every seed. Updates to already-installed catalog content now go through administrator draft/review/publication.

## Qualification

The PostgreSQL suites cover staff-only drafting, role and credential checks, stale edits/publications, immutable history, rollback eligibility, preserved customer copies, hidden/stale import prevention, duplicate setup, and workspace isolation. The browser suite `e2e/library-administration.spec.ts` uses `LIBRARY_E2E=1`, required MFA, isolated fixtures, no worker or external messages, and `PLAYWRIGHT_CAPTURE=off`. It exercises the real editor, saved examples, publication, customer preview changes, rollback, hiding, permission removal, phone/desktop accessibility, and preservation of edited content, timing and flags when beats are reordered.

System Mix invitation-copy releases use the separate [System Mix administration](SYSTEM_MIX_ADMINISTRATION.md) workflow. Aggregate effectiveness reports, production load, and live operational qualification remain open in the [completion ledger](PRODUCT_COMPLETION.md).
