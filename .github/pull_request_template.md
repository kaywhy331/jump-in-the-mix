<!-- Jump in the Mix PR checklist (docs/standards/README.md). Delete lines that do not apply; keep NOT RUN. -->

## What and why

<!-- One paragraph. Link the task, issue or owner decision. -->

## Standards, skills and workflow

- Workflow and skills used:
- Standards applied (cite rules, for example JITM-06 §2.1):
- Owner decisions touched or needed (none, or what Kevin must decide):

## Evidence

Label each item VERIFIED (how), INFERRED (from what), NOT RUN (why) or BLOCKED (by what), per JITM-12 §2.1.

- [ ] `npm run standards:check` (when docs/standards, skills or AGENTS.md changed)
- [ ] Typecheck, unit tests and the relevant browser suites, compared with an origin/main baseline for failures that already exist (JITM-12)
- [ ] Production build
- [ ] UI changed: screenshots per JITM-12 §2.18, compared with the export screen; keyboard and 200% text checked (JITM-10)
- [ ] Copy changed: vocabulary per JITM-05; claims ledger (claim → proof → status) and persuasion floor per JITM-04
- [ ] Schema or data changed: migration reviewed per JITM-11 and the release plan per JITM-14
- [ ] Record written or updated per JITM-15

## NOT RUN

<!-- Every check above that was not run, and why. Write "None" only if everything was run. -->

## Rollout

- [ ] Docs or agent configuration only
- [ ] Needs a production release (JITM-14)
- [ ] Needs a migration

Kevin merges. An agent merges only with Kevin's explicit authorization for this pull request or a defined batch (JITM-16 §2.5).
