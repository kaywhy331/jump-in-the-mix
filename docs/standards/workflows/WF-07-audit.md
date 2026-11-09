---
id: WF-07
title: Audit
status: active
version: 1.1.0
owner: Kevin
last_reviewed: 2026-11-09
standards: [JITM-12, JITM-15, JITM-16, JITM-17]
skills: [jitm-audit]
---

# WF-07 — Audit

**Trigger:** an audit of the product, UX, design, copy, release readiness or standards drift. Also runs on the cadence in JITM-17 §2.9.
**Inputs:** the audit question and scope; the commit under audit (`origin/main` or a named SHA); the standards; the previous audit and drift baseline.

## Steps

1. **State the question and scope:** what is audited, at which commit, for which decision.
2. **Stay read-only.**
   - Change no code and no data.
   - Deploy and migrate nothing.
   - Touch production only with public GET checks or checks Kevin approved (JITM-16 §2.10).
3. **Collect sources:** the standards, code at the audited SHA, documents, and runtime evidence from local runs. Record each source in the report.
4. **Assess each dimension** in JITM-17 §2.12, with evidence labels (JITM-12 §2). For UI/design scope, JITM-17 §2.17 requires the full JITM-07 §5 size matrix and JITM-12 §2.26 states/touch/orientation passes.
   - Run the full applicable JITM-07 §5 size matrix in both themes, including every layout boundary on both sides, fractional width, sideways phones/short heights, narrow and ultrawide screens; record omitted rows.
   - Run JITM-12 §2.26: validation, empty, filtered-empty, loading, error/recovery, offline, not-found and signed-in/out states; hover/shortcut hints, phone input size and sheet focus; document title/H1, skip link and focus after navigation. Record inapplicable states with reasons.
   Use local synthetic fixtures for state changes; the read-only production boundary still applies. State gaps and device limitations remain explicit evidence gaps.
5. **Report disagreements and gaps:**
   - documents that disagree with each other;
   - documents that disagree with the code;
   - gaps where no rule exists.
6. **Refresh the drift baseline** with its documented commands and compare against the previous baseline.
7. **Write the report** to `docs/<TOPIC>_AUDIT_<YYYY-MM-DD>.md`, with an evidence folder `docs/<topic>-audit-<YYYY-MM-DD>/` (JITM-15 §2). Use the sections in JITM-17 §2.15.
8. **Ask Kevin** the open questions in one batch.

## Evidence to produce

- The report, with a finding ID, rule, evidence, label and severity for each finding.
- The refreshed drift baseline.
- A NOT READ / NOT RUN list.

## Done when

- Every dimension in scope is assessed.
- Every finding is evidenced.
- The questions for Kevin are listed.

## Stop and ask Kevin when

- The audit would need production writes or private data access.
- A finding is a BLOCKER that needs immediate action.

## Changelog

- 1.0.0 — 2026-09-28 — Initial version.

- 1.1.0 — 2026-11-09 — Base ef7a02c7b86d29d9c3ed5cab4928758166e24740. Require size/state/touch/orientation coverage and explicit limits; preserve read-only audit scope.
