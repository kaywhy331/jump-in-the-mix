# Homepage roadmap reconciliation — September 18, 2026

**September 18 follow-up:** The [mobile clarity release](MOBILE_CLARITY_2026-09-18.md) supersedes earlier descriptions of the multi-Mix public demo. The live showcase now presents one short example through edit, preview, next step and completion, with no sending or scheduling. Earlier evidence remains historical; participant comprehension is still unqualified.

This is a current-evidence supplement to the [original roadmap](HOMEPAGE_EXPERIENCE_ROADMAP_2026-09-10.md), whose original planning text and recorded checkboxes remain preserved. An earlier checked item is not, by itself, evidence that the September 18 release meets every part of its acceptance criterion. The [release record](UI_UX_IMPLEMENTATION_2026-09-18.md) and [individual audit checklist](ui-ux-audit-2026-09-18/IMPLEMENTATION_CHECKLIST.md) govern this release's implementation, verification and live status.

The five ICPs remain fictional planning hypotheses. The two supplied Joanna Wiebe documents and asset inventory are indexed in [assets/README.md](../assets/README.md). Neither source review, automated tests nor deployment establish participant comprehension, conversion improvement or validated profession fit.

| Roadmap item | Current evidence and limits |
| --- | --- |
| P0.1 | Reference files and original index preserved; source review recorded in the September 10 copy matrix. |
| P0.2 | Existing copy matrix preserved. Current public capability copy, access receipts and first-use behavior are reflected in the release sources; owner-led factual signoff remains open (PUBLIC-05). |
| P0.4 | September 18 compiled build, route/viewport scan and screenshots are recorded in the release evidence. Earlier page-weight/performance figures remain historical; no new field or conversion measurement is claimed. |
| P1.1, P1.2 | `e2e/ui-ux-public-auth.spec.ts` exercises editable scenarios, switching, reset and sandbox handoffs. Original profession definitions remain available; participant tasks are still required. |
| P2.1 | Current public route sweep plus route tests cover homepage and profession direct loads; source route allowlist rejects unknown professions. |
| P2.2 | Shared mobile navigation, context-preserving access links and current capability copy implemented. Browser/markup evidence does not replace owner content approval. |
| P2.3, P2.6 | Public/auth browser regressions exercise reset, retained scenario edits, date selection, initial demo focus and context preservation. |
| P2.4 | Sandbox handoff interception and absence of native composer navigation are checked in public/auth browser tests; drafts are excluded from access context. |
| P2.5 | Existing server-rendered fallback and server form remain in source. The prior no-JavaScript result is historical; no new no-JavaScript submission result is claimed here. |
| P3.1 | Waitlist validation/recovery source and unit tests; retained nonsecret form state and authentication errors covered by public/auth browser tests. Actual provider/inbox delivery is separate. |
| P3.2, P3.3 | Admission, waitlist and referral integration tests exercise pauses, token ownership, replay and privacy boundaries in a disposable database. |
| P3.4 | Marketing scenario validation and referral/waitlist tests cover durable allowlisted context; nondefault choices map to their selected first follow-up. New cross-device human observation is not claimed. |
| P3.5, P3.6 | Existing event contract and privacy tests remain the evidence. No collector or measured funnel has been introduced by this release. |
| P4.1 | Invitation, admission and verification redirect tests cover account entry and recovery; current browser tests use synthetic recipients. |
| P4.2, P4.3, P4.4 | Onboarding now requires review of the actual starter, allows minimal details and optional business setup, supports refreshed imported contacts, and distinguishes missing contact methods. `onboarding-invitations`, `ui-ux-workflows` and onboarding unit/integration tests supply engineering evidence. |
| P4.5 | Authenticated workflow tests cover pending handoffs and outcome recording. A composer opening remains distinct from sending or delivery. Physical iPhone/Android qualification remains open (SEND-05). |
| P4.7 | The first-use screen prioritizes the prepared follow-up; invitations remain available under Mixes. Onboarding browser tests verify the destination and saved state. |
| P5.1 | The current release records the actual browsers, viewport widths and themes exercised. Earlier 768-pixel and 200% zoom claims are not silently carried forward as fresh evidence; manual reflow/assistive-technology qualification remains open. |
| P5.3 | Existing media/reduced-motion tests remain relevant. The new browser sweep uses reduced motion; that alone is not a new full playback or network-failure qualification. |
| P5.4 | Prior Lighthouse results are historical. No new three-run performance result or field measurement is claimed by this UI/UX release. |
| P5.5 | Existing asset manifest is preserved. This release does not introduce new raster/video assets or new rights claims. |
| P5.6 | Current build, type checks, unit/integration and browser results, including initial failures and corrected reruns, are recorded in the release report. Skips are not passes. |

Open roadmap items P0.3/P0.5, P1.3–P1.5, P4.6, P5.2 and P6 still require the approvals, participant observations, assistive-technology sessions or measured cohorts described in the original roadmap. Publishing engineering fixes does not close those gates.

Local evidence is retained under `.artifacts/ui-ux-implementation-20260918/`; public audit and release records contain no authentication credentials or real customer drafts.
