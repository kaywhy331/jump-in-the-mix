# Draft PR: Prepare tester feedback and readiness evidence

## What and why

Testers need a clear way to report a blocked follow-up without exposing private details. Help now offers a direct feedback entry, compact controls, a cleaned-report preview and optional allowlisted diagnostics through the existing private support conversation. Server validation rejects empty descriptions even when context is attached. View-only support sessions omit dead Quick Add controls in both navigation instances; public support links point to the actual Help and privacy destinations. No schema or dependency changes are required.

## Standards, skills and workflow

- WF-01/02/03/04/05/07; jitm-audit, jitm-ui-change, jitm-copy, jitm-feature, jitm-review.
- JITM-00 §2.3–2.5; JITM-07 §2.10; JITM-08 §2.6/2.21/2.24; JITM-09 §2.63–2.64; JITM-11 §2.38/2.42; JITM-12 §2.1/2.13/2.19–2.25.
- Kevin authorized isolated readiness implementation. Publication/merge/release are separately gated. No access, pricing, sending or retention rule changes.

## Evidence

- VERIFIED: application candidate production build, static checks, typecheck and diff checks passed.
- VERIFIED: 69 focused tests across 11 files; selected billing-off test passed (four billing-on tests excluded).
- VERIFIED: mail-free browser batch 30 passed; contacts/login 11 passed and 7 device-specific skips; final affected desktop/mobile checks 8 passed. Counts overlap and are not a distinct-test total.
- VERIFIED: final feedback screenshots in both themes at phone/desktop widths, keyboard/200% text and scoped automated accessibility.
- VERIFIED: follow-up in-memory mail capture passed one complete database-backed account sequence; no external delivery. First attempt's incorrect logout assertion was corrected, with failure log retained.
- VERIFIED: the two original registration failures came from the unchanged production mail-configuration guard. The broader attempt also had 13 passes, one interrupted and 24 not run. No full baseline remeasurement is claimed.
- Redaction claims: common-format removal is covered by tests; complete PII removal is explicitly not promised. Diagnostics exclude raw URLs, contact IDs, cookies and page contents. Contact custom-field tokens remain unchanged.
- Records: tester-readiness audit, evidence index, mail-capture follow-up, invitation/triage plan and approval bundle. Four screenshots contain synthetic form content only.

## NOT RUN

Full release suite and full baseline rebuild; heavy typecheck/browser pass after the test-only follow-up; complete account flow through packaged browser forms; physical devices; actual inbox/OAuth/support-notification delivery; load qualification; authenticated live admission/billing/revision checks; production mutations, release, merge and real invitations. A first-batch launch is not yet cleared.

## Rollout

- Needs a separately authorized production release; no migration.
- Revert candidate source for code rollback. Existing tickets remain ordinary text.
- Billing and automatic customer email stay off. L4/L5 are documented future billing activation concerns, not newly reproduced billing-on results.

Kevin merges. This draft neither requests reviewers nor authorizes merge, deployment or invitations.
