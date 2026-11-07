# Contact hierarchy — M5 S1 transplant

The November 7, 2026 M5 S1 task (`job_0fbbfdfc81bb`) transplants the reviewed UX-03 changes from PR #170, candidate `c9fb314ce089f050a3b4164c7da6f81eeb6a3582`, onto current main `dc44be9260b74dc9ef671a69db24013a487ab03d`. Only the candidate's diff from its main merge-base `70b6eff5d51673e4ba050591f237ea9ff80aa652` is reused; its old ancestry is not a base. The branch is `m5-s1-ux03-20261107` and independent QA is required before landing.

## Behavior

VERIFIED-CODE: The contact keeps identity, current stage and communication controls first, followed by lasting notes near Next, grouped Mixes, Recent activity and secondary details/history. Stage history shows recorded transitions, including returns, without synthesizing dates or future stages. Empty Coming up is omitted. The shared keyboard region and Journey link remain reachable.

VERIFIED-CODE: Current Mixes uses the existing enrollment reader and next-action projection. Completed rows require settled follow-ups or recorded finished runs without current work. Stopped/inactive rows remain separate. Archived Mixes appear only while an obligation remains and expose no reactivation controls. One-time follow-ups remain actionable outside Mix enrollment.

VERIFIED-CODE: Activity combines channel and event and distinguishes recorded completion from delivery. Phone formatting changes display only, using the workspace's saved phone region; stored values and existing tel/sms recipients are unchanged. Unparseable values retain their display. Pagination is omitted for zero or one page while the live result announcement remains.

## Preserved main behavior

Kevin's D44 wording is retained: the shared Today No Mix line and the profile description “No Mix has work to come for this person.” The glossary, `src/lib/contact-mix-status-labels.ts`, `e2e/no-mix-status.spec.ts` and `tests/contact-mix-status-labels.test.ts` remain byte-identical to the transplant base. The candidate's shorter No Mix wording and exact-count assertions are excluded.

Main's workspace-scoped personal Mix filter and Contacts intake-review link are retained. Scheduling, outcomes, Undo, stop/remove semantics, tenancy boundaries and saved preferences remain governed by their existing readers and actions. No schema, worker or sending change is included.

## Design and verification

Visual references are Contact/DarkContact, Contacts/DarkContacts and DesktopContacts/DarkDesktopContacts in the existing export. The approved UX-03 hierarchy departure uses the Contacts workspace archetype, semantic tokens and shared controls. It follows JITM-06 §2, JITM-07 §2.13/2.17, JITM-08 §2.19, JITM-09 §2.32/2.76–2.79, JITM-10 §2.1–2.15, and JITM-12 §2.1–2.10.

Proposed alignment for the approved hierarchy: a contact profile separates current stage, active/waiting Mix work, completed work and recorded activity; notes sit near the next action; dated stage history lives under More and contains only recorded changes. This record does not amend standards or D44.

Validation evidence for this transplant belongs to its Hub task and `.artifacts/m5s1/REPORT.md`, with exact command, exit code and tested SHA. Earlier PR #170 runs are historical evidence only. The required checks are the three named unit files, six named browser files on desktop and mobile, the current CI browser selection in bounded batches, both themes/keyboard/320–1280px/200% text, `npm run check`, and `npm run standards:check`.

NOT RUN at the time this source record was written: transplant validation and independent QA. Final results are recorded in the task evidence. Production release and main push are outside this dispatch.
