---
id: WF-08
title: Standards amendment
status: active
version: 1.0.1
owner: Kevin
last_reviewed: 2026-09-28
standards: [JITM-00, JITM-15, JITM-16, JITM-17]
skills: [jitm-standards-update]
---

# WF-08 — Standards amendment

**Trigger:** any of these:
- Kevin makes or changes a product, design, voice, workflow or process decision;
- a standard is missing, wrong or in conflict;
- a review or audit proposes a new rule.

**Inputs:** the decision, with its date and Kevin's words, and the standards index.

## Steps

1. **Capture the decision:** the date, a short quote of Kevin's words, and the context. Add it to the owner decision record, or to the dated record for the task (JITM-15 §2).
2. **Find the rule's home.** Use the "Governs" column in the index and each standard's §1. A topic has exactly one home (JITM-00 §2).
3. **Edit the home rule.**
   - Tag it `[OWNER <date> <ref>]` only when Kevin made the decision; otherwise tag it `[PROPOSED]`, `[SOURCE <path>:<line>]` or `[SHIPPED <sha> <path>:<line>]` (JITM-15 §2.11, §2.12).
   - Give a new rule the next free number in its section. Never renumber existing rules; retire a rule in place (JITM-17 §2.16).
4. **Version the standard:** bump the version (major, minor or patch per JITM-17 §2.3), update `last_reviewed` and add a changelog line.
5. **Update dependents** in the same pull request: skills, workflows, the routing in `AGENTS.md`, the PR template and superseded-document banners.
6. **Split out product changes.** If the decision changes shipped behavior or copy, open a separate task for the product change unless Kevin asked for both together (a feature Kevin approved under WF-04 counts as both together).
7. **Check:** run `npm run standards:check`.
8. **Pull request:** open it with the decision quoted. Kevin merges, or an agent merges with his explicit authorization (JITM-16 §2.5).

## Evidence to produce

- The decision quote and its date.
- The diff of the home rule.
- The version and changelog lines.
- The `standards:check` result.

## Done when

- The rule, skills, routing and changelog all reflect the decision.
- The check passes.

## Stop and ask Kevin when

- The decision conflicts with JITM-00.
- The decision is ambiguous.
- The decision would require renumbering or removing rules that are cited elsewhere.

## Changelog

- 1.0.0 — 2026-09-28 — Initial version.
- 1.0.1 — 2026-09-28 — Base 61d4df4. Merging follows JITM-16 §2.5 (D30).
