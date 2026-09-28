---
id: WF-05
title: Review
status: active
version: 1.0.0
owner: Kevin
last_reviewed: 2026-09-28
standards: [JITM-12, JITM-16, JITM-17]
skills: [jitm-review]
---

# WF-05 — Review

**Trigger:** reviewing a diff, a pull request, a page or a screenshot for compliance with the standards. Also run before a release that changes customer-visible behavior (JITM-17 §2.10).
**Inputs:** the change (`git diff --stat origin/main...HEAD` or the pull request), the rubric in JITM-17 §2.12, and the relevant standards.

## Steps

1. **Scope.** List the changed files and group them by area (UI, copy, behavior, data, docs, release).
2. **Map to dimensions.** Use the table in JITM-17 §2.12 to pick the dimensions and standards that apply.
3. **Check each applicable rule.** Collect evidence: `path:line`, command output, or screenshots for UI in both themes.
4. **Score** each dimension from 0 to 3 (JITM-17 §2.12).
5. **Write findings** with:
   - an ID;
   - the rule cited;
   - the evidence;
   - an evidence label (JITM-12 §2);
   - a severity (JITM-17 §2.14);
   - a fix direction.
6. **Give a verdict.**
   - **Approve:** no findings above LOW.
   - **Changes requested:** at least one HIGH or MEDIUM.
   - **Blocked:** at least one BLOCKER.
7. **List NOT RUN checks.**

## Evidence to produce

- The dimension scores.
- The findings table.
- The verdict.
- A NOT RUN list.

## Done when

- Every changed area is scored.
- Every finding cites a rule and carries evidence.

## Stop and ask Kevin when

- The review shows that a standard is wrong or missing (propose an amendment through WF-08).
- The change needs an owner decision.

## Changelog

- 1.0.0 — 2026-09-28 — Initial version.
