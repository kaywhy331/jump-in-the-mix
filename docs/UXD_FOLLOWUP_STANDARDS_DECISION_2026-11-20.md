# UXD follow-up standards — decision record, November 20, 2026

This is the WF-08 record of the follow-up plan for the design checks UXD-01 to UXD-04. It writes the plan's answered questions and two measurement gaps into the standards, so that reviews and guard checks expect what the UXS slices build. It is docs only: no product code, copy, test or setting changes here, and nothing is deployed.

- Task: JITM-UXS-22 (Hub job_89d89a7de724), slice UXS-22 of PLAN-JITM-UXD (job_c37e6ef21167, plan note note_e0de5d40a47567d8), as revised by PLAN-JITM-UXD-R1 (job_d3b3ab87f32e).
- Findings: UXD-01 staff pages (job_6e19f0701510), UXD-02 server replies and write flows (job_5d4647713488), UXD-03 modes and states (job_66e7dd7bdd54) and UXD-04 throttled cold-cache speed (job_d3ed25c1a517). The plan maps every finding to a slice in note_3e41f74982e612c5 and note_c18b6c0bbf72b8ad.
- Base: `origin/main` a7b8316, after JITM-NAV-00 (7e1224c), which owned the same files first.

## Who decided

Kevin's standing instruction of 2026-10-16 covers routine choices: "Kevin always takes the recommended option, so never leave work waiting for his reply to a choice. Take the option you would mark (Recommended) when it stays inside the task's approved scope." Under it, and his preapproval note_e5208e4ff65c9841, the Fleet Control lease holder took the plan's recommendations as defaults on 2026-11-10 (note_ce756902c7676795). Kevin has not answered these questions himself, so they are agent defaults under JITM-15 §2.12: the standards tag them `[PROPOSED]` and cite this record as `[SOURCE]`, not `[OWNER]`. Kevin may override any of them; his answer then gets a `D<n>` entry in the owner decision log.

## Numbered defaults

1. **Q1 (UXD-02 F-13): Undo after a contact import or a Journey Start.** Default A: the success notice offers Undo for 10 seconds, as JITM-08 §2.5 already asks of reversible actions. The import's Undo archives only the contacts that import created; contacts it updated are not reverted, and the notice says so. A Start's Undo runs the existing "Stop this work". Alternative B, "Stop this work" as the only recovery, was not taken. Applied in JITM-08 §2.5. Built by UXS-21 (job_3e760bd7c8be).
2. **Q2 (UXD-02 F-10): focus after a save.** Default: the recommendation. A save that lands on another route focuses that route's H1, as JITM-10 §2.23 already says; a save that returns to the same page with only a query change, such as `/calendar?saved=1` or `/settings/notifications?testAccepted=1`, focuses the confirmation notice it shows (a programmatic target, `tabIndex -1`). Alternatives, always the notice or always the H1, were not taken. Applied in JITM-10 §2.23. UXB-03 (job_a2a12aba8e5a) builds the route case; UXS-01 (landed) and UXS-19 (job_6f68e442c4b2) build the Calendar and Start cases.
3. **Q3 (UXD-03 D-06): touch screens wider than 900px.** Default yes: "desktop" in JITM-10 §2.1 means a fine pointer, so under a coarse pointer every owner control is 44px at every width. The alternative, keeping the width rule and fixing only "Choose a person", was not taken; UXS-19 fixes that control either way. Applied in JITM-10 §2.1. Built by UXS-20 (job_8fae8e321ef3).
4. **Q4 (UXD-01 S-11): the staff library's name.** "Library", already decided in note_241cf736b5fc3399. No rule changes here; UXS-04 (job_78676c8fd98d) applies it.
5. **Q5 (UXD-01 S-02): the "Admin · " title prefix.** Default: drop it, because JITM-10 §2.22 already makes the title's page part match the H1. The alternative, amending §2.22 to allow a staff prefix, was not taken, so no rule changes. UXS-04 applies it.
6. **Q6 (UXD-02 F-08): contact name length.** Default: 120 characters for first name, last name and company, as one named constant shared by the form, the server and import. Existing longer names stay readable and editable. The alternative, 160 like an event title, was not taken. Applied in new JITM-08 §2.50. Built by UXS-18 (job_314157a7fa44).

Not taken as defaults:
- **Q7 (UXD-03 D-08b): should a typed draft survive a same-account sign-in after an expiry?** Sign-in and privacy behaviour needs Kevin's explicit word. The lease holder's recommendation, applied until he answers, is B: no change, so a draft lives only while the masked tab stays open (note_473eb221f4759f60, after the blind second opinion job_1e87ff0f1bbb). JITM-08 §2.30 is unchanged and no slice is filed for A.
- **Q8 (UXD-04 S1): the server-confirmed first paint.** It is the existing owner question on UXB-08 (job_e0ae7b318010). JITM-10 §2.25 keeps that design with UXB-08.

## Gaps the findings named

Two gaps had no question, because the plan routed them straight to this slice:
- **Staff text (UXD-01 S-14).** JITM-10 §2.2's 13px floor named owner screens only, so staff header text at 9–12px broke no rule. §2.2 now covers staff screens; UXS-06 (job_009e3d04c0f5) builds it.
- **App speed measurement (UXD-04).** On four of the five app routes, the first paint is the "Checking your account…" card, so lab LCP reports the card and reads 0.3–0.6 s early. Lighthouse's Total Blocking Time starts at first contentful paint, so on the app routes it reported 5–53 ms where blocking counted from navigation start was 316–601 ms. JITM-10 §2.25 now says that on such a route LCP is the content reveal and blocking time counts from navigation start; new JITM-12 §2.27 says how to measure and report both with `npm run test:app-reveal`, which UXS-12 shipped (da89b1e).

## Readings taken while writing

1. **Staff targets stay with JITM-07 §2.14.** D9 says staff screens "use 44px rows on touch", and JITM-07 §2.14 measures touch as 760px and below. Q3's fine-pointer reading is about owner screens. Whether a staff screen under a coarse pointer wider than 760px uses 44px rows is listed as open in JITM-10 §6; JITM-07 is not part of this slice.
2. **Blocking time** is the sum, over long tasks, of each task's time past 50 ms (the Long Tasks definition), from navigation start to the reveal frame, as the shipped measurement computes it (`scripts/measure-app-reveal.mjs:97-100` at da89b1e).
3. **The Undo window** for an import or a Start is §2.4's 10 seconds; the notice's wording goes through the copy workflow (WF-03) when UXS-21 builds it.
4. **Same-page saves:** a page change that only adds a hash, such as `#calendar-connections`, also counts as the same page.

## What changes

| Standard | Rule | Change | Version |
| --- | --- | --- | --- |
| JITM-08 | §2.5 | A contact import and a Journey Start are reversible: Undo for 10 s, with what each Undo does (Q1). | 3.1.0 → 3.2.0 |
| JITM-08 | §2.50 (new) | Contact name fields hold at most 120 characters, from one shared constant; long names wrap (Q6). | |
| JITM-08 | §6 | Q1 and Q6 are decided by default and not built. | |
| JITM-10 | §2.1 | Desktop means a fine pointer; under a coarse pointer, owner controls are 44px at every width (Q3). | 2.3.0 → 3.0.0 |
| JITM-10 | §2.2 | The 13px floor covers staff screens (S-14). | |
| JITM-10 | §2.23 | A save that stays on its page focuses its confirmation notice (Q2). | |
| JITM-10 | §2.25 | App LCP is the content reveal when a gate card paints first; blocking time counts from navigation start (UXD-04). | |
| JITM-10 | §6 | Each open UXD finding with its owner; the staff-target question; the skill wording. | |
| JITM-12 | §2.27 (new) | How app reveal and blocking time are measured and reported (UXD-04). | 3.1.0 → 3.2.0 |
| JITM-12 | §6 | The four UXD checks are done; their open findings are listed in the drift baseline. | |
| Drift baseline | Design audit section | A table of every UXD finding, its owner and its status at a7b8316. | |

JITM-10 takes a major bump because §2.1 and §2.2 now apply to more screens. The glossary, the copy standards and the routing are unchanged.

## Dependents not changed

- **Skills.** `jitm-review` and `jitm-ui-change` still say the 13px floor applies "on every owner screen". They cite JITM-10 §2.1–§2.2, which now wins (JITM-00 §2.12). Changing agent instructions needs Kevin's word, so the wording is a follow-up, not part of this docs-only slice.
- **Workflows, the router and the PR template** need no change.

## Product changes (WF-08 step 6)

Each rule is decided, not built. The building slices are already filed: UXS-04, UXS-06, UXS-18, UXS-19, UXS-20 and UXS-21, plus UXB-03 for route focus. No new product task is needed.

## Verification

- `npm run standards:check` on the commit: see the task report for the exit code and SHA.
- No product file changed, so the test suites, the build and the browser checks are NOT RUN, on purpose.

## Merge authority

The task's landing instruction (Ship-fast item 5; Kevin's word of 2026-11-05, Hub note_6255da80fe45363c) lands this docs-only change on `main` under JITM-16 §2.5, by a fast-forward git push through the repository's deploy key after the self-check. No pull request, other ref, force push or deploy. QA: none, as the plan sets for this slice.
