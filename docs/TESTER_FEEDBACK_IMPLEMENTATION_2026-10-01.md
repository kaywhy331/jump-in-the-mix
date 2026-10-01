# Tester feedback implementation — 2026-10-01

Branch: `feat/tester-readiness-20261001`, based on `6cf9ad635622`. Pull request: not opened in this task; no push, merge or deployment. See [readiness audit](TESTER_READINESS_AUDIT_2026-10-01.md) for acceptance and evidence.

The existing Help form now gives testers a direct feedback entry, compact selectors, a cleaned-report preview and optional basic diagnostics. It uses the existing private support service and support categories, requester/workspace checks, rate limits, recoverable form errors, conversation history and queued operator alerts. No new service, schema, dependency, recipient, retention policy or email-sending path was added.

Diagnostics are constructed only from allowlisted section, coarse layout, browser family, theme and online/offline values. They start disabled, are previewed, and exclude raw URLs, user-agent strings, contact IDs, cookies, page contents and history. The server independently validates them; old section/layout context remains supported. The report must meet its minimum length before context is appended, and the persisted body remains bounded to 5,000 characters.

New-report title/body redaction removes common email addresses, phone-like numbers, URLs, credential assignments, bearer/cookie headers, selected key formats and private-key blocks before persistence. The same helper previews changes in the browser. It is explicitly best effort, not a complete PII detector: names, addresses, obfuscated secrets and sensitive business prose may remain. Redaction is scoped to new support reports; it does not rewrite contacts, custom fields, templates, ordinary support replies or existing records.

Long support and retention text remains in a shared Replies and privacy disclosure. Help follows its existing reading/detail archetype, semantic tokens and shared controls. View-only sessions now omit Quick Add in both navigation instances, consistent with the absent dialog and mutation restrictions. Public support links point to real Help and My account destinations.

Decision record: Kevin's 2026-10-01 request authorizes this isolated feedback implementation and narrow workflow fixes. Existing access, billing, sending and retention rules remain unchanged. Product fit: let a tester report what blocks the next follow-up without leaving the existing support conversation workflow.

Rollback: revert this candidate's source changes. There is no migration. Existing conversation bodies remain ordinary text; coarse diagnostic attachments and redaction markers require no reader change.

Validation and remaining gates: [evidence index](tester-readiness-audit-2026-10-01/README.md). NOT RUN: deployment, real invitations, inbox delivery, actual support notifications, physical-device native handoff, billing activation, full release suite.
