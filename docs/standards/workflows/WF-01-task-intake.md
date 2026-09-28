---
id: WF-01
title: Task intake
status: active
version: 1.0.0
owner: Kevin
last_reviewed: 2026-09-28
standards: [JITM-00, JITM-01, JITM-13, JITM-16]
skills: [jitm-ui-change, jitm-copy, jitm-feature, jitm-review, jitm-release, jitm-audit, jitm-standards-update]
---

# WF-01 — Task intake

**Trigger:** every task in this repository, before any plan or change.
**Inputs:** the request, `AGENTS.md`, and the standards index (`docs/standards/README.md`).

## Steps

1. **Confirm where you are.** Start at the repository root or a task worktree root (JITM-16 §2.1). Create a task worktree from a fresh `origin/main` (JITM-13 §2.1) unless you are already in one made for this task. Never change a checkout that holds other work (JITM-13 §2.2).
   **Gate:** `git status` shows only changes from this task.
2. **Classify the task** using the routing table in `AGENTS.md`: UI, copy, feature, review, release, audit, standards update, or documentation and operations. A task can have several classes.
3. **Load every matching skill** (JITM-16 §2.4). A UI change that alters words loads both `jitm-ui-change` and `jitm-copy`.
4. **List the standards and rules that apply,** and read those sections. Skills name their standards. Add any others the task touches.
5. **Check owner decisions.** Search the "Open decisions" section (§6) of each applicable standard and the owner decision record for anything the task touches.
   **Gate:** if the task needs a product, pricing, vocabulary or policy choice that is not decided, stop and ask (JITM-16 §2.16).
6. **Test concept fit** when the task adds or changes product behavior (JITM-01 §2).
   **Gate:** the behavior fits the product concept, or Kevin has approved it.
7. **Write the plan.** Include:
   - the workflow, skills and cited rules;
   - the evidence you will produce;
   - what might end up NOT RUN.

## Evidence to produce

- A plan that names the workflow, skills and rules (`JITM-NN §2.N`) before the first change.

## Done when

- The plan cites the workflow, skills and rules.
- Blocking decisions have been asked, or there are none.

## Stop and ask Kevin when

- Standards conflict with each other or with his instruction.
- The task needs a decision the standards leave open.
- The task would change pricing, access, customer promises or vocabulary.

## Changelog

- 1.0.0 — 2026-09-28 — Initial version.
