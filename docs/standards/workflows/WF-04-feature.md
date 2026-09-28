---
id: WF-04
title: Feature
status: active
version: 1.0.0
owner: Kevin
last_reviewed: 2026-09-28
standards: [JITM-01, JITM-09, JITM-11, JITM-12, JITM-13, JITM-15]
skills: [jitm-feature, jitm-ui-change, jitm-copy]
---

# WF-04 — Feature

**Trigger:** building or changing product behavior end to end, including routes, server actions, the worker, the Prisma schema and imports or exports.
**Inputs:** the intake plan (WF-01), the affected user workflows (JITM-09) and the engineering rules (JITM-11).

## Steps

1. **Check concept fit** (JITM-01 §2). Say how the change serves the product promise and the core loop.
   **Gate:** the behavior fits the product concept, or Kevin has approved it.
2. **Check workflow fit** (JITM-09 §2). Name the user workflows that change. If a documented workflow changes, get Kevin's decision (JITM-16 §2.7), then amend its rule through WF-08 in the same pull request.
3. **Design and copy.** Run WF-02 for any UI and WF-03 for any words.
4. **Engineering** (JITM-11 §2):
   - take `workspaceId` only from the session;
   - schedule with the timezone-safe model and write idempotently;
   - make worker jobs bounded and lease-safe;
   - review migrations, and keep completed history immutable;
   - add no paid services.
5. **Tests** (JITM-12 §2). Add or extend unit and integration tests for the behavior and browser tests for the workflow. Run the relevant suites and compare failures with an `origin/main` baseline.
6. **Record.** Write or update the implementation record when the change is release-worthy (JITM-15 §2). Update the JITM-01 §2.22 feature map when a feature's status changes.
7. **Pull request** (JITM-13 §2). Use the template, cite rules, and list NOT RUN items. Kevin merges. Releasing is a separate task (WF-06).

## Evidence to produce

- The concept-fit statement.
- The workflows changed.
- Tests added and the suite results against the baseline.
- Migration notes, if any.
- A NOT RUN list.

## Done when

- The behavior works in its workflow end to end.
- The tests cover it.
- The standards and the record match the new behavior.

## Stop and ask Kevin when

- The feature changes the product promise, access, pricing, sending behavior or data retention.
- A documented workflow rule would change.
- A migration is destructive.
- The feature would need a paid service.

## Changelog

- 1.0.0 — 2026-09-28 — Initial version.
