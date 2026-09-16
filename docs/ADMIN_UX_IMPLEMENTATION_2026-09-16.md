# Admin audit implementation and release checklist

Goal: implement every actionable recommendation in [the audit](ADMIN_UX_AUDIT_2026-09-16.md), merge the complete candidate, and verify it on the selected deployment destination. This checklist records evidence, not intent. No item is complete merely because its page compiles.

Base: `5cb4608`, the integrated Admission fixes, whose application tree contains the audited `e52eea3` changes. Working branch: `feat/admin-workflow-audit`. Preserve the existing checkpoint lineage; do not replace it with the older `main` tree. Deployment validation target: stable Netlify test site `8fd20ccd-5c35-47e5-99ce-98e5670d52fe`. This release targets the test site; customer-site publication is a separate release.

Status: implementation and local verification are complete; CI, merge and staging publication are in progress. “Implemented” is not a deployment claim. All release rows remain required.

| ID | Required behavior | Status / evidence |
| --- | --- | --- |
| A01 | Overview includes delivery/access exceptions, precise metric populations, useful filtered metric links, honest empty state | Implemented and locally verified; see validation evidence below |
| A02 | Reports compact date/export toolbar, highlights/trends first, Growth/Engagement/Content/Operations views, contextual definitions | Implemented and locally verified; see validation evidence below |
| A03 | History defaults to activity, separates storage paging, keeps selected dates, explains missing observations | Implemented and locally verified; see validation evidence below |
| A04 | Saved detail clearly identifies observation/current limits, uses domain views, preserves history return path, links live comparison | Implemented and locally verified; see validation evidence below |
| A05 | Exports bounded visible polling/status announcements, contextual failure handoff, original range, explicit limits/expiry | Implemented and locally verified; see validation evidence below |
| A06 | Compact Users rows, focused account detail, sessions/access actions, account-specific related records, usable search proportions | Implemented and locally verified; see validation evidence below |
| A07 | Waitlist readiness/queue first, confirmation filter, eligible selection/count, review summary, Delivery/Waves tabs, schedule disclosure | Implemented and locally verified; see validation evidence below |
| A08 | Invitation ledger separates grant/delivery state, source/status/date filters, advanced version filter, focused detail, contextual recovery, preserved results | Implemented and locally verified; see validation evidence below |
| A09 | Support pagination/counts, Needs reply default, Mine/Unassigned/Waiting/All views, admin labels, permission-filtered shortcuts, response age | Implemented and locally verified; see validation evidence below |
| A10 | Support draft survives metadata saves/errors; safe template replacement; context/status at top; explicit reply-and-resolve; contextual account/queue return; contrast | Implemented and locally verified; see validation evidence below |
| A11 | Library distinguishes never-published/changes/hidden, Needs review view, category/industry filters, retained list context | Implemented and locally verified; see validation evidence below |
| A12 | Channel/trigger-aware library form, generated date key, compact beats, saved/unsaved feedback, field errors/draft preservation, placeholder picker | Implemented and locally verified; see validation evidence below |
| A13 | Working editor step navigation/focus, saved-vs-published diff and impact, contextual release confirmation, readable history authors | Implemented and locally verified; see validation evidence below |
| A14 | Invitation wording uses shared edit/review/history flow, one working preview, optional published comparison, release-local impact guidance | Implemented and locally verified; see validation evidence below |
| A15 | Operations Health/Failed work/Maintenance views, paginated jobs, impact/next step, expandable diagnostics, refresh/freshness, dark semantic colors | Implemented and locally verified; see validation evidence below |
| A16 | Alerts ordered by severity/actionability, Open/Acknowledged/All views, impact/next step first, disclosed evidence/history, stale-monitor warning retained | Implemented and locally verified; see validation evidence below |
| A17 | Email capacity display, permission-scoped attention across invitation/staff/support types, contextual actions, explicit recent diagnostics limits | Implemented and locally verified; see validation evidence below |
| A18 | Focused delivery recovery, evidence/action/confirmation sequence, current eligibility/cooldown before form entry, preserved case/recipient/list context | Implemented and locally verified; see validation evidence below |
| A19 | Suppression compact rows with reasons/age/eligibility, reason filter/count, parent navigation and retained search | Implemented and locally verified; see validation evidence below |
| A20 | Suppression detail groups blocks/evidence/confirmation, contextual case reference, scoped draft preservation, post-clearance next steps, filtered audit | Implemented and locally verified; see validation evidence below |
| A21 | Audit explicitly scoped filters, date range and pagination, readable actors/entity links, concise change summary and redacted details | Implemented and locally verified; see validation evidence below |
| A22 | Roster-first searchable/paged Team, one account-aware add flow, Invitations tab, role descriptions, effective tri-state permissions, change impact | Implemented and locally verified; see validation evidence below |
| A23 | Access capacity view with effective readiness, used/reserved/available, pause-state table, separated emergency controls and proposed impact | Implemented and locally verified; see validation evidence below |
| A24 | Content Library options with selectable/reorderable reviewed values, inline validation and pending/success, consumer scope/reset impact, preserved edits | Implemented and locally verified; see validation evidence below |
| A25 | Avoid denied shortcuts; denied page names capability and supplies contextual/permitted return | Implemented and locally verified; see validation evidence below |
| A26 | Staff-safe MFA return, session-vs-recent verification, proactive/contextual verification, scoped nonsecret drafts and explicit resubmission, recovery guidance | Implemented and locally verified; see validation evidence below |
| X01 | Eight primary permission-aware destinations with nested tabs; existing URLs/deep links continue working | Implemented and locally verified; see validation evidence below |
| X02 | Consistent compact queue/detail/editor/sensitive-change/report patterns and responsive layouts | Implemented and locally verified; see validation evidence below |
| X03 | Shared query/return continuity, consistent search/pending/result announcements, honest counts/truncation | Implemented and locally verified; see validation evidence below |
| X04 | Nonsecret draft continuity across errors/MFA/concurrency, safe secret clearing, consistent write feedback | Implemented and locally verified; see validation evidence below |
| X05 | Operator identity/environment, consistent dates/timezones, readable staff identity, adjacent checkbox labels, both themes | Implemented and locally verified; see validation evidence below |
| V01 | Focused behavioral regressions cover reproduced failures; complete admin route/state/browser matrix and role checks | Local desktop journeys and 38 targeted route/interaction checks passed; mobile workflow recheck follows in release receipt |
| V02 | Required repository checks/build pass on final candidate; privacy, permissions, sending/MFA safeguards preserved | Local checks/build pass; full PR CI required before merge |
| R01 | PR merge verified against the accepted complete candidate and correct integration base | Pending |
| R02 | Stable target deployment serves exact merged build; admin authenticated smoke, assets, readiness and worker verified; rollback recorded | Pending |

Implementation sequence: shared navigation/forms/query primitives and reproduced defects → customer/access/support queues and record context → content/team/security → reporting/operations → complete verification, merge and publication. Record semantic milestones here with the concrete validation used. Actual operator task-time measurement remains a post-release research activity; no efficiency outcome is assumed or advertised.

## Validation milestones

- Full isolated service run: 1,194 passed, four test-harness failures, 68 conditional skips. The four failures were missing request-header mocks or changed URL space encoding; their corrected suites and the new concurrent settings tests passed (27 tests). The new concurrency tests cover competing saves and stale resets. Subsequent focused support, delivery, settings, navigation and audit tests passed (47 tests).
- Earlier focused runs: 18 navigation/support/settings tests; 41 library/System Mix/MFA tests; 61 reporting/operations/date-key/audit-presentation tests.
- Desktop browser journeys passed for admission/MFA, account access, staff permissions, waitlist, library publication and stale forms, invitation wording, reports, support and reply delivery, staff onboarding, delivery recovery, suppression review and operational alerts. Updated assertions follow the new labels, focused detail destinations and retained query context. Security and side-effect assertions remain enforced.
- Six additional workflow regressions pass: password-error/MFA draft return, reply/triage/template/resolve, draft isolation between staff sessions, permitted denial return and expired-MFA routing, concurrent settings changes/reset, and visibility-aware export polling capped at eight refreshes. These are included in CI.
- [Local verification evidence](admin-ux-implementation-2026-09-16/verification.json) records seven interaction checks and 31 report/operations/access route states. The production-build route sweep passed narrow-screen overflow checks and dark-theme axe checks. Earlier development-server interruptions were superseded by this successful sweep.
- Standard Next.js Turbopack production build and TypeScript passed. Static validation passed: schema, syntax (524 files), imports and Server Action boundaries (463 source files). Production dependency audit exited successfully with no high/critical findings; it reports one moderate `baseline-browser-mapping` advisory (GHSA-w5vr-8v7q-w6rv).
- Representative synthetic-data screenshots: [Reports](admin-ux-implementation-2026-09-16/reports.png), [Operations](admin-ux-implementation-2026-09-16/operations.png), [Email](admin-ux-implementation-2026-09-16/email.png). These are local implementation evidence, not live customer data or measured productivity outcomes.

## Release gates

The PR must pass CI against the integrated base. Publish the merged application to the explicit stable test site, verify authenticated administration, matching browser assets, readiness and worker cadence, and record the deployment/rollback identifiers in a release receipt. The staging-only historical migration newline exception remains as documented in `HOMEPAGE_RELEASE_AND_ROLLBACK_2026-09-10.md`; no database migration or history rewrite is part of this change.
