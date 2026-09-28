---
name: jitm-audit
description: Run an evidence-based, read-only audit of Jump in the Mix — product, UX, design, copy, accessibility, release readiness or standards drift — with finding IDs, rule citations, evidence labels, severities, a refreshed drift baseline and questions for Kevin. Use when asked to audit, assess readiness, find gaps or inconsistencies across the app or docs, or re-run the periodic standards audit.
---

# Jump in the Mix — audit

Follow **WF-07** (`docs/standards/workflows/WF-07-audit.md`). The report sections, rubric and severities are in JITM-17 §2. The evidence labels are in JITM-12 §2. The record naming is in JITM-15 §2.

## Checklist

1. **State the question and scope.** Say what you are auditing, at which commit, and which decision the audit supports.
2. **Stay read-only.**
   - Change no code or data.
   - Deploy and migrate nothing.
   - Touch production only with public GET checks, or with checks Kevin approved.
3. **Collect sources.** Read the standards, the code at the audited SHA, the documents and any local runtime evidence. Record each source.
4. **Assess each dimension in scope** (JITM-17 §2.12). Cite the rule each finding breaks.
5. **Report the disagreements and gaps:**
   - documents that disagree with each other;
   - documents that disagree with the code;
   - gaps where no rule exists.
6. **Refresh the drift baseline.** Re-run the commands in `docs/standards-audit-2026-09-28/DRIFT_BASELINE.md` and compare the counts. A higher count is new drift.
7. **Write the report** to `docs/<TOPIC>_AUDIT_<YYYY-MM-DD>.md`, and put evidence in `docs/<topic>-audit-<YYYY-MM-DD>/`. Use UTC dates.
8. **Batch the questions for Kevin** into one short list. Make each question answerable with a letter.

## Report skeleton (JITM-17 §2.15)

1. Summary or verdict.
2. Findings by dimension, in the form ID | rule | finding | evidence | label | severity | fix direction.
3. Documents that disagree with each other.
4. Documents that disagree with the code.
5. Gaps: no rule exists.
6. NOT READ / NOT RUN.
7. Questions for Kevin.

## Must-know rules

- Never invent numbers or outcomes. An unverified claim is labeled INFERRED or NOT RUN (JITM-12 §2).
- The previous audit, `docs/STANDARDS_AUDIT_2026-09-28.md`, and the source register are the baseline for the next audit.
- Keep machine paths, secrets and customer data out of committed reports (JITM-15 §2).

## Stop and ask Kevin when

- The audit would need production writes or access to private data.
- A finding is a BLOCKER that needs action now.
