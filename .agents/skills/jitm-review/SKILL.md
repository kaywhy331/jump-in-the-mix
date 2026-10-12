---
name: jitm-review
description: Review work against the Jump in the Mix standards using the JITM-17 rubric — dimension scores, findings with rule citations, evidence labels, severities and a verdict. Use when asked to review a diff, pull request, branch, page or screenshot for design, copy, UX, workflow, engineering or process compliance, or before a release that changes customer-visible behavior.
---

# Jump in the Mix — review

Follow **WF-05** (`docs/standards/workflows/WF-05-review.md`). The rubric and the severity scale are in JITM-17 §2. The evidence labels are in JITM-12 §2.

## Checklist

1. **Scope.**
   - Run `git diff --stat origin/main...HEAD`, or read the pull request's file list.
   - Group the changes: UI, copy, behavior, data, docs, release.
2. **Map to dimensions.** Pick the applicable dimensions from the table in JITM-17 §2.12 and open their home standards.
3. **Check each applicable rule, and collect evidence:**
   - `path:line` references;
   - command output;
   - screenshots in both themes for UI changes.
4. **Score each dimension from 0 to 3** (JITM-17 §2.12).
5. **Write each finding with:**
   - an ID such as `VOC-01`;
   - the rule it cites (`JITM-NN §2.N`);
   - the evidence;
   - a label: VERIFIED, INFERRED, NOT RUN or BLOCKED;
   - a severity: BLOCKER, HIGH, MEDIUM or LOW;
   - a fix direction.
6. **Give a verdict.**
   - Approve: nothing above LOW.
   - Changes requested: any HIGH or MEDIUM.
   - Blocked: any BLOCKER.
7. **List the NOT RUN checks.**

## Always check

- **Truth:** sending and delivery language, and invented claims or data (JITM-00 §2.3, JITM-00 §2.4).
- **Vocabulary and casing** (JITM-05 §2).
- **Tokens, shared components, both themes and the viewport matrix** (JITM-06 §2, JITM-07 §5).
- **Accessibility floor:** 44px targets and 13px text on every owner screen, Calendar and Journey included (MUST; exceptions: JITM-10 §2.1–§2.2; automated check: §2.21), visible focus, 200% text (JITM-10 §2).
- **Tenancy, scheduling and idempotency** when behavior changes (JITM-11 §2).
- **Tests compared with a baseline, and honest labels** (JITM-12 §2).
- **Pull request hygiene:** branch name, commit subjects, template, NOT RUN list (JITM-13 §2).
- **Standards changes:** when standards, skills or `AGENTS.md` changed, run `npm run standards:check`.

## Output format

```
Verdict: <approve | changes requested | blocked>
Scores: <dimension> <0-3>, …
| ID | Rule | Finding | Evidence | Label | Severity | Fix |
NOT RUN: …
```

## Stop and ask Kevin when

- The review shows a standard is wrong or missing. Propose the change through `jitm-standards-update`.
- The change needs an owner decision.
