# Source register — JITM standards audit (2026-09-28)

This register classifies every documentation source in the Jump in the Mix repository as it stands on `origin/main` at `9439fd6`, the commit serving production on 2026-09-28. It covers 182 tracked files (9 root text and Markdown files, 10 files in `assets/`, 139 files directly in `docs/` and 24 in `docs/design/`), the seven evidence folders as grouped rows, and the files that exist only in the owner's local checkout. Each row gives the path from the repository root and the date of its last change on `main`. **Type** says what kind of document it is. **Status** is `current`, `partly superseded`, `superseded` (the replacing decision or document is named in brackets), `historical` (a dated record of events) or `unclear` (the note says why). **Absorbed by** names the JITM standards (JITM-00 to JITM-17) expected to carry the document's lasting rules; `— (operational; stays as is)` marks runbooks that the standards will only link to, and `—` marks history with nothing to absorb. Notes have at most 20 words. D-numbers refer to the owner decisions answered on 2026-09-28, all with the recommended option. The register is evidence for the standards program, not an authority: it records what each document says and how it stands, and it changes no rule by itself. Paths are written as code rather than links, so the register reads the same wherever it is filed.

## Summary

### Counts

Tracked on `main`: 182 files. Local-only: the 13 files in the input list, plus 3 more found during this pass (listed separately and not counted below).

By type:

| Value | Tracked files | Local-only files |
| --- | ---: | ---: |
| authority | 6 | 0 |
| owner-decision record | 15 | 0 |
| implementation record | 35 | 1 |
| release record | 22 | 3 |
| audit | 17 | 1 |
| proposal | 11 | 3 |
| runbook/operations | 41 | 0 |
| reference/asset | 13 | 2 |
| archived stub | 5 | 0 |
| evidence/data | 2 | 3 |
| template | 2 | 0 |
| product doc (README-like) | 13 | 0 |
| **Total** | **182** | **13** |

By status:

| Value | Tracked files | Local-only files |
| --- | ---: | ---: |
| current | 76 | 3 |
| partly superseded | 27 | 0 |
| superseded | 14 | 0 |
| historical | 65 | 10 |
| **Total** | **182** | **13** |

Evidence folders: six are evidence/data and historical. `docs/design/jump-in-the-mix-designs/` is the supplied design export, which remains the visual authority outside Journey (D4), so it is classified as a current reference asset, not as evidence.

### Documents that claim authority

Exact wording and line numbers on `main`. Quotes keep each claim's visible words; link targets are omitted so this register carries no relative links, and one third-party name is withheld (D7). "Standing" is this register's reading of each claim against the 2026-09-28 decisions.

| Where | Exact claim | Standing |
| --- | --- | --- |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:3` | "**Status:** Active implementation contract" | Superseded as authority (D3). |
| `docs/CANONICAL_PRODUCT_DECISIONS.md:8` | "This is the single source of truth for the product. Older specifications are historical context only. When code, copy, tests, or another document disagrees with this file, this file wins." | Superseded as authority (D3); its customer-language table is superseded (D1). |
| `README.md:5` | "The active product contract is docs/CANONICAL_PRODUCT_DECISIONS.md." | Stale pointer (D3). |
| `docs/IMPLEMENTATION_STATUS.md:3` | "**Source of truth:** Canonical product decisions" | Stale pointer (D3). |
| `docs/AMBIGUITIES_RESOLVED.md:5` | "Use Canonical product decisions as the sole product contract" | Stale pointer (D3). |
| `docs/PRODUCT_SPEC.md:5` | "The current product contract is Canonical product decisions. Do not implement behavior from this archived file." | Pointer stale (D3); the archive notice still holds. |
| `docs/SINGLE_USER_PRODUCT_SCOPE.md:5` | "The hosted phone-first small-business CRM and its secondary self-hosted edition are defined in Canonical product decisions. Do not use this file to make product or navigation decisions." | Pointer stale (D3); the archive notice still holds. |
| `docs/SINGLE_USER_PORT_MATRIX.md:5` | "Use Canonical product decisions, Hosted deployment, and Pilot runbook." | First pointer stale (D3). |
| `docs/UX_WORKFLOW_OPTIMIZATION.md:3`, `:7` | "Current interaction decisions live in Canonical product decisions." / "Release review should enforce these budgets:" | Pointer stale (D3); the interaction budgets are for JITM-08. |
| `CONTRIBUTING.md:63`, `:70` | "Use the canonical terms consistently:" (Important Date, Mix, Step, Jump) / "Do not reintroduce the legacy terms Campaign, Connect, or Connected in customer-facing copy." | Superseded (D1, D3). |
| `AGENTS.md:13` | "All testing and staging deployments must publish to https://jump-in-the-mix-test.netlify.app/" | Retired (D5); line 17 of the same file says the site no longer answers. |
| `AGENTS.md:17` | "Every deployed commit carries an annotated tag `prod-<date>-<sha7>`" … "Each release has a record under `docs/`" | Still the practice; for JITM-14 and JITM-15. The beta audit found `4b5abd8` without tag or record. |
| `AGENTS.md:21` | "All new or changed UI must follow the supplied design export and the implementation guidelines." … "The export takes precedence when derived guidelines describe a conflicting layout" | The export stands outside Journey (D4); the guidelines are superseded as authority (D3). |
| `AGENTS.md:25` | "consult the asset reference index, the relevant ICP profiles and the supplied [third-party author's name withheld] guidance when available." | Conflicts with D7; the references stay local-only (D6). |
| `AGENTS.md:27` | "Use the homepage experience roadmap for the implementation sequence and completion criteria." | The roadmap is partly superseded (09-11 revert; 09-22 onboarding order). |
| `docs/design/DESIGN_GUIDELINES.md:3` | "The supplied design export is the visual authority for the homepage and webapp." … "When these derived guidelines disagree with the export, the export governs visual composition." | Guidelines superseded as authority (D3); the export stands outside Journey (D4). |
| `docs/design/DESIGN_GUIDELINES.md:5` | "This requirement supersedes the stage-centered Journey composition in the export and the current-implementation Journey layout notes below." | Consistent with D4. |
| `docs/design/DESIGN_GUIDELINES.md:9` | "It supersedes earlier analysis that deferred outcome branches or rejected all return connections." | Consistent with D4. |
| `docs/design/DESIGN_GUIDELINES.md:35` | "This supersedes the export’s edit/preview/record progress labels for the demo only" | Stands (owner demo contract of 09-19). |
| `docs/design/DESIGN_CORRECTION_2026-09-19.md:3` | "The original design export remains unchanged and is the visual authority." | Consistent with D4 outside Journey. |
| `docs/design/DESIGN_FOLLOWTHROUGH_2026-09-20.md:3` | "The original export remains the visual authority" | Consistent with D4 outside Journey. |
| `docs/design/DESIGN_REVIEW_2026-09-20.md:3` | "The original export remains unchanged and authoritative" | Consistent with D4 outside Journey. |
| `docs/design/DESIGN_PAGE_REVIEW_2026-09-20.md:3` | "The export and design guidelines remain the standing UI authority in `AGENTS.md`." | Guidelines part superseded (D3). |
| `docs/design/DESIGN_ADOPTION_2026-09-19.md:5` | "AGENTS.md now requires future UI changes to follow it and DESIGN_GUIDELINES.md." | Guidelines part superseded (D3). |
| `docs/UI_UX_WORKFLOW_AND_ICON_AUDIT_2026-09-22.md:5` | "because AGENTS.md gives the export precedence" | Descriptive; consistent with D4 outside Journey. |
| `docs/JOURNEY_DYNAMIC_WORKFLOW_CONTRACT_2026-09-21.md:5` | "Where those documents previously restricted branching or rejected all loops, this clarification takes precedence." | Stands (D4). |
| `docs/CLOSEOUT_CHECKPOINT_2026-09-06.md:25` | "Preserve the manual device matrix as the authority for physical-device results" | Stands; the matrix is still the only device ledger. |
| `docs/PRODUCT_QUALITY_GATES.md:26` | "Keep the manual device matrix authoritative" | Stands. |
| `docs/LAUNCH_READINESS_VALIDATION_2026-07-18.md:5` | "Current release evidence must come from the latest GitHub Actions run, the migration and encrypted-restore rehearsals, the hosted smoke test, and the completed rows in Manual device qualification." | Evidence sources to be restated by JITM-12 and JITM-14 (D5). |
| `docs/HOMEPAGE_READINESS_RECONCILIATION_2026-09-18.md:3` | "The release record and individual audit checklist govern this release's implementation, verification and live status" | Scoped to the 09-18 release; historical. |
| `docs/PRODUCT_READINESS_HANDOFF_2026-09-12.md:3` | "Sources are linked so the runbook stays canonical." | Runbooks stay operational references. |
| `docs/BETA_READINESS_AUDIT_2026-09-26.md:479` | "The code wins in each case; each is a documentation fix unless noted." | A drift-triage rule; candidate for JITM-15 and JITM-17. |
| `assets/README.md:21` | "Preserve these originals and use them for all Jump in the Mix copywriting and marketing strategy" | The originals are local-only third-party files: kept out of Git (D6), used only as a clean-room distillation (D7). |
| `assets/README.md:32` | "A newer verified product fact takes precedence over an older proposal's feature or pricing assumption." | Consistent with D11. |
| `docs/ADMIN_CONTROL_PLANE.md:3` | "**Current implementation reference.**" | Still accurate as a feature reference. |
| `docs/CONVERSION_COPY.md:13` | "use the September 10 matrix for current copy" | The matrix itself was partly superseded on 09-12. |

Statements that retire or replace other documents:

- `docs/ADMIN_OPERATIONS_INFRASTRUCTURE_PLAN.md:4`: "This document replaces the earlier referral-only/no-waitlist decision."
- `docs/ONBOARDING_INVITATIONS_2026-09-17.md:3`: "It supersedes the earlier five-invitation, application-email personal referral flow."
- `docs/MIX_HANDOFF_AND_JOURNEY_PROPOSAL_2026-09-21.md:7`: "This supersedes the initial proposal's stage-centered map and the stage-centered Journey composition in the supplied export."
- `docs/JOURNEY_THREE_PANES_2026-09-21.md:3`: "This supersedes the older Journey pane composition"
- `docs/ONBOARDING_JOURNEY_PREFERENCES_2026-09-22.md:5`: "The owner's newer direction supersedes the homepage roadmap's original one-person-first onboarding sequence"
- `docs/design/DEMO_WORKSPACE_2026-09-19.md:10`: "The owner’s new three-Beat contract supersedes the export’s edit/preview/record sequence."
- `docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:20`: "**Superseded on September 28.**" (position numbering replaced by A1 and A1.a labels)
- `docs/PRODUCTION_PROMOTION_HANDOFF_2026-09-15.md:3`: "Historical promotion record." … "supersedes the pending-authorization and qualification statements below"
- `docs/PR78_QUALIFICATION_2026-09-16.md:3`: "Earlier authorization-pending statements in the incident handoff are superseded for that scope."
- `docs/design/DESIGN_ADOPTION_2026-09-19.md:3`: "**Historical report:** the subsequent gap analysis found that this pass overstated visual completion."
- `docs/design/DESIGN_GAP_ANALYSIS_2026-09-19.md:3`: "Keep this audit as the baseline rather than treating its present-tense findings as the current status."

### Dead relative links

Checked: every inline and reference-style Markdown link in the root `*.md` files, `assets/README.md` and `docs/*.md`, resolved against the linking file's directory on a clean checkout of `9439fd6`. External URLs and in-page anchors were not checked. Result: 23 broken links in 11 files, in four groups.

1. **Local-only third-party references** (filenames withheld under D7), 8 links:
   - `assets/README.md:25` and `:26`
   - `docs/HOMEPAGE_COPY_AND_CLAIM_MATRIX_2026-09-10.md:26` (2 links)
   - `docs/HOMEPAGE_HEADLINE_REVIEW_2026-09-10.md:7` (2 links)
   - `docs/UI_UX_PRODUCT_READINESS_AUDIT_2026-09-18.md:2458` (2 links)
2. **Local-only project documents**, 4 links:
   - `docs/CONTRACTOR_UX_IMPLEMENTATION_2026-09-22.md:5` → `USER_JOURNEY_FORENSIC_AUDIT_2026-09-22.md` and `CONTRACTOR_UX_APPROACH_2026-09-22.md`
   - `docs/ONBOARDING_INVITATIONS_2026-09-17.md:40` → `ONBOARDING_DEPLOYMENT_2026-09-17.md`
   - `docs/UI_UX_WORKFLOW_AND_ICON_AUDIT_2026-09-22.md:3` → `CONTRACTOR_UX_PRODUCTION_RELEASE_2026-09-22.md`
3. **The git-ignored `.artifacts/` evidence folder**, 5 links:
   - `docs/CONTRACTOR_UX_IMPLEMENTATION_2026-09-22.md:40`
   - `docs/JOURNEY_EXPERIENCE_FORENSIC_REVIEW_2026-09-21.md:294` (2 links)
   - `docs/UI_ICONS_PRODUCTION_RELEASE_2026-09-23.md:72`
   - `docs/UI_UX_WORKFLOW_AND_ICON_IMPLEMENTATION_2026-09-22.md:77`
4. **Source files removed or never committed**, 6 links:
   - `docs/HOMEPAGE_HEADLINE_REVIEW_2026-09-10.md:14` and `:15` → `src/components/marketing/MarketingSandbox.tsx` and `MarketingExperience.tsx`, which never entered Git history
   - `docs/JOURNEY_EXPERIENCE_FORENSIC_REVIEW_2026-09-21.md:284` and `docs/MIX_HANDOFF_AND_JOURNEY_PROPOSAL_2026-09-21.md:169` → `src/components/JourneyMap.tsx` and `src/lib/journey-map-layout.ts`, old Journey components since removed

Also checked, beyond the requested scope: `docs/design/*.md` has 40 broken links in 10 files. Of these, 38 point into `.artifacts/` (16 in `CONTACTS_FORENSIC_AUDIT_2026-09-19.md`, 9 in `DESIGN_GAP_ANALYSIS_2026-09-19.md`), and 2 point to removed Journey components (`DESIGN_GAP_ANALYSIS_2026-09-19.md:50`).

### Other findings

- **Three more local-only files.** `docs/mixes/` holds the supplied industry Mix library (three files). It is untracked, not ignored and on no branch, and it was not in the input list. It is listed under the local-only sources with hashes; the local-only `docs/INDUSTRY_MIX_AUDIT_2026-09-17.json` records the same three SHA-256 values.
- **Release order.** `docs/OPERATIONS_READINESS.md:58` lists "ready web → ready worker"; `AGENTS.md:17` and `docs/PR78_PRODUCTION_PROMOTION_DECISION_2026-09-16.md:41` deploy the worker first. JITM-14 should state one order.
- **Stale trackers and pointers.** `README.md:22` says current verification is tracked in `docs/PRODUCT_COMPLETION.md`, whose checkpoints stop at 2026-09-10. `README.md:28`, `docs/HOSTED_DEPLOYMENT.md:5` and the "Private test site" section of `docs/CUSTOMER_JOURNEY_AND_CONNECTIONS.md` still point to Netlify (D5).
- **Stale status lines.** At least six current runbooks still open with "implemented locally" or "production pending": `ADMISSION_CONTROLS`, `EMAIL_OPERATIONS`, `LIBRARY_ADMINISTRATION`, `STAFF_ACCESS`, `USER_ADMINISTRATION` and `WAITLIST_OPERATIONS` (all in `docs/`).
- **Clean-room (D7).** Fourteen tracked register files name a third-party copywriting author or cite that author's publisher: `AGENTS.md`, `assets/README.md`, `assets/Jump_in_the_Mix_Brand_Search_Conversion_Strategy.md`, `assets/jump-in-the-mix-homepage-ui-ux-blueprint.md`, and in `docs/`: `BETA_READINESS_AUDIT_2026-09-26`, `CONVERSION_COPY`, `HOMEPAGE_COPY_AND_CLAIM_MATRIX_2026-09-10`, `HOMEPAGE_EXPERIENCE_ROADMAP_2026-09-10`, `HOMEPAGE_HEADLINE_REVIEW_2026-09-10`, `HOMEPAGE_IMPLEMENTATION_ACCEPTANCE_2026-09-10`, `HOMEPAGE_READINESS_RECONCILIATION_2026-09-18`, `MEGA_MIXES_2026-09-22`, `PRODUCT_COMPLETION` and `UI_UX_PRODUCT_READINESS_AUDIT_2026-09-18`. Four files in the evidence folders do the same. `docs/SALES_PLAN_LIBRARY_2026-09-05.md` names third-party sales methods and their authors, as does the product source `src/lib/sales-approaches.ts`. Under D7 these documents stay as history, and no standard, skill or new document may carry the names. This register names none of them.

## Root and assets

| Path | Last change | Type | Status | Absorbed by | Note |
| --- | --- | --- | --- | --- | --- |
| `00_START_HERE.txt` | 2026-07-15 | product doc (README-like) | current | — (operational; stays as is) | Plain-text local Docker quick start for Windows, macOS and Linux, with the local demo sign-in. |
| `AGENTS.md` | 2026-09-24 | authority | partly superseded (D3, D5, D7) | JITM-06, JITM-14, JITM-16 | Agent router: design-export authority and Render release rules. Netlify staging rule retired (D5); names a third-party author. |
| `CLAUDE.md` | 2026-09-04 | authority | current | JITM-16 | One-line import of AGENTS.md for Claude Code sessions. |
| `CONTRIBUTING.md` | 2026-07-15 | authority | partly superseded (D1, D3) | JITM-05, JITM-11, JITM-12, JITM-13 | Product-language and branch/commit sections superseded; local start, PR checks, database and security rules remain. |
| `EASY_START_RELEASE_NOTES.md` | 2026-07-15 | release record | historical | — | July easy-start delivery notes for local reviewers; mentions the retired Plus-tier demo and AI Mix Wizard. |
| `README.md` | 2026-09-12 | product doc (README-like) | partly superseded (D1, D3, D5) | JITM-01, JITM-14 | Product overview. Names CANONICAL as contract, links the Netlify guide, says Plans, and cites the stale completion ledger. |
| `SECURITY.md` | 2026-09-25 | product doc (README-like) | current | — (operational; stays as is) | Public vulnerability-reporting policy and safe harbour; maintainers keep security.txt and the /security page in step. |
| `START_HERE.md` | 2026-09-04 | product doc (README-like) | current | — (operational; stays as is) | Local Docker start, stop, reset and doctor guide; demo text uses legacy terms (Important Dates, Jumps). |
| `WINDOWS_DOCKER_FIX.md` | 2026-07-15 | runbook/operations | current | — (operational; stays as is) | Recovery steps for the Windows Docker Desktop/WSL engine error seen by the local launcher. |
| `assets/ICP - Independent Operations Consultant - Daniel Mercer.md` | 2026-09-11 | reference/asset | current | JITM-02 | Fictional independent-consultant ICP hypothesis (#2); its AI, voice and QR section discusses unshipped features. |
| `assets/ICP - Independent Recruiter - Lauren Mitchell.md` | 2026-09-11 | reference/asset | current | JITM-02 | Fictional specialist-recruiter ICP hypothesis (#5): two-sided network and discretion needs; embeds third-party stock images. |
| `assets/ICP - Painter Contractor - Marcus Reed.md` | 2026-09-11 | reference/asset | current | JITM-02 | Fictional painting-contractor ICP hypothesis (#4): open estimates lost to job-site interruptions; embeds a third-party stock image. |
| `assets/ICP - Photographer - Elena Brooks.md` | 2026-09-11 | reference/asset | current | JITM-02 | Fictional wedding and portrait photographer ICP hypothesis (#3): unfinished pricing conversations; embeds a third-party stock image. |
| `assets/ICP - Real Estate Agent - Maya Bennet.md` | 2026-09-11 | reference/asset | current | JITM-02 | Fictional solo real-estate ICP, the recommended first segment; filename says Bennet, profile says Bennett. |
| `assets/Jump_in_the_Mix_Brand_Search_Conversion_Strategy.md` | 2026-09-12 | proposal | current | JITM-02, JITM-03, JITM-04 | Version 1.0 category, brand and search strategy; applied selectively on 09-12; cites third-party copywriting sources. |
| `assets/PRD Voice.md` | 2026-09-09 | proposal | partly superseded (VOICE_PRD_REVIEW) | JITM-01 | Example paid assistant-and-voice tier PRD; scope narrowed by the voice review; its price is proposal-only (D11). |
| `assets/README.md` | 2026-09-12 | reference/asset | current | JITM-02, JITM-04 | Index of ICPs and copy references; its two links to local-only third-party files are dead; wording preserved (D7). |
| `assets/jump-in-the-mix-homepage-ui-ux-blueprint.md` | 2026-09-11 | proposal | partly superseded (09-11 revert; demo contract 09-19) | JITM-02, JITM-04, JITM-09 | Five-chapter homepage concept; its 09-10 build was reverted on 09-11; cites a third-party copywriting source. |
| `assets/logo.png` | 2026-09-09 | reference/asset | current | JITM-03 | Approved 1000×1000 source logo; derived icons are generated from it (see docs/BRAND_ASSETS.md). |

## docs/

| Path | Last change | Type | Status | Absorbed by | Note |
| --- | --- | --- | --- | --- | --- |
| `docs/ACCOUNT_EXPORT_INVENTORY_2026-09-22.md` | 2026-09-25 | implementation record | current | JITM-11 | Maps owner data to JSON and CSV export sections; adds the Release C-1 streamed-export notes (09-25). |
| `docs/ADMIN_CONTROL_PLANE.md` | 2026-09-16 | product doc (README-like) | current | JITM-09, JITM-11 | Self-described current implementation reference: admin navigation, permissions, MFA step-up and operations. |
| `docs/ADMIN_DENSITY_2026-09-17.md` | 2026-09-17 | implementation record | historical | JITM-07 | Admin density revision; 1366×768 above-the-fold acceptance criterion; verification and release validation. |
| `docs/ADMIN_MFA.md` | 2026-07-18 | runbook/operations | current | — (operational; stays as is) | Administrator MFA policy, environment settings, enrollment, recovery, session events and audit. |
| `docs/ADMIN_OPERATIONS_INFRASTRUCTURE_PLAN.md` | 2026-09-09 | proposal | partly superseded (ONBOARDING_INVITATIONS_2026-09-17) | JITM-01, JITM-09, JITM-11 | 09-08 waitlist, referral and admin plan; its five-invitation rule is now three invitations. |
| `docs/ADMIN_REPORTS.md` | 2026-09-09 | runbook/operations | current | — (operational; stays as is) | Admin report definitions, exclusions, background exports and saved daily reports. |
| `docs/ADMIN_UX_AUDIT_2026-09-16.md` | 2026-09-16 | audit | historical | JITM-08, JITM-09 | 25 admin routes audited at e52eea3; recommends task-based navigation and shared screen patterns; implemented 09-16. |
| `docs/ADMIN_UX_IMPLEMENTATION_2026-09-16.md` | 2026-09-16 | implementation record | historical | JITM-17 | Admin audit checklist A01–A26 and X01–X05 with evidence; validated on the retired Netlify test site. |
| `docs/ADMIN_UX_RELEASE_2026-09-16.md` | 2026-09-16 | release record | historical | — | Admin UX release (PR #80) to the Netlify test site, with deploy and rollback identifiers. |
| `docs/ADMISSION_CONTROLS.md` | 2026-09-16 | runbook/operations | current | — (operational; stays as is) | Operator setup for admission ceilings and pauses; its 'implemented locally' status line predates production. |
| `docs/ADMISSION_MFA_SAVE_FIX_2026-09-16.md` | 2026-09-16 | implementation record | historical | — | Regression evidence for admission saves lost across an MFA step-up, with the owner's manual steps. |
| `docs/AMBIGUITIES_RESOLVED.md` | 2026-09-04 | archived stub | superseded | — | Archived stub pointing to CANONICAL_PRODUCT_DECISIONS and HOSTED_DEPLOYMENT. |
| `docs/ANDROID_CONTACT_PICKER_QUALIFICATION.md` | 2026-07-18 | runbook/operations | current | — (operational; stays as is) | Manual Android Contact Picker test matrix; blocked pending a physical supported device. |
| `docs/APPEARANCE_INVITATIONS_RELEASE_2026-09-27.md` | 2026-09-26 | release record | historical | — | Appearance switch and invitation prompts live as a70e60c (PR #86); rollback target b6b9575. |
| `docs/AUDIT_RELEASE_A2_2026-09-25.md` | 2026-09-25 | release record | historical | JITM-08, JITM-11, JITM-14 | Release A2 c17cc80: build decisions (sheet focus, stale-save refusal, signed errors) and release-pipeline lessons. |
| `docs/AUDIT_RELEASE_B11_2026-09-25.md` | 2026-09-25 | release record | historical | JITM-04, JITM-11 | Release B11: signed-in pages show only signed error messages; lists reworded messages. |
| `docs/AUDIT_RELEASE_B_2026-09-25.md` | 2026-09-25 | release record | historical | JITM-11, JITM-14 | Release B f3a0a20: phone-number region keys, Google/Apple invitation sign-up, email limits; owner steps. |
| `docs/AUDIT_RELEASE_C1_2026-09-25.md` | 2026-09-25 | release record | historical | JITM-11 | Release C-1 34ffdae: request-path performance (session reads, push pass, streamed export, Marketplace refresh). |
| `docs/BETA_BLOCKERS_RELEASE_2026-09-26.md` | 2026-09-26 | release record | historical | JITM-01, JITM-14 | b6b9575 fixes four beta blockers; adopts defaults: automatic customer email off, finished follow-ups never return. |
| `docs/BETA_READINESS_AUDIT_2026-09-26.md` | 2026-09-26 | audit | historical | JITM-12, JITM-15, JITM-17 | NO-GO audit of 4b5abd8 (fixed in b6b9575); §11 lists document/code disagreements; names a third-party author. |
| `docs/BRAND_ASSETS.md` | 2026-09-09 | reference/asset | current | JITM-03 | Logo source, icon generation script, header sizing and cache versions; its 09-07 test-site receipt is historical. |
| `docs/BROWSER_E2E.md` | 2026-09-14 | runbook/operations | current | JITM-12 | Playwright suite coverage, projects and local execution for each specialist suite. |
| `docs/CANONICAL_PRODUCT_DECISIONS.md` | 2026-09-09 | authority | superseded (D3; D1 on language) | JITM-01, JITM-02, JITM-05, JITM-06, JITM-07, JITM-09, JITM-10, JITM-11, JITM-12, JITM-14 | Claims single source of truth. Language, four-item navigation, five invitations and session rules have drifted. |
| `docs/CHANNEL_VERSIONS_FOR_EVERY_BEAT_2026-09-23.md` | 2026-09-23 | owner-decision record | current | JITM-04, JITM-08 | Owner request: every Beat offers text, email and call versions with a Recommended tag; release notes. |
| `docs/CLOSEOUT_CHECKPOINT_2026-09-06.md` | 2026-09-09 | implementation record | historical | — | 09-06 closeout on a Netlify test deploy; remaining work; names the manual device matrix as authority. |
| `docs/CLOUDFLARE_SCHEDULER.md` | 2026-09-09 | runbook/operations | superseded (D5) | — | Prepared, never activated minute timer for the Netlify test site, which is retired. |
| `docs/CONTRACTOR_UX_IMPLEMENTATION_2026-09-22.md` | 2026-09-22 | implementation record | historical | JITM-09 | 13 contractor-workflow fixes; links two local-only source documents (dead); published to the retired test site. |
| `docs/CONTRACTOR_UX_IMPLEMENTATION_ACCEPTANCE_2026-09-22.csv` | 2026-09-22 | evidence/data | historical | — | Acceptance matrix U01–U20 with local verification evidence and limits. |
| `docs/CONVERSATION_STYLE.md` | 2026-09-09 | reference/asset | partly superseded (09-19 design adoption) | JITM-03, JITM-06 | Speech-bubble styles derived from the logo; restyled by the 09-19 design adoption; test-site receipts historical. |
| `docs/CONVERSION_COPY.md` | 2026-09-11 | implementation record | superseded (copy matrix 09-10; search strategy 09-12) | JITM-04 | 09-08 to 09-10 homepage copy decisions and claim limits; names a third-party author and links their site. |
| `docs/CUSTOMER_JOURNEY_AND_CONNECTIONS.md` | 2026-09-09 | product doc (README-like) | partly superseded (D4, D5) | JITM-09, JITM-11 | Stage rules, calendar and lead-intake connector guide; Journey view is now the graph; test-site section retired. |
| `docs/CUSTOMER_JOURNEY_IMPLEMENTATION_PLAN_2026-09-05.md` | 2026-09-09 | proposal | historical | — | 09-05 plan for stage journeys, calendar and intake; implemented, later reframed by the Journey graph (D4). |
| `docs/CUSTOMER_LOAD_QUALIFICATION.md` | 2026-09-09 | runbook/operations | current | — (operational; stays as is) | Authenticated load-smoke procedure with September 8–9 local observations for 512 MiB sizing. |
| `docs/DATABASE_HAND_WRITTEN_OBJECTS.md` | 2026-09-25 | reference/asset | current | JITM-11 | Hand-written indexes, triggers and CHECK constraints missing from the Prisma schema, as of Release B. |
| `docs/DATABASE_RELEASE_CHECKS.md` | 2026-09-09 | runbook/operations | current | JITM-14 | Release manifest, db:deploy, db:verify-release and health checks before a build serves traffic. |
| `docs/DATA_RETENTION.md` | 2026-09-10 | runbook/operations | current | — (operational; stays as is) | Private-data cleanup rules and worker pass; explicitly not proof of production qualification. |
| `docs/EMAIL_OPERATIONS.md` | 2026-09-25 | runbook/operations | current | — (operational; stays as is) | Email setup, free-tier headroom, sign-in limits, suppression and delivery-recovery procedures. |
| `docs/EXTERNAL_DATA_RETENTION.md` | 2026-09-10 | runbook/operations | current | — (operational; stays as is) | Production provider data inventory, retention and deletion-request handling. |
| `docs/FOLLOW_UP_PREPARATION_STORAGE_CONTRACT.md` | 2026-09-15 | proposal | current | JITM-11 | Draft, attempt and binding storage contract; header still says proposed, later sections record implementation. |
| `docs/FREE_TESTING.md` | 2026-09-14 | runbook/operations | superseded (D5) | — | Netlify Free plus Neon private test topology and worker timers; the test site is retired. |
| `docs/FULL_AUDIT_2026-09-24.md` | 2026-09-25 | audit | historical | JITM-11, JITM-13, JITM-14, JITM-17 | 125 findings, two-model deliberation, Release A 7b2fa00; §8 owner defaults (Lax sessions, 90-day cap). |
| `docs/HOMEPAGE_CONTACT_DEMO.md` | 2026-09-09 | product doc (README-like) | partly superseded (design/DEMO_WORKSPACE_2026-09-19) | JITM-04 | 13-step homepage demo in one sender's voice; replaced by the three-Beat demo contract; sender persona remains. |
| `docs/HOMEPAGE_CONVERSION_AUDIT_2026-09-07.md` | 2026-09-09 | audit | historical | — | Homepage design and conversion audit of the Netlify test site; testable hypotheses, no invented scores. |
| `docs/HOMEPAGE_CONVERSION_EVENTS.md` | 2026-09-11 | product doc (README-like) | current | JITM-11 | Vendor-neutral jitm:conversion browser events; no collector, cookies or visitor identifiers. |
| `docs/HOMEPAGE_COPY_AND_CLAIM_MATRIX_2026-09-10.md` | 2026-09-11 | reference/asset | partly superseded (SEARCH_STRATEGY_IMPLEMENTATION_2026-09-12) | JITM-04 | Route copy versus claim-evidence matrix; headline replaced 09-12; dead third-party links; names the author. |
| `docs/HOMEPAGE_EXPERIENCE_ROADMAP_2026-09-10.md` | 2026-09-11 | proposal | partly superseded (09-11 revert; ONBOARDING_JOURNEY_PREFERENCES_2026-09-22) | JITM-02, JITM-04, JITM-09 | P0–P6 homepage roadmap that AGENTS.md names; 09-10 build reverted; onboarding order replaced; names a third-party author. |
| `docs/HOMEPAGE_HEADLINE_REVIEW_2026-09-10.md` | 2026-09-11 | proposal | historical | — | 25 headline candidates and a comparison brief; no results recorded; dead links to local-only references and uncommitted components. |
| `docs/HOMEPAGE_IMPLEMENTATION_ACCEPTANCE_2026-09-10.md` | 2026-09-11 | implementation record | historical | — | Roadmap gate evidence for the 09-10 and 09-11 test-site builds; names a third-party author. |
| `docs/HOMEPAGE_MEDIA_MANIFEST_2026-09-10.md` | 2026-09-11 | reference/asset | historical | JITM-03 | Media-rights manifest for the 09-10 build: no stock, generated-person or video assets shipped. |
| `docs/HOMEPAGE_PROFESSION_PAGES_2026-09-11.md` | 2026-09-12 | implementation record | historical | JITM-09 | Five /for/ profession pages after reverting the 09-10 redesign; demo edit-in-place, complete and skip. |
| `docs/HOMEPAGE_READINESS_RECONCILIATION_2026-09-18.md` | 2026-09-18 | implementation record | current | JITM-12, JITM-15 | Roadmap items against 09-18 evidence; open gates listed; an earlier checked item is not evidence; names the author. |
| `docs/HOMEPAGE_REFINEMENT_2026-09-07.md` | 2026-09-09 | implementation record | historical | — | 09-07 homepage refinement published to a Netlify test deploy. |
| `docs/HOMEPAGE_RELEASE_AND_ROLLBACK_2026-09-10.md` | 2026-09-15 | runbook/operations | superseded (D5) | — | Netlify test-site release and rollback procedure; production now releases on Render. |
| `docs/HOMEPAGE_RESEARCH_PROTOCOL_2026-09-10.md` | 2026-09-11 | runbook/operations | current | JITM-02 | Participant research protocol with pass thresholds for homepage comprehension; no participant results recorded yet. |
| `docs/HOMEPAGE_RESEARCH_SESSION_TEMPLATE_2026-09-10.md` | 2026-09-11 | template | current | — (operational; stays as is) | Per-participant session and cohort worksheet for the research protocol. |
| `docs/HOSTED_DEPLOYMENT.md` | 2026-09-25 | runbook/operations | current | JITM-14 | Render web, worker and database deploy order, callbacks, smoke and rollback; still links the Netlify guide. |
| `docs/HOSTED_LOAD_QUALIFICATION.md` | 2026-09-12 | runbook/operations | current | — (operational; stays as is) | Hosted synthetic-account performance procedure with September 10–12 measurements. |
| `docs/IMPLEMENTATION_REPORT_2026-09-05.md` | 2026-09-09 | implementation record | historical | — | Journeys, calendar and intake release plus continuations to 09-09 on the Netlify test site. |
| `docs/IMPLEMENTATION_STATUS.md` | 2026-09-04 | product doc (README-like) | superseded (D1, D3) | — | 09-04 status summary naming CANONICAL as source of truth; Plans/More navigation no longer shipped. |
| `docs/INDEPENDENT_MONITOR_DEPLOYMENT.md` | 2026-09-09 | runbook/operations | current | — (operational; stays as is) | Activation package for a paid independent monitor and AWS uptime stack; not activated. |
| `docs/INVITATION_FLOW_AUDIT_2026-09-16.md` | 2026-09-16 | audit | historical | — | Production invitation blocker (admission limits at zero) and a stale-authorization defect; fixes applied later. |
| `docs/INVITE_PAGE_RELEASE_2026-09-27.md` | 2026-09-27 | release record | historical | — | Invite page redesign 1da264f (PR #88); follow-up PR #90 keeps invitations waiting in Today. |
| `docs/JOURNEY_CLARITY_AND_ANALYTICS_2026-09-21.md` | 2026-09-21 | implementation record | current | JITM-08, JITM-09 | Owner-requested Journey counts and status rosters on the Mix/Beat graph; stages are secondary filters. |
| `docs/JOURNEY_CONNECTION_HANDLES_2026-09-21.md` | 2026-09-21 | implementation record | current | JITM-08, JITM-10 | Pointer and keyboard connection drawing on the Journey canvas; new connections start disabled. |
| `docs/JOURNEY_DYNAMIC_WORKFLOW_CONTRACT_2026-09-21.md` | 2026-09-21 | proposal | current (D4) | JITM-01, JITM-05, JITM-08, JITM-09 | Owner requirements for branches, joins and loops; claims precedence over the forensic review and graph proposal. |
| `docs/JOURNEY_EXPERIENCE_ACCEPTANCE_2026-09-21.csv` | 2026-09-21 | evidence/data | current | JITM-12 | 96 Journey acceptance scenarios: 7 verified, 43 partially verified, 46 planned. |
| `docs/JOURNEY_EXPERIENCE_FORENSIC_REVIEW_2026-09-21.md` | 2026-09-21 | audit | partly superseded (JOURNEY_DYNAMIC_WORKFLOW_CONTRACT_2026-09-21) | JITM-08, JITM-09 | Journey interaction contract and gap list; its branch and loop limits were overridden; links removed sources. |
| `docs/JOURNEY_IMPLEMENTATION_2026-09-21.md` | 2026-09-21 | implementation record | current | JITM-09, JITM-11 | Delivered Mix/Beat graph (Setup, Progress, Results), workflow data model, access rules and tested limits. |
| `docs/JOURNEY_PRODUCTION_RELEASE_2026-09-21.md` | 2026-09-21 | release record | historical | — | Dynamic Journey live as 334d59d after the test database's quota outage; time-zone correction. |
| `docs/JOURNEY_SAVE_RECOVERY_2026-09-21.md` | 2026-09-21 | implementation record | historical | JITM-08 | Connection save-recovery fixes: an acknowledged write reports success; refresh failures get their own retry. |
| `docs/JOURNEY_THREE_PANES_2026-09-21.md` | 2026-09-21 | owner-decision record | current | JITM-07, JITM-09 | Owner-requested people, map and details panes for Journey; 1200 and 1700 px breakpoints. |
| `docs/LAUNCH_READINESS_VALIDATION_2026-07-18.md` | 2026-09-04 | archived stub | superseded | — | Archived July validation stub; points to the manual device matrix for current evidence. |
| `docs/LIBRARY_ADMINISTRATION.md` | 2026-09-09 | runbook/operations | current | — (operational; stays as is) | Ready-made library drafts, publish, hide and rollback, and customer version consistency. |
| `docs/LOCAL_TESTING.md` | 2026-09-14 | runbook/operations | current | JITM-12 | Self-hosted smoke test, repository checks and a manual journey. |
| `docs/MANUAL_DEVICE_QUALIFICATION.md` | 2026-09-15 | template | partly superseded (D1) | JITM-10, JITM-12 | Physical-device and screen-reader matrix, every row NOT RUN; row names use the old navigation. |
| `docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md` | 2026-09-28 | owner-decision record | partly superseded (09-28 A1/A1.a numbering) | JITM-01, JITM-05, JITM-09 | Owner decisions 09-24 on Mega-Mixes and Marketplace; its position numbering was replaced on 09-28. |
| `docs/MARKETPLACE_PRODUCTION_RELEASE_2026-09-24.md` | 2026-09-24 | release record | historical | JITM-14, JITM-16 | 3d06312 released by the agent under the owner's standing authority; e26fdd4 follow-up release. |
| `docs/MEGA_MIXES_2026-09-22.md` | 2026-09-22 | owner-decision record | current | JITM-01, JITM-05, JITM-09 | Owner-requested connected Mega-Mix journeys per profession; names a third-party author. |
| `docs/MIGRATION_RUNBOOK.md` | 2026-09-04 | runbook/operations | current | JITM-11, JITM-14 | Append-only migration rule, deploy and rollback; its migration chain list stops at 09-04. |
| `docs/MIX_CONTACT_PANE_ALIGNMENT_2026-09-21.md` | 2026-09-21 | owner-decision record | current | JITM-07, JITM-09 | Owner: Mixes follow the Contacts pane composition; directory, centre and context breakpoints. |
| `docs/MIX_HANDOFF_AND_JOURNEY_PROPOSAL_2026-09-21.md` | 2026-09-21 | proposal | partly superseded (JOURNEY_DYNAMIC_WORKFLOW_CONTRACT_2026-09-21) | JITM-01, JITM-09 | Owner direction: Journey is the account's Mix/Beat graph, not stages; branch limits later lifted. |
| `docs/MIX_LIBRARY_AND_PATH_CONTROLS_2026-09-21.md` | 2026-09-21 | owner-decision record | current | JITM-09 | Owner direction: remove paths from Journey, one ready-made library, searchable My mixes workspace. |
| `docs/MOBILE_CLARITY_2026-09-18.md` | 2026-09-18 | implementation record | historical | JITM-08 | Response to the owner's nine-item phone review: one-message demo, Today cards, stepwise Quick Add. |
| `docs/MOBILE_EXPERIENCE_AUDIT_2026-09-06.md` | 2026-09-12 | audit | historical | JITM-07 | Phone and tablet audit of 31 pages on the Netlify test site; footer fix; 09-12 follow-up. |
| `docs/NETLIFY_DEPLOYMENT.md` | 2026-09-15 | runbook/operations | superseded (D5) | — | Netlify project and test-site deployment runbook; production runs on Render. |
| `docs/ONBOARDING_INVITATIONS_2026-09-17.md` | 2026-09-17 | owner-decision record | partly superseded (ONBOARDING_JOURNEY_PREFERENCES_2026-09-22; INVITE_PAGE_RELEASE_2026-09-27) | JITM-01, JITM-09 | Owner corrections 09-17: three lifetime member invitations sent by the member; onboarding flow later changed. |
| `docs/ONBOARDING_JOURNEY_PREFERENCES_2026-09-22.md` | 2026-09-22 | owner-decision record | current | JITM-09 | Mega-mix-first onboarding with a scheduling questionnaire; replaces the roadmap's one-person-first order. |
| `docs/OPERATIONAL_ALERTS.md` | 2026-09-09 | runbook/operations | current | — (operational; stays as is) | Independent ops:check and ops:watch alerts, incidents and backup evidence; not proof monitoring runs. |
| `docs/OPERATIONS_READINESS.md` | 2026-09-09 | runbook/operations | current | JITM-14 | Health endpoints, backup and restore, staging smoke; its release order puts web before worker, unlike AGENTS.md. |
| `docs/PILOT_RUNBOOK.md` | 2026-09-09 | runbook/operations | current | — (operational; stays as is) | Single-owner Docker edition setup, backup, restore rehearsal and upgrade. |
| `docs/PR78_PRODUCTION_PROMOTION_DECISION_2026-09-16.md` | 2026-09-16 | release record | historical | JITM-14 | HOLD decision packet for PR #78, with worker-first deployment order and rollback safeguards. |
| `docs/PR78_QUALIFICATION_2026-09-16.md` | 2026-09-16 | release record | historical | — | PR #78 local Render-equivalent and disposable hosted qualification receipt. |
| `docs/PRODUCTION_LAUNCH_PLAN.md` | 2026-09-10 | proposal | partly superseded (ONBOARDING_INVITATIONS_2026-09-17) | JITM-01, JITM-14 | Render and DNS launch plan with the access model; five personal invitations are now three; payments deferred. |
| `docs/PRODUCTION_PROMOTION_HANDOFF_2026-09-15.md` | 2026-09-16 | release record | historical | — | Self-labelled historical hand-off for 472356d: migrations applied, deploy rolled back, fix qualification. |
| `docs/PRODUCT_AUDIT_2026-09-04.md` | 2026-09-05 | audit | historical | JITM-01, JITM-02, JITM-17 | Owner's phone-first small-business CRM lens; findings at e08e1d3; flagged three conflicting navigation models. |
| `docs/PRODUCT_AUDIT_FOLLOWUP.md` | 2026-09-05 | implementation record | historical | — | Remediation commits after the 09-04 audit and one further onboarding fix. |
| `docs/PRODUCT_COMPLETION.md` | 2026-09-10 | implementation record | historical | — | Completion ledger with checkpoints to 09-10; README still calls it current; names a third-party author. |
| `docs/PRODUCT_QUALITY_GATES.md` | 2026-09-09 | runbook/operations | partly superseded (stale deployment and test-site statements) | JITM-12, JITM-14, JITM-17 | Release quality gates; says deployment is deferred; keeps the manual device matrix authoritative. |
| `docs/PRODUCT_READINESS_HANDOFF_2026-09-12.md` | 2026-09-12 | implementation record | historical | — | 09-12 owner steps and decisions before a first wave, including retired test-site steps. |
| `docs/PRODUCT_SPEC.md` | 2026-09-04 | archived stub | superseded | — | Archived July specification stub pointing to CANONICAL_PRODUCT_DECISIONS. |
| `docs/PUBLIC_POLICY_DRAFT.md` | 2026-09-11 | runbook/operations | current | JITM-04 | Operator values for /privacy, /terms and /contact; no invented operator, address or legal claims. |
| `docs/PUBLIC_REPOSITORY_HYGIENE.md` | 2026-07-23 | audit | historical | JITM-11, JITM-13 | v0.1.0-rc.1 secret and personal-data scans, dependency review and ongoing controls. |
| `docs/QUICK_ADD.md` | 2026-09-04 | product doc (README-like) | partly superseded (design/QUICK_ADD_AND_ACTIVATION_2026-09-20) | JITM-08, JITM-09 | Quick Add phrase parsing and fallback choices; combined capture and save superseded on 09-20. |
| `docs/READY_MADE_MIX_PANES_2026-09-21.md` | 2026-09-21 | owner-decision record | current | JITM-07, JITM-09 | Owner request: Ready-made shares the My mixes three-pane workspace; no invented template metrics. |
| `docs/RECOVERY_BUNDLES.md` | 2026-09-09 | runbook/operations | current | — (operational; stays as is) | Complete recovery bundle capture and restore, and source-cutoff finalization. |
| `docs/RECOVERY_REOPENING.md` | 2026-09-09 | runbook/operations | current | — (operational; stays as is) | Guarded reopening of a recovered database target. |
| `docs/RECOVERY_RESTRICTIONS.md` | 2026-09-09 | runbook/operations | current | — (operational; stays as is) | Signed restriction plan and apply step for a held restore. |
| `docs/RECOVERY_STATE.md` | 2026-09-09 | runbook/operations | current | — (operational; stays as is) | Recovery-state export and review against a held restore target. |
| `docs/RELATIONSHIP_VOCABULARY.md` | 2026-09-09 | reference/asset | partly superseded (D1) | JITM-03, JITM-05 | 09-07 Mix, Beat and Tempo vocabulary; Mix and Beat kept; Tempo, Remix and Cue barely shipped. |
| `docs/RELEASE_QUALIFICATION_2026-09-06.md` | 2026-09-09 | release record | historical | — | 09-06 Netlify test release 6a9df82f: landmark and disclosure fixes. |
| `docs/RESTORE_RECOVERY.md` | 2026-09-09 | runbook/operations | current | — (operational; stays as is) | Safe restore under an application recovery hold. |
| `docs/RUNTIME_DATABASE_CREDENTIALS.md` | 2026-09-09 | runbook/operations | current | — (operational; stays as is) | Restricted jitm_runtime database role; the owner connection stays out of web and worker. |
| `docs/SALES_PLAN_LIBRARY_2026-09-05.md` | 2026-09-09 | implementation record | partly superseded (D4 Journey branching) | JITM-04 | 20 ready-made plans adapted from sales methods; names third-party frameworks and authors; says sequences never branch automatically. |
| `docs/SCHEDULED_BACKUPS.md` | 2026-09-09 | runbook/operations | current | — (operational; stays as is) | Daily encrypted S3 backup job on Render and its qualification. |
| `docs/SEARCH_STRATEGY_IMPLEMENTATION_2026-09-12.md` | 2026-09-12 | implementation record | current | JITM-02, JITM-04 | What the 09-12 search strategy changed on the public site; README's positioning record. |
| `docs/SECURITY.md` | 2026-09-09 | product doc (README-like) | partly superseded (FULL_AUDIT_2026-09-24 §8) | JITM-11 | Security model; its SameSite=Strict, 14-day session rule is now Lax with a 90-day cap. |
| `docs/SINGLE_USER_PORT_MATRIX.md` | 2026-09-04 | archived stub | superseded | — | Archived stub pointing to CANONICAL, HOSTED_DEPLOYMENT and PILOT_RUNBOOK. |
| `docs/SINGLE_USER_PRODUCT_SCOPE.md` | 2026-09-04 | archived stub | superseded | — | Archived stub pointing to CANONICAL_PRODUCT_DECISIONS. |
| `docs/STAFF_ACCESS.md` | 2026-09-09 | runbook/operations | current | — (operational; stays as is) | First owner, roles, individual permissions and staff invitations; its 'rollout pending' line is stale. |
| `docs/SUPPORT.md` | 2026-09-04 | product doc (README-like) | partly superseded (D1) | JITM-04, JITM-09 | Customer support surfaces and FAQ rules; category names use older terms (plans, saved dates). |
| `docs/SUPPORT_CASE_ACCESS.md` | 2026-09-09 | runbook/operations | current | — (operational; stays as is) | Case-scoped staff access to customer workspaces, with audit. |
| `docs/SUPPORT_EMAIL_OPERATIONS.md` | 2026-09-09 | runbook/operations | current | — (operational; stays as is) | Support reply email delivery, recovery and retention. |
| `docs/SYSTEM_MIX_ADMINISTRATION.md` | 2026-09-09 | runbook/operations | partly superseded (ONBOARDING_INVITATIONS_2026-09-17) | — (operational; stays as is) | System Mix invitation copy releases; member invitations are no longer application email since 09-17. |
| `docs/TODAY_EMPTY_STATE_FIX_2026-09-25.md` | 2026-09-25 | release record | historical | — | 929f779 fixes the undersized empty-state link in Today's Done group after C-1. |
| `docs/UI_ICONS_PRODUCTION_RELEASE_2026-09-23.md` | 2026-09-23 | release record | historical | — | Phone icon and workflow release 3f85c77; links an ignored evidence folder. |
| `docs/UI_UX_AUDIT_2026-09-05.md` | 2026-09-12 | audit | historical | — | 09-05 UI/UX audit with 16 findings, and a 09-12 verification. |
| `docs/UI_UX_DEEP_GAP_AUDIT_2026-09-23.md` | 2026-09-23 | audit | historical | JITM-08, JITM-10 | Second-pass gaps on 3f85c77: first value, data safety, 44 px targets; fix status. |
| `docs/UI_UX_IMPLEMENTATION_2026-09-18.md` | 2026-09-18 | implementation record | historical | JITM-17 | 175 of 184 findings closed; states that a code change alone does not close a finding. |
| `docs/UI_UX_PRODUCT_READINESS_AUDIT_2026-09-18.md` | 2026-09-18 | audit | historical | JITM-08, JITM-10, JITM-17 | 184-finding readiness audit with evidence labels; dead links to local-only references; names the author. |
| `docs/UI_UX_WORKFLOW_AND_ICON_AUDIT_2026-09-22.md` | 2026-09-23 | audit | historical | JITM-06, JITM-08 | Workflow gaps and a phone icon system; its link to a local-only release record is dead. |
| `docs/UI_UX_WORKFLOW_AND_ICON_IMPLEMENTATION_2026-09-22.md` | 2026-09-23 | owner-decision record | current | JITM-06, JITM-09 | Owner decisions 09-22: house Today icon, shuffle Mixes icon, mega-mix-first onboarding; live as 3f85c77. |
| `docs/USER_ADMINISTRATION.md` | 2026-09-09 | runbook/operations | current | — (operational; stays as is) | Account suspension and session revocation; its deployment status line is stale. |
| `docs/UX_GAP_FIXES_2_PRODUCTION_RELEASE_2026-09-23.md` | 2026-09-23 | release record | historical | — | Second deep-gap fixes release 0b175a5. |
| `docs/UX_GAP_FIXES_PRODUCTION_RELEASE_2026-09-23.md` | 2026-09-23 | release record | historical | — | First three deep-gap fixes release 5b264a6. |
| `docs/UX_WORKFLOW_OPTIMIZATION.md` | 2026-09-04 | authority | partly superseded (D1) | JITM-08 | 'Phone-first workflow contract' of interaction budgets; its Plans/More navigation is no longer shipped. |
| `docs/VOICE_PRD_REVIEW.md` | 2026-09-09 | owner-decision record | current | JITM-01 | Critical review of the voice PRD: dictation, temporary drafts, spoken briefing selected; paid assistant deferred. |
| `docs/VOICE_WORKFLOWS.md` | 2026-09-09 | product doc (README-like) | current | JITM-09 | Voice capture, temporary drafts and the spoken Today briefing, without a paid AI service. |
| `docs/WAITLIST_OPERATIONS.md` | 2026-09-09 | runbook/operations | current | — (operational; stays as is) | Waitlist waves, manual invitations, rejoining and delivery recovery; its status line is stale. |
| `docs/WORKER_RECOVERY_QUALIFICATION.md` | 2026-09-09 | runbook/operations | current | — (operational; stays as is) | Worker and import recovery guarantees and repeatable qualification. |

## docs/design/

| Path | Last change | Type | Status | Absorbed by | Note |
| --- | --- | --- | --- | --- | --- |
| `docs/design/CONTACTS_FORENSIC_AUDIT_2026-09-19.md` | 2026-09-19 | audit | historical | — | Contacts implementation versus supplied design; evidence links point into the ignored .artifacts/ folder. |
| `docs/design/CONTACTS_IMPLEMENTATION_2026-09-19.md` | 2026-09-19 | implementation record | current | JITM-07, JITM-09 | Contacts workspace correction live as 72c2be5; directory and profile pane behaviour boundaries. |
| `docs/design/DEMO_WORKSPACE_2026-09-19.md` | 2026-09-19 | owner-decision record | current | JITM-04, JITM-09 | Owner demo contract: fictional contact, three Beats (text today, email tomorrow, call in a week). |
| `docs/design/DESIGN_ADOPTION_2026-09-19.md` | 2026-09-20 | implementation record | superseded (DESIGN_CORRECTION_2026-09-19) | — | Self-labelled historical report that overstated visual completion; see the gap analysis and correction. |
| `docs/design/DESIGN_CONSISTENCY_2026-09-23.md` | 2026-09-23 | implementation record | current | JITM-06, JITM-08 | Owner-requested single disclosure and popup pattern, live as fad339d; four assumptions ratified 2026-09-28 (D9). |
| `docs/design/DESIGN_CORRECTION_2026-09-19.md` | 2026-09-19 | implementation record | partly superseded (D4) | JITM-06, JITM-07 | Built the missing workspace structures; names the export the visual authority; Journey stage assumptions superseded. |
| `docs/design/DESIGN_DEPLOYMENT_2026-09-19.md` | 2026-09-20 | release record | historical | — | Initial production design release 2c029bc on Render. |
| `docs/design/DESIGN_DEPLOYMENT_2026-09-20.md` | 2026-09-20 | release record | historical | — | Netlify test-site publication of design details during a test-database outage. |
| `docs/design/DESIGN_DETAIL_REVIEW_2026-09-20.md` | 2026-09-20 | implementation record | historical | — | Pane, popup and control refinements, folded into DESIGN_GUIDELINES; gallery sits in ignored .artifacts/. |
| `docs/design/DESIGN_FOLLOWTHROUGH_2026-09-20.md` | 2026-09-20 | implementation record | historical | — | Follow-through pass; its open Quick Add, quiet-day and activation questions were later decided by the owner. |
| `docs/design/DESIGN_GAP_ANALYSIS_2026-09-19.md` | 2026-09-20 | audit | historical | — | Pre-correction baseline: palette and fonts adopted, workspaces and workflows missing. |
| `docs/design/DESIGN_GUIDELINES.md` | 2026-09-23 | authority | superseded (D3; D4 on Journey) | JITM-06, JITM-07, JITM-08, JITM-10, JITM-12 | Derived UI rules under the export; its stage-circle Journey rules (lines 28–33) are history. |
| `docs/design/DESIGN_PAGE_REVIEW_2026-09-20.md` | 2026-09-20 | implementation record | historical | — | Page review and inventory; calls the export and guidelines the standing UI authority. |
| `docs/design/DESIGN_PANE_POLISH_2026-09-20.md` | 2026-09-20 | implementation record | historical | — | Pane and popup polish; gallery sits in ignored .artifacts/. |
| `docs/design/DESIGN_PRODUCTION_2026-09-20.md` | 2026-09-20 | release record | historical | — | Production release of the 09-20 design details. |
| `docs/design/DESIGN_REMAINING_ISSUES_2026-09-20.md` | 2026-09-20 | audit | historical | — | Five reproduced draft-loss issues, fixed by SAVE_RECOVERY_RELEASE_2026-09-20. |
| `docs/design/DESIGN_REVIEW_2026-09-20.md` | 2026-09-20 | implementation record | historical | — | Review and follow-through pass; calls the export authoritative; lists open decisions. |
| `docs/design/DESIGN_ROUTE_AUDIT_2026-09-19.md` | 2026-09-19 | audit | historical | — | Route status and automated accessibility scan table for the design adoption. |
| `docs/design/DESIGN_STRESS_REVIEW_2026-09-20.md` | 2026-09-20 | implementation record | historical | — | Resize, failed-save, hidden-validation and enlarged-text corrections; gallery in ignored .artifacts/. |
| `docs/design/LANDING_PARITY_2026-09-19.md` | 2026-09-20 | owner-decision record | current | JITM-09 | Owner: every 'Mixes for' page shares the homepage composition; the 'All' chip is removed. |
| `docs/design/QUICK_ADD_AND_ACTIVATION_2026-09-20.md` | 2026-09-20 | owner-decision record | current | JITM-08, JITM-09 | Owner-approved combined Quick Add save and per-user Mix activation mode. |
| `docs/design/QUIET_DAY_TOUCHPOINTS_2026-09-20.md` | 2026-09-20 | owner-decision record | partly superseded (D4) | JITM-08, JITM-09 | Owner-approved quiet-day suggestion lifecycle; its placement under the stage circles predates the Journey graph. |
| `docs/design/RESPONSIVE_AUDIT_2026-09-19.md` | 2026-09-20 | implementation record | historical | JITM-07 | Bounded Today grid for wide screens; shared maximum widths for pages without a mockup. |
| `docs/design/SAVE_RECOVERY_RELEASE_2026-09-20.md` | 2026-09-20 | implementation record | historical | JITM-08 | Draft protection and save recovery for Calendar, preferences and Quick Add; release evidence never added. |

## Evidence folders

Grouped rows. File counts and last-change dates come from the tracked files on `main`.

| Folder | Files | Last change | Type | Status | Absorbed by | Note |
| --- | ---: | --- | --- | --- | --- | --- |
| `docs/admin-density-2026-09-17/` | 13 | 2026-09-17 | evidence/data | historical | — | Before/after captures, measurements and release JSON for the admin density revision. |
| `docs/admin-ux-audit-2026-09-16/` | 8 | 2026-09-16 | evidence/data | historical | — | Admin audit captures and verification JSON. |
| `docs/admin-ux-implementation-2026-09-16/` | 4 | 2026-09-16 | evidence/data | historical | — | Admin implementation captures and verification JSON. |
| `docs/audit-2026-09-24/` | 11 | 2026-09-24 | evidence/data | historical | — | Nine area reports and the findings table behind FULL_AUDIT_2026-09-24. |
| `docs/beta-audit-2026-09-26/` | 175 | 2026-09-26 | evidence/data | historical | — | Lane reports, runtime logs and 116 captures behind the beta-readiness audit; three lanes name the author. |
| `docs/design/jump-in-the-mix-designs/` | 102 | 2026-09-19 | reference/asset (not evidence; see note) | current (D4: Journey screens are history) | JITM-06, JITM-07 | Supplied design export: screens, tokens, canvas source. It remains the visual authority, so it is not evidence. |
| `docs/ui-ux-audit-2026-09-18/` | 196 | 2026-09-18 | evidence/data | historical | — | Findings board, CSV/JSON, implementation checklist, qualification runbooks and captures for the 09-18 audit. |

## Local-only sources (not in Git)

These files exist only in the owner's local checkout and on no branch. Under D6 they stay out of Git and are identified by the first 16 hex digits of their SHA-256. The two third-party references are listed without their filenames (D7). Every pricing item in the brand, price and features file is a proposal (D11).

| Path | sha256 prefix | Size (bytes) | Type | Status | Absorbed by | Note |
| --- | --- | ---: | --- | --- | --- | --- |
| third-party conversion-copywriting reference (local-only) | `dc3e5265f80a50b1` | 60,849 | reference/asset | current | JITM-04 | Kept out of Git (D6); only a clean-room distillation may reach the standards (D7). |
| third-party marketing-principles reference (local-only) | `9cec246b4c5a2608` | 44,497 | reference/asset | current | JITM-04 | Kept out of Git (D6); only a clean-room distillation may reach the standards (D7). |
| `assets/Jump_in_the_Mix_Brand_price_freatures.md` | `00e0a87b7f6e77fc` | 37,651 | proposal | current (proposal) | JITM-01, JITM-02, JITM-04 | Owner-supplied architecture, features and pricing packages, all PROPOSED; no pricing claims until the owner sets pricing (D11). |
| `docs/CONTRACTOR_UX_ACCEPTANCE_2026-09-22.csv` | `5bf829c10b73dc68` | 3,672 | evidence/data | historical | — | Proposed acceptance U01–U20 for the contractor approach; the tracked verification CSV records results. |
| `docs/CONTRACTOR_UX_APPROACH_2026-09-22.md` | `f7ea577d837b6b1f` | 21,394 | proposal | historical | JITM-08, JITM-09 | Advisory contractor-journey approach; owner clarification: keep the current UI structure; implemented 09-22. |
| `docs/CONTRACTOR_UX_PRODUCTION_RELEASE_2026-09-22.md` | `c4c1b0b0412c1169` | 4,969 | release record | historical | — | Contractor UX release 006d445 on Render; a tracked audit links it (dead link). |
| `docs/INDUSTRY_MIX_AUDIT_2026-09-17.json` | `788e397744097d38` | 237,746 | evidence/data | historical | — | Analysis-only catalog of the supplied industry Mix library; hashes the docs/mixes/ sources. |
| `docs/INDUSTRY_MIX_IMPLEMENTATION_REVIEW_2026-09-17.md` | `fb11e3b1f8847bb3` | 28,095 | proposal | historical | JITM-09, JITM-11 | Industry Mix catalog, field provisioning and contact-spreadsheet proposal; names a third-party author. |
| `docs/ONBOARDING_DEPLOYMENT_2026-09-17.md` | `77c43c3549ea2e28` | 4,858 | release record | historical | — | Onboarding and invitation publication to the retired Netlify test site; a tracked doc links it (dead link). |
| `docs/PRODUCTION_ONBOARDING_DEPLOYMENT_2026-09-18.md` | `817de5f523328024` | 5,120 | release record | historical | — | Production onboarding and invitation release ab323cd, with the admin layout changes. |
| `docs/USER_JOURNEY_FORENSIC_ACCEPTANCE_2026-09-22.csv` | `a0094cae009621d8` | 4,088 | evidence/data | historical | — | Acceptance criteria for forensic findings F01–F13. |
| `docs/USER_JOURNEY_FORENSIC_AUDIT_2026-09-22.md` | `6da40d7562809741` | 32,223 | audit | historical | JITM-09, JITM-17 | 13 findings on setup, Contacts, Journey and Today transitions; basis of the contractor fixes. |
| `docs/design/ONBOARDING_JOURNEY_2026-09-22.md` | `f7142db84c4be1ea` | 5,350 | implementation record | historical | — | Parallel write-up of the work in the tracked ONBOARDING_JOURNEY_PREFERENCES_2026-09-22, with transaction details. |

### Found during this pass (not in the input list)

| Path | sha256 prefix | Size (bytes) | Type | Status | Absorbed by | Note |
| --- | --- | ---: | --- | --- | --- | --- |
| `docs/mixes/master_library.md` | `d9dbb5a194ec760c` | 350,510 | reference/asset | unclear | JITM-01, JITM-04 | Supplied industry library v2.0.0: 40 Mixes, 137 Beats. Whether shipped Mega-Mixes derive from it was not verified. |
| `docs/mixes/master_library.html` | `58428755bc3718df` | 520,877 | reference/asset | unclear | — | HTML rendering of the same library; status unclear for the same reason. |
| `docs/mixes/mix_and_beat_index.md` | `d0fa731c21295f44` | 31,592 | reference/asset | unclear | JITM-04 | Mix and Beat index with channel fallback rules; status unclear for the same reason. |
