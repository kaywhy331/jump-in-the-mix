# Lead sources and daily receipt review — implementation record

October 28, 2026 (UTC). Local candidate for `job_3234f0f2daab`, authorized by Kevin on October 27, 2026. Assigned workspace: `/home/trix/orca/workspaces/jump-in-the-mix/dispatch-job_3234f0f2daab`. Base: `1804bd0a404b7db56eccbd692480267a6677c46e`. The final local SHA and branch are recorded in the Hub handoff. No pull request, push, merge or production release is part of this task.

## Scope and decisions

VERIFIED-CODE: A reusable workspace-scoped reader supplies receipt review and the shared next-action projection. Each held inquiry has a stable receipt identity and counts once even when several contacts match. An unresolved inquiry retains its nullable contact ID; reading and presenting it never creates or chooses a person. Contact-specific Next continues to contain only that contact's obligations. Unrelated inquiries with null contact IDs are not grouped as one person's secondary work.

VERIFIED-CODE: Today and Contacts expose a full-workspace “Needs review” count and a clear `/contacts/review` destination, independent of contact-list filters. Today also includes each inquiry once in its shared next-action count and routes its action to the exact receipt, including receipts beyond the first page. A failed count is labelled unavailable rather than zero. Settings retains the old review anchor and actions through the same presentation, preserving existing links and workflows.

VERIFIED-CODE: The review offers the existing link, separate-contact and ignore decisions. It retains archived-match restoration guidance, actual matching choices and the warning that acceptance applies Journey rules. No-contact receipts remain reviewable. The copy explains that Ask each time placement waits in No Mix, a different decision from matching an inquiry. Support views can read the list but cannot use its select or decision buttons; the existing server-side restriction remains in force.

VERIFIED-CODE: Resolution still uses the existing locked transaction, tenant checks, retry protection, Journey consequences and placement service. The presentation action accepts only the two fixed return destinations and invalidates Today, Contacts, review and Settings after success. No schema, intake service, enrollment, scheduling, Undo, connector activation or API contract was changed.

VERIFIED-CODE: Settings is titled “Lead sources,” including its Settings-hub link. Existing source details appear before creation controls. A newly created form opens its actual setup disclosure with the saved result, existing preview link, share URL and per-source destination control. There is no second form-creation backend. Daily readers select only the source name and receipt fields, never endpoint credentials or connection tokens.

All changed words are interface text. This candidate follows WF-01/02/03/04 using `jitm-ui-change`, `jitm-copy`, `jitm-feature`, `orca-tokenpak` and the dispatched-worker workflow in `orca-fleet`. Applicable rules include JITM-00 §2.2–2.8, JITM-06 §2.1/2.5/2.7/2.13, JITM-07 §2.1/2.2/2.23, JITM-08 §2.6/2.19, JITM-09 §2.25/2.78, JITM-11 §2.48, JITM-12 §2.8–2.10/2.14/2.18–2.22, JITM-13 §2.11 and JITM-16 §2.5–2.10.

## Proposed standards alignment

The brief authorizes the rollout departure and forbids standards edits. Proposed replacement wording for the held-inquiry portion of JITM-09 §2.25:

> Today includes held lead inquiries in its shared next-action projection. Today and Contacts show “Needs review” with the exact workspace-wide count and link to a shared receipt-review destination. Each inquiry counts once by receipt ID, regardless of how many contacts match; unresolved inquiries never acquire a contact merely for presentation. Review offers the existing link, create-separate-contact and ignore decisions, preserves archived-match guidance and Journey consequences, and is view-only in support sessions. Settings calls its forms and connections “Lead sources” and keeps configuration, preview, share details and per-source placement there. Ask each time placement remains the separate No Mix decision on Today.

Visual references: Main/DarkMain, TabletToday/DarkTabletToday, TabletTodayWide/DarkTabletTodayWide, DesktopToday/DarkDesktopToday, Contacts/DarkContacts and DesktopContacts/DarkDesktopContacts. The new review route uses the shared 1040px focused-form layout with flat sections, JITM-07 §2.23. Settings retains its existing source-configuration disclosure layout. Daily entry points reuse shared buttons, semantic tokens and one responsive DOM. The added daily entry and dedicated review destination are the authorized workflow departure; the surrounding workspace structure is preserved.

## Validation

VERIFIED-RUNTIME: Remote main was `5f85ee71f405244de97110417cf3b33506e9315f`, the prerequisite candidate's parent. All 15 prerequisite source hashes and all 252 retained evidence hashes matched their manifests. The assigned workspace began clean at the required candidate. The prerequisite's own full-check/browser history remains its evidence, not a claim that this candidate was tested then.

VERIFIED-RUNTIME: Locked dependency installation, database generation and unchanged migrations passed. All database writes target the owned loopback `jitm_design_ux04` database. One heavy process runs at a time with `NODE_OPTIONS=--max-old-space-size=2560` and explicit `PILOT_MODE=false`.

VERIFIED-RUNTIME: Focused run: five files, 51 tests passed in 14.29 seconds. This includes the unchanged customer-journey intake duplicate/tenant/idempotence cases, unchanged new-contact-placement per-source/stage precedence cases, next-action unit/snapshot suites and new daily receipt integration tests. Evidence: `.artifacts/ux04/focused-tests.log`.

VERIFIED-RUNTIME: The initial standalone typecheck failed at two existing contact-only consumers after the legacy attention type was widened. The implementation now uses a generic identity type, retaining the legacy string default while the shared receipt adapter permits null. Existing tests were not changed. The full check subsequently passed; its results are recorded below.

BLOCKED: Orca native browser inspection of the exact assigned workspace returned `browser_unavailable: Browser automation is unavailable on this host.` Installed Playwright Chromium against the owned loopback production build is the justified fallback. Native lifecycle socket and loopback/network operations used scoped automatic review; no permission settings or hooks were changed. A transient E-32 intake refusal recovered after the instructed delay and identical retry. These errors remain in Hub ERRLOG notes.

### Final validation results

VERIFIED-RUNTIME: `npm run check` passed database generation, static validation, typechecking, all 322 passing test files (9 skipped), 2510 tests (75 skipped), and the production build with 118 static pages. Evidence: `.artifacts/ux04/check.log`. The final scoped CSS repairs were then rebuilt successfully (`build-final.log`); the application reader/action source is unchanged since the full check. No skip is counted as a pass.

VERIFIED-RUNTIME: The first five-file browser batch returned 42 passes, one intentional project skip and three failures. The two new support-view failures exposed actual interception by the desktop rail and mobile support banner. Scoped CSS now keeps the banner in flow and the main content beside the rail on review surfaces; both support cases passed in the rebuilt batch. The original logs and failure contexts remain in `browser.log` and `browser-first-results/`.

VERIFIED-RUNTIME: The rebuilt batch returned 43 passes, one intentional project skip and two focus failures (`browser-final.log`, `browser-second-results/`). The unchanged mobile `e2e/next-action.spec.ts:46` case failed its summary Enter/open assertion in both batches, then passed twice alone on the final candidate (`candidate-next-alone.log`). The new desktop review keyboard test failed its initial select focus assertion, then passed twice alone (`candidate-review-alone.log`); its setup now additionally asserts that the account gate is hidden and the select is visible/enabled before focus, retaining the focus/Tab assertions and original timeout. Final fixture and baseline results follow below.

VERIFIED-CODE: Baseline source is the required prerequisite candidate `1804bd0a…`, a stack baseline whose parent is fresh main. The failing unchanged next-action spec was introduced in that prerequisite and does not exist on main. All 2255 exported baseline files match a fresh `git archive` of that commit (`baseline-source-manifest.json`); no shared checkout or additional worktree was changed. Initial baseline setup errors (blob-versus-CRLF comparison and a nested generated-client copy) were corrected in scratch and remain in Hub ERRLOG notes.

VERIFIED-RUNTIME: The initial visual harness failed on its browser-side named-function helper, corrected in scratch without changing checks. Its next run found the existing Copy form link button at 36px on a 901px setup screen. Scoped Lead sources styling now gives it a 44px minimum. Original attempts remain recorded in `visual.log` and `visual-second.log`; final visual results and inspection follow below.

VERIFIED-RUNTIME: The prerequisite production build passed (`baseline-build-final.log`), and the unchanged next-action failure passed twice alone on baseline (`baseline-next-alone.log`, 15.4s). Together with the twice-alone candidate result, this classifies the retained failure as order-dependent under JITM-12 §2.14; its spec and assertions are unchanged and a test-only follow-up remains. The source baseline is the required stack prerequisite because this spec does not exist on its main parent.

VERIFIED-RUNTIME: The complete final new-review suite passed all 10 desktop/mobile cases in 33.4s (`review-final.log`), including keyboard/Tab, both-theme axe checks and actual 200% text. Existing customer-journey, Today races and core accessibility cases passed on both projects in the retained rebuilt batch. No timeout was extended and no behavior assertion was removed.

VERIFIED-RUNTIME: Final layout alignment rebuilt successfully (`build-form-alignment.log`), then all 10 new workflow cases passed again in 34.3s (`review-aligned.log`). The 184-case owner visual matrix passed, and every one of the 46 review cases was repeated after the form-wrapper correction. The final combined receipt is `visual-final-assertions.json`: 184 owner cases plus 16 support cases, all passing. Widths: 320, 390, 599/600/601, 767/768, 834, 900/901, 1194, 1199/1200, 1279/1280, 1599/1600, 1699/1700, 1920 and 2200; plus 390px with actual 200% text and 834×480 short height, in both themes. Owner regions passed 44px control targets, 13px text, visible focus, no horizontal overflow or control overlap; axe at 390/834/1920 returned zero violations. Evidence: `visual-final.log`, `visual-review-aligned.log`, and the final assertion receipt.

VERIFIED-RUNTIME: Support inspection navigated from Today and Contacts into review at 390, 834 and 1920px and at 390px with 200% text, in both themes. All 16 cases passed natural link clicks, disabled decision/select checks, no overflow and review-region axe; 32 captures retain the daily and destination views (`support-visual.log`, `support-visual-assertions.json`). These tests use the existing synthetic support grant, not a changed permission contract.

VERIFIED-VISUAL: Inspected phone light/dark review, enlarged-text review in both themes, tablet Today, wide source setup, desktop dark Contacts, desktop review, and support desktop/enlarged-phone captures. Compared Today phone with Main, desktop Contacts with DarkDesktopContacts, and the existing phone/tablet/rail structure with the named export screens; 14 export captures are retained unchanged. The deliberate differences are the new daily review entry, the prerequisite shared Next state, actual synthetic empty/work states, and source details moved before creation. Flat review sections, shared control styles, wrapping actions, visible focus and the separate No Mix explanation remain readable. Settings retains its existing card/disclosure composition; no export, standard or icon system was edited. The 230 private captures are under `.artifacts/ux04/captures/`.

VERIFIED-RUNTIME: A scoped gitleaks scan of the 19 candidate files found no secrets (`gitleaks.log`); `git diff --check` passed. Final source/evidence SHA-256 manifests, local candidate SHA, cleanup receipt and exact final porcelain status are recorded in the Hub handoff.

## Changed-file manifest

- `src/lib/intake-review-reader.ts`: tenant-scoped count, paged review, exact receipt navigation and shared work-item adapter.
- `src/components/IntakeReviews.tsx`: shared daily entry and receipt review presentation.
- `src/app/(app)/contacts/review/page.tsx`: focused daily review destination.
- `src/app/(app)/contacts/page.tsx`, `src/app/(app)/jumps/page.tsx`: daily count and destination.
- `src/app/(app)/settings/connections/page.tsx`, `src/app/(app)/settings/page.tsx`: Lead sources heading and configuration result organization; reused review panel.
- `src/lib/next-action.ts`, `src/lib/next-action-reader.ts`: receipt kind, identity and snapshot integration.
- `src/lib/workflow-attention.ts`, `src/components/WorkflowAttention.tsx`: preserve the contact-only legacy contract while adapting nullable receipt work.
- `src/components/NextAction.tsx`: avoid grouping unrelated unresolved receipts as one person's work.
- `src/lib/intake-actions.ts`: fixed review return destination and daily count revalidation.
- `src/styles/product.css`: scoped responsive review/entry styling, support-banner layout and 44px setup copy controls.
- `tests/intake-review.integration.test.ts`, `tests/intake-review-action.test.ts`, `e2e/intake-review.spec.ts`: new behavior, action boundary, workflow and view-only coverage.
- `e2e/customer-journey.spec.ts:111`: the only existing test edit, “Needs a person’s eye · 1” → “Needs review · 1”; all workflow assertions remain unchanged.
- This implementation record.

## Follow-ups and NOT RUN

Independent QA, the exact proposed standards alignment, and a test-only investigation of the unchanged next-action batch focus failure remain coordinator follow-ups. Raw synthetic captures, command logs, assertion receipts and final file/hash manifests remain private under `.artifacts/ux04/`.

NOT RUN: Production deploy/smoke, merge, hosted CI, unaffected full-browser/staff/worker suites, dependency audit (no dependency change), migration/restore rehearsal, packaged-server suites, load qualification, public-page Lighthouse, image builds and physical-device testing; outside this local application UI task. No claim of release or physical-device qualification is made.
