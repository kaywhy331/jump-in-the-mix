# Standards audit — Jump in the Mix (`origin/main` 9439fd6), 2026-09-28

**Summary.** Jump in the Mix had plenty of rules, but they were scattered, stale and contradictory. About 180 tracked documents, a design export and 16 local-only files each held part of the rulebook:

- The "single source of truth" (`docs/CANONICAL_PRODUCT_DECISIONS.md`) was last aligned with the product on 2026-09-09.
- Three documents prescribed three customer vocabularies, and the shipped app used a fourth.
- The design guidelines stopped tracking production on 2026-09-23.
- The release procedure existed only in git-ignored scripts.
- No agent-facing rules existed beyond `AGENTS.md`.
- Claude Code and Codex shared no skills.

This audit is the evidence behind the new standards in [`docs/standards/`](standards/README.md). Kevin answered D1–D12 on 2026-09-28 ([owner decisions](standards-audit-2026-09-28/OWNER_DECISIONS.md)), so every documentary conflict found here now has a home rule. The problems that remain are:

- product copy and documents that contradict the new rules (the drift below and in the [drift baseline](standards-audit-2026-09-28/DRIFT_BASELINE.md));
- a few operational risks found in passing;
- the questions for Kevin at the end.

**Most important in passing:** Kevin's application-level outage alert is an hourly production smoke on GitHub Actions. Actions has been blocked by billing since PR #86, so that check probably is not running. Render failure notifications cover service-level failures: Kevin confirmed setting them on 2026-09-26, but no repository record captured it until this audit (TST-02).

## Contents

1. [Scope, method and evidence](#1-scope-method-and-evidence)
2. [Findings by dimension](#2-findings-by-dimension)
3. [Documents that disagree with each other](#3-documents-that-disagree-with-each-other)
4. [Documents that disagree with the code](#4-documents-that-disagree-with-the-code)
5. [Gaps: no rule existed](#5-gaps-no-rule-existed)
6. [NOT READ / NOT RUN](#6-not-read--not-run)
7. [Questions for Kevin](#questions-for-kevin)
8. [Follow-up backlog](#8-follow-up-backlog)

## 1. Scope, method and evidence

- **Commit:** `origin/main` 9439fd6, which equals production tag `prod-2026-09-28-9439fd6`. The audit ran in a separate worktree, and the owner's checkout was not modified.
- **Sources:**
  - every root `*.md`, `assets/*`, `docs/*.md` and `docs/design/*.md` (182 tracked files) plus the design export, classified in the [source register](standards-audit-2026-09-28/SOURCE_REGISTER.md);
  - 16 local-only files in the owner's checkout (hash-referenced, D6);
  - the shipped code where documents made claims about it;
  - git history, tags and branches;
  - the fleet's evidence-led persuasion standard for copy rules.
- **Method:** seven read-only extraction passes (product authority; design; owner decisions and workflows; brand, voice and ICP; engineering and release; shipped code and drift; source register). Each item was cited to `path:line`. The lead wrote every conclusion and spot-checked citations.
- **Labels:** VERIFIED-DOC, VERIFIED-CODE, INFERRED and NOT RUN, as defined in JITM-12 §2.
- **Severity:** as defined in JITM-17 §2.14, judged for a small invitation-only beta of solo owners on phones.
- **No production access.** The audit changed no code or data and made no deploys or production requests. Tooling probes ran in scratch repositories outside every checkout.

## 2. Findings by dimension

Each finding says where the standards now resolve it, or which backlog item fixes the drift.

### Authority, documents and records

| ID | Finding | Evidence | Label | Severity | Resolution |
|---|---|---|---|---|---|
| DOC-01 | The declared contract is stale but claims to win over code. `CANONICAL_PRODUCT_DECISIONS` says "this file wins", yet it predates the nav rename (02d23ba, 2026-09-09), the invitation change, the session change, the audience change and every feature since. Audits already rule that "the code wins". | `docs/CANONICAL_PRODUCT_DECISIONS.md:8`; `docs/BETA_READINESS_AUDIT_2026-09-26.md:479` | VERIFIED-DOC | HIGH | JITM-00 §2.12–§2.16 (D3); supersession banner |
| DOC-02 | The design guidelines have been stale since 2026-09-23. They lack the text floors, the ≤900px target block, sheet-title focus, the N shortcut, the Marketplace and Mega-Mix tabs, the sun/moon switch and the 2026-09-28 Journey changes. They also keep the superseded stage-circle Journey rules. | `docs/design/DESIGN_GUIDELINES.md:5,28-33`; commit 153a083 | VERIFIED-DOC | MEDIUM | JITM-06, 07, 08 and 10 (D3, D4); banner |
| DOC-03 | Runbooks and entry documents contradict current practice: sessions (`docs/SECURITY.md`), deploy order, the migration chain, Netlify presented as production, pre-deploy migrations, the auto-deploy claim, five invitations, and "Plans" in README and IMPLEMENTATION_STATUS. | see §4 | VERIFIED-DOC | MEDIUM | Backlog B-06 |
| DOC-04 | Seven tagged production deploys have no record (5a0c07b, def2e96, 040fc25, 84eda7a, ef87c3c, 288fc26, 9439fd6). One deploy (4b5abd8) was neither tagged nor recorded. 22 of 31 tag messages lack deploy ids. | git tags; SHA grep of `docs/` | VERIFIED-DOC | MEDIUM | JITM-14 §2, JITM-15 §2; question 7 |
| DOC-05 | 23 dead relative links in 11 documents: to local-only third-party references, local-only documents, the ignored `.artifacts/` directory and removed files. There are 40 more in `docs/design/`. | [source register](standards-audit-2026-09-28/SOURCE_REGISTER.md) | VERIFIED-DOC | LOW | JITM-15 §2; backlog B-06 |
| DOC-06 | 16 files exist only in the owner's checkout and on no branch. They include owner-supplied proposals and the 40-Mix industry library. | [source register](standards-audit-2026-09-28/SOURCE_REGISTER.md) | VERIFIED-DOC | MEDIUM | D6; JITM-15 §2 |
| DOC-07 | Owner decisions live inside release records; no decision log exists. At least 29 dated decisions were found across them. | docs/*RELEASE*, `docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md` | VERIFIED-DOC | LOW | [Owner decisions](standards-audit-2026-09-28/OWNER_DECISIONS.md); WF-08 |

### Vocabulary

| ID | Finding | Evidence | Label | Severity | Resolution |
|---|---|---|---|---|---|
| VOC-01 | Three conflicting customer vocabularies: Plan / Follow-up / Saved date (CANONICAL), Mix / Step / Jump / Important Date (CONTRIBUTING) and Mixes / Beats (README). The shipped nav says Mixes. | `docs/CANONICAL_PRODUCT_DECISIONS.md:38-50`; `CONTRIBUTING.md:63-68`; `README.md:3`; `src/components/Nav.tsx:12` | VERIFIED-CODE | HIGH | JITM-05 §2 (D1) |
| VOC-02 | Shipped copy uses retired or off-glossary words: "a follow-up campaign" (Help), "cue" and "loop" (FAQ), "Plans" (README). | `src/lib/support-content.ts:44,46`; `README.md:11` | VERIFIED-CODE | MEDIUM | JITM-05 §6; backlog B-02 |
| VOC-03 | Casing varies: "Mega-Mix", "Mega-mix" and "mega-mix"; "Mix" and "mix". | `src/components/MegaMixForms.tsx:21`; `src/components/BrandTermsHelp.tsx:9`; `src/components/WorkflowJourney.tsx:225` | VERIFIED-CODE | MEDIUM | JITM-05 §2; backlog B-02 |
| VOC-04 | The in-app glossary defines Today as "Beats that are due", but Today also lists one-time follow-ups and invitation reminders. | `src/components/BrandTermsHelp.tsx:11`; `src/app/(app)/jumps/page.tsx:430` | VERIFIED-CODE | MEDIUM | JITM-05 §2; backlog B-02 |
| VOC-05 | A Mix is defined three different ways across public pages, the glossary and Help. | `src/lib/public-seo.ts:9`; `src/components/BrandTermsHelp.tsx:7-8`; `src/lib/support-content.ts:44` | VERIFIED-CODE | LOW | JITM-05 §2; backlog B-02 |

### Concept, goals and workflows

| ID | Finding | Evidence | Label | Severity | Resolution |
|---|---|---|---|---|---|
| CON-01 | No single statement of the mission and product promise existed. The pieces were spread across CANONICAL, the README and audits. | `docs/CANONICAL_PRODUCT_DECISIONS.md:24,32`; `README.md:3` | VERIFIED-DOC | MEDIUM | JITM-00 §2.1–§2.2; JITM-01 |
| CON-02 | Automatic email and SMS delivery is listed as a feature, but it is off in production for the beta. | `README.md:17`; `docs/BETA_BLOCKERS_RELEASE_2026-09-26.md:6` | VERIFIED-DOC | MEDIUM | JITM-01 §2; backlog B-06 |
| IAW-01 | Two "journeys": the stage-based customer journey (Settings, More and README) and the Mix/Beat graph at `/journey`. More and Settings still describe Journey as stages. | `src/app/(app)/more/page.tsx:13`; `src/app/(app)/settings/page.tsx:11`; `docs/design/DESIGN_GUIDELINES.md:5` | VERIFIED-CODE | MEDIUM | JITM-09 §2 (D4); question 4; backlog B-02 |
| IAW-02 | The invitation rules conflict. Three ops documents describe five lifetime invitations that the app emails; the code and the 09-17/09-27 decisions give three, which the member sends from Today. The admission document also counts them against capacity, but the code excludes them. | `docs/SYSTEM_MIX_ADMINISTRATION.md:11`; `docs/ADMISSION_CONTROLS.md:19,29`; `src/lib/system-mix.ts:1`; `src/lib/admission.ts:28-30` | VERIFIED-CODE | HIGH | JITM-09 §2; backlog B-06 |
| IAW-03 | Marketplace moderation shipped narrower than the owner's 2026-09-24 rule. The shipped rule, a reversible Release A default, auto-hides only verified private-information reports. | `docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:16`; `docs/FULL_AUDIT_2026-09-24.md:141`; `src/lib/marketplace.ts:6-33` | VERIFIED-CODE | MEDIUM | JITM-09 §6; question 3 |
| IAW-04 | A1/A1.a labels are recomputed for each Mega-Mix view, and outlines number by saved order. The same Mix can therefore carry different labels. | `src/lib/journey-numbering.ts:65-69`; `src/components/WorkflowJourney.tsx:86,94` | VERIFIED-CODE | LOW | JITM-05 §6; question 9 |
| IAW-05 | The invitation email and registration promise "start with one person", but onboarding recommends a Mega-Mix first (owner, 2026-09-22). | `src/lib/waitlist.ts:86-87`; `src/components/OnboardingForm.tsx:39` | VERIFIED-CODE | MEDIUM | JITM-09 §2; backlog B-02 |
| IAW-06 | Most 2026-09-21 Journey documents are proposals, and the acceptance matrix has only 7 of 96 rows verified. No consolidated Journey specification existed before JITM-09. | `docs/JOURNEY_DYNAMIC_WORKFLOW_CONTRACT_2026-09-21.md:5`; `docs/JOURNEY_EXPERIENCE_ACCEPTANCE_2026-09-21.csv` | VERIFIED-DOC | LOW | JITM-09 §2 |
| IAW-07 | The preparation storage contract's channel rules (§9b) were replaced by the 2026-09-23 decision to offer every channel version, but the contract was never marked superseded. | `docs/FOLLOW_UP_PREPARATION_STORAGE_CONTRACT.md:193,201`; `docs/CHANNEL_VERSIONS_FOR_EVERY_BEAT_2026-09-23.md:3` | VERIFIED-DOC | LOW | JITM-09 §2; backlog B-06 |

### Voice, copy, ICP and brand

| ID | Finding | Evidence | Label | Severity | Resolution |
|---|---|---|---|---|---|
| VOI-01 | The follow-up reminders page says nothing goes out on its own "unless you connect an optional sending provider". Automatic sending is off during the beta. | `src/app/features/follow-up-reminders/page.tsx:37`; `src/app/faq/page.tsx:25` | VERIFIED-CODE | HIGH | JITM-04 §2; backlog B-01 |
| VOI-02 | The template and feature pages describe the retired four-Beat demo and "open your own messaging app". Beta finding UX-02 is still open. | `src/app/follow-up-templates/page.tsx:48`; `src/app/features/follow-up-reminders/page.tsx:46` | VERIFIED-CODE | HIGH | JITM-09 §2 (demo contract); backlog B-01 |
| VOI-03 | Ready-made plan guides show third-party sales-method and author names, and library search matches those authors. D7 now forbids this. | `src/lib/sales-approaches.ts:5-54`; `src/components/PlanApproachGuide.tsx:12,17`; `src/lib/sales-plan-library.ts:297` | VERIFIED-CODE | HIGH | JITM-04 §2 (D7); question 2; backlog B-03 |
| VOI-04 | `AGENTS.md` and about 12 documents name a third-party copy author and branded technique names. | `AGENTS.md:25`; `assets/README.md:25-26` | VERIFIED-DOC | MEDIUM | New router (this change); the historical documents stay (D3) |
| VOI-05 | Ready-made messages assert scarcity or facts without an "only if true" cue, for example "your date is still open". | `src/lib/persona-mixes.ts:133,149,172,217` | VERIFIED-CODE | MEDIUM | JITM-04 §2; backlog B-03 |
| VOI-06 | Voice drifts between the singular "I" and "we" in persona messages. | `docs/HOMEPAGE_CONTACT_DEMO.md:5`; `src/lib/persona-mixes.ts:187` | VERIFIED-CODE | LOW | Question 11 |
| VOI-07 | The waitlist confirmation says "the moment it's your turn", but other pages say no date can be promised. | `src/app/waitlist/confirm/page.tsx:10`; `src/app/waitlist/page.tsx:20` | VERIFIED-CODE | LOW | Backlog B-02 |
| ICP-01 | Documents give four different audience priorities (CANONICAL, strategy, roadmap and ICPs). | `docs/CANONICAL_PRODUCT_DECISIONS.md:24`; ICP files | VERIFIED-DOC | MEDIUM | JITM-02 §2 (D2) |
| ICP-02 | The social card and OG text still carry the superseded positioning: "Good relationships have a rhythm · Business · Personal · Your network". | `scripts/generate-brand-assets.mjs:26-31`; `src/lib/public-seo.ts:15` | VERIFIED-CODE | MEDIUM | JITM-02 §6; question 10; backlog B-02 |
| ICP-03 | No brand line was ever ratified. Three candidates ship in different places. | `src/app/page.tsx:10`; `src/components/PublicFooter.tsx:7` | VERIFIED-CODE | LOW | Question 10 |
| ICP-04 | The current homepage headline is an owner-directed hypothesis, not a research-validated winner. The planned comprehension research never ran. | `docs/SEARCH_STRATEGY_IMPLEMENTATION_2026-09-12.md:11,31` | VERIFIED-DOC | LOW | JITM-02 §2 |
| BRD-01 | There are no logo usage rules. A violet "JM" monogram (`public/icon-source.svg`) is still published beside the real mark. | `docs/BRAND_ASSETS.md`; `public/icon-source.svg` | VERIFIED-CODE | LOW | JITM-03 §6; question 10 |
| BRD-02 | The identity of outbound platform email is unspecified: sender name, Reply-To, the `.com`/`.app` domain inconsistency, and the pending `security@` alias. | `src/lib/env.ts:94`; `docs/BETA_READINESS_AUDIT_2026-09-26.md:381` | VERIFIED-CODE | MEDIUM | JITM-03 §6 |

### Design, layout, interaction and accessibility

| ID | Finding | Evidence | Label | Severity | Resolution |
|---|---|---|---|---|---|
| DES-01 | Token gaps: `--accent` has no dark value; about ten export colors have no token; spacing, type, z-index and motion tokens exist only in legacy `base.css`. | `src/styles/design-tokens.css`; `src/styles/base.css:24-42` | VERIFIED-CODE | MEDIUM | JITM-06 §6; backlog B-04 |
| DES-02 | Some export deviations are unexplained: context panes of 280px vs 340px, a 56×48 Quick Add bubble vs 58×48, tab labels at 12/500 vs 11/600, and a sheet shadow of 12% vs 20%. | `src/styles/design-workspaces.css:120-122,134-143` | VERIFIED-CODE | LOW | Question 12 |
| DES-03 | The Journey CSS module uses both `--border` and `--line` for separators. | `src/components/WorkflowJourney.module.css` | VERIFIED-CODE | LOW | JITM-06 §2; backlog B-04 |
| DES-04 | `invitations.css` loads after the shared consistency layers that are meant to load last. | `src/styles/index.css:38` | VERIFIED-CODE | LOW | JITM-06 §2; backlog B-04 |
| DES-05 | No pixel baseline covers the shipped design layer; `visual-fitment` checks legacy CSS only. | `e2e/visual-fitment.spec.ts:80-88` | VERIFIED-CODE | MEDIUM | JITM-12 §2; backlog B-05 |
| DES-06 | Measured drift against the design rules is recorded in the drift baseline: color literals, native confirms, raw icons, stray fonts and breakpoints. | [drift baseline](standards-audit-2026-09-28/DRIFT_BASELINE.md) | VERIFIED-CODE | MEDIUM | JITM-06 §6; backlog B-04 |
| LAY-01 | Older documents give wrong layout facts: a 1100px Today split, 324–380px queues, a one-column phone profession directory. The code and the export say 768px, 300–440px and two columns. | `docs/design/DESIGN_ADOPTION_2026-09-19.md:12`; `src/lib/sheet-layout.ts:1`; `docs/design/jump-in-the-mix-designs/screens/LandingPhone.html` | VERIFIED-CODE | LOW | JITM-07 §2 |
| LAY-02 | The rule that Journey uses a 1672px maximum width conflicts with the full-width graph. | `docs/design/DESIGN_GUIDELINES.md:30`; `src/components/WorkflowJourney.module.css:1` | VERIFIED-CODE | LOW | JITM-07 §2 (D4) |
| UXP-01 | FormGuard keeps two native confirms (the navigation and reload guards), but the documented exception covers only one. | `src/components/FormGuard.tsx:24,45` | VERIFIED-CODE | LOW | JITM-08 §2 |
| UXP-02 | No design rule existed for empty, loading, error or offline states, or for how long toasts stay and how they stack. | `docs/UI_UX_PRODUCT_READINESS_AUDIT_2026-09-18.md` | VERIFIED-DOC | MEDIUM | JITM-08 §2 |
| ACC-01 | The 2026-09-28 Journey people rows moved stage, status and due details into a hover tooltip. Access for touch and keyboard users is unverified. | commit 4b7b0bc | INFERRED | MEDIUM | JITM-10 §6; backlog B-05 |
| ACC-02 | Every physical-device qualification row is NOT RUN. | `docs/MANUAL_DEVICE_QUALIFICATION.md:7-48` | VERIFIED-DOC | MEDIUM | JITM-10 §6 |
| ACC-03 | The active Beat number puts white text on `--violet-mark`, which measures 3.80:1 in the dark theme, below the 4.5:1 text minimum. | `src/styles/design-tokens.css`; JITM-10 §6 | VERIFIED-CODE | MEDIUM | JITM-10 §2; backlog B-04 |

### Engineering, testing, git and release

| ID | Finding | Evidence | Label | Severity | Resolution |
|---|---|---|---|---|---|
| TST-01 | CI is not a working gate. The `validate` job exceeds its 60-minute cap, GitHub Actions has been blocked by billing since PR #86, and the local substitute skips the migration and restore rehearsals, Lighthouse and the image builds. | `.github/workflows/ci.yml:18-20`; `docs/APPEARANCE_INVITATIONS_RELEASE_2026-09-27.md:31` | VERIFIED-DOC | HIGH | JITM-12 §2 (local tiers); question 1 |
| TST-02 | The application-level outage alert chosen for REL-01 is an hourly production smoke on GitHub Actions, which has been billing-blocked since PR #86. It has probably not run since. Render failure notifications for the workspace, web, worker and backup cron were set by Kevin (owner confirmation, 2026-09-26), so service failures are still reported. | `docs/BETA_BLOCKERS_RELEASE_2026-09-26.md:27,58`; `docs/INVITE_PAGE_RELEASE_2026-09-27.md:30`; owner confirmation 2026-09-26 | INFERRED | MEDIUM | Question 1 (owner action) |
| TST-03 | Four different "run before a PR or release" lists exist: `npm run check`, CONTRIBUTING, LOCAL_TESTING and `ci.yml`. | `package.json`; `CONTRIBUTING.md:17-24`; `docs/LOCAL_TESTING.md:22-37` | VERIFIED-DOC | MEDIUM | JITM-12 §2 |
| TST-04 | The screenshot policy conflicts: a no-image instruction for device qualification versus required screenshot comparison for design work. | `docs/MANUAL_DEVICE_QUALIFICATION.md:5`; `AGENTS.md:21` | VERIFIED-DOC | LOW | JITM-12 §2; question 13 |
| ENG-01 | Timezone helpers are duplicated across five modules. | `src/lib/jump-schedule.ts`, `calendar-time.ts`, `planned-step.ts`, `date-input.ts`, `display-preferences.ts` | VERIFIED-CODE | LOW | JITM-11 §6; backlog B-07 |
| ENG-02 | A committed script reads and writes files that are absent from Git, so it fails on a clean checkout. | `scripts/audit-industry-mixes.mjs:8,10` | VERIFIED-CODE | LOW | Backlog B-07 |
| GIT-01 | CONTRIBUTING's `feature/…` branches and prefixed commit subjects were never used. About 20% of recent subjects exceed 72 characters. | `CONTRIBUTING.md:28-44`; `git log` | VERIFIED-DOC | LOW | JITM-13 §2 (D10) |
| GIT-02 | There is no PR template, CODEOWNERS file or branch protection, and 115 remote branches exist, including `backup/` and `agent/` prefixes. | `git branch -r` | VERIFIED-DOC | LOW | PR template (this change); backlog B-07 |
| REL-01 | The release pipeline, the per-release preflight, deploy, postflight, smoke and finalize scripts, exists only in the git-ignored `.artifacts/`. | `docs/FULL_AUDIT_2026-09-24.md:116` | VERIFIED-DOC | MEDIUM | JITM-14 §2, WF-06; question 6 |
| REL-02 | The written rule requires a fresh backup before every release, but only migration releases took one. | `AGENTS.md:17`; `docs/AUDIT_RELEASE_B_2026-09-25.md:84` | VERIFIED-DOC | MEDIUM | JITM-14 §2; question 5 |
| REL-03 | Deploy and rollback order vary. The runbooks say web first. Practice since 2026-09-21 deploys the worker first, and 2 of 11 records rolled back worker-first. | `docs/HOSTED_DEPLOYMENT.md:55-62`; `docs/AUDIT_RELEASE_C1_2026-09-25.md:38` | VERIFIED-DOC | LOW | JITM-14 §2 |
| REL-04 | The staging rule is retired (D5), but its configs, scripts and workflows remain: `playwright.staging.config.ts`, `scripts/staging-smoke.mjs` and `private-test-worker.yml`. | those files | VERIFIED-CODE | LOW | JITM-14 §2; backlog B-07 |

### Agent operating rules

| ID | Finding | Evidence | Label | Severity | Resolution |
|---|---|---|---|---|---|
| AGT-01 | Before this change, the repository had no agent standard and no shared skills. Codex never saw `.claude/skills`, and Claude Code never saw `.agents/skills`. | [verification](standards-audit-2026-09-28/VERIFICATION.md) | VERIFIED-CODE | MEDIUM | JITM-16; skills; router (this change) |
| AGT-02 | Host-level agent identity instructions outside the repository forbid merges and releases for fleet work. That conflicts with the JITM standing release authority (O3). | lead's review; `docs/FULL_AUDIT_2026-09-24.md:116` | VERIFIED-DOC | MEDIUM | JITM-14 §2 (stricter rule, ask Kevin); JITM-16 §2 |
| AGT-03 | The owner's primary checkout sits on a stale branch with about 480 uncommitted and untracked files. Its older `AGENTS.md` lacks the Render section, so a session started there reads stale rules. | `git status` in the owner's checkout | VERIFIED-CODE | MEDIUM | JITM-16 §2.1, §2.9; JITM-13 §2; question 15 |
| AGT-04 | `CLAUDE.md` imported `@AGENTS.md`, and Claude Code expands that import only in the directory where the session starts. A Claude Code session started below the repository root therefore loaded no project rules at all. | [verification](standards-audit-2026-09-28/VERIFICATION.md) §1 | VERIFIED-CODE | HIGH | Fixed in this change: `CLAUDE.md` is now a symlink to `AGENTS.md` (JITM-16 §2.18) |

## 3. Documents that disagree with each other

- **Authority:** CANONICAL says it wins over everything, while the audits say the code wins (DOC-01).
- **Vocabulary:** CANONICAL, CONTRIBUTING and README each give a different vocabulary (VOC-01).
- **Audiences:** CANONICAL, the strategy, the roadmap and the ICPs each prioritize differently (ICP-01).
- **Invitations:** three ops documents say five; the 09-17 and 09-27 decisions say three (IAW-02).
- **Journey:** DESIGN_GUIDELINES carries both the stage map and the graph direction (DOC-02).
- **Deploy order:** the runbooks say web first; PR78 and AGENTS.md say worker first (REL-03).
- **Backups:** AGENTS.md and MIGRATION_RUNBOOK differ from the practice recorded in the release records (REL-02).
- **Screenshots:** device qualification says no images; the design rules require screenshots (TST-04).
- **Channel versions:** the storage contract §9b conflicts with the 2026-09-23 decision (IAW-07).
- **Marketplace moderation:** the 2026-09-24 owner rule conflicts with the Release A default recorded the same day (IAW-03).

## 4. Documents that disagree with the code

- **Sessions:** `docs/SECURITY.md:7` says `SameSite=Strict` with 14-day sessions. The code uses `lax` with a 90-day cap (`src/lib/auth.ts:95-105`).
- **Pre-deploy migrations:** `README.md:30` and `docs/DATABASE_RELEASE_CHECKS.md:8` describe them. The blueprint has no migrate step (`render.yaml:43`); migrations run as a reviewed one-off job.
- **Auto-deploy:** `docs/WORKER_RECOVERY_QUALIFICATION.md:21` says it is enabled. The blueprint turns it off (`render.yaml:46,78`).
- **Resource definitions:** `AGENTS.md:17` says the database and backup cron are defined in `render.yaml`. They live in `infra/operations/`.
- **Navigation:** CANONICAL, UX_WORKFLOW_OPTIMIZATION and IMPLEMENTATION_STATUS list Plans in the nav. The code uses Mixes, Journey and Calendar (VOC-01).
- **Retired features:** "Community publishing" is listed as retired (`docs/IMPLEMENTATION_STATUS.md:27`), but Marketplace shares shipped on 2026-09-24.
- **Automatic delivery:** listed as a feature (CON-02); it is off in production.
- **Admission capacity:** the admission document counts member invitations; the code excludes them (IAW-02).
- **Today invitation strip:** the record says "N invitations left"; the code says "You have N invitations to share." (`src/app/(app)/jumps/page.tsx:456`).

## 5. Gaps: no rule existed

The standards now fill each of these, with a rule or a flagged open decision:

- a written mission and promise;
- a casing and glossary rule for product nouns;
- precedence among agent files, standards, decisions and code;
- a Journey specification;
- a release procedure in the repository;
- record requirements for small releases;
- evidence labels;
- rules for empty, loading and error states;
- logo usage;
- a WCAG target;
- a screenshot policy;
- the code-only backup policy;
- rollback order;
- rules for when a document must change with the code;
- agent authority on this project;
- shared skills for both tools.

## 6. NOT READ / NOT RUN

- **Not read in depth:**
  - the 2026-09-24 design audit lane (`docs/audit-2026-09-24/design-a11y-responsive.md`) and the 2026-09-26 design lane (`docs/beta-audit-2026-09-26/lanes/08-design-a11y-copy.md`), which were grepped only;
  - the voice PRD beyond its reviewed residue;
  - the JSON industry audit, beyond its structure.
- **NOT RUN:**
  - browsers, builds and test suites (not needed for a documentation change);
  - production requests of any kind;
  - Render billing or plan checks;
  - whether the hourly smoke currently runs;
  - physical devices.
- **Environment:** the discovery probes and the behavior checks for the new skills are recorded in [verification](standards-audit-2026-09-28/VERIFICATION.md).

<a id="questions-for-kevin"></a>
## 7. Questions for Kevin

**Answered 2026-09-28.** Kevin answered all 18 questions. His answers are recorded as D13–D30 in the [owner decision record](standards-audit-2026-09-28/OWNER_DECISIONS.md) and applied to the standards; the product changes they call for are in §8. The questions stay below as asked.

None of these blocks the standards. The recommended answer is listed first.

1. **Outage alerting (TST-02, TST-01).** Render failure notifications (which you set on 2026-09-26) cover service failures. The hourly application smoke cannot run while GitHub Actions is billing-blocked. Options:
   - A: restore Actions billing so the hourly smoke runs again.
   - B: add a free external uptime check instead.
   - C: rely on Render notifications for now.
2. **Product copy fixes (VOI-01, VOI-02, VOI-03, VOC-02–05, IAW-05).** Options:
   - A: one batched copy task. It corrects the automation claim and the retired demo text, replaces the third-party method and author names with descriptive labels (D7), and aligns vocabulary and casing.
   - B: fix only VOI-01 and VOI-02 now.
3. **Marketplace moderation (IAW-03).** Options:
   - A: ratify the shipped rule: only verified private-information reports auto-hide, with a limit of two per reporter per day.
   - B: restore the 2026-09-24 rule, so offensive and spam reports also auto-hide.
4. **Journey stages (IAW-01).** Options:
   - A: keep stages as optional contact metadata in Stage settings, and fix the copy that calls Journey "stages".
   - B: retire stages.
5. **Backups before code-only releases (REL-02).** Options:
   - A: always take a fresh backup, as the current rule says.
   - B: take one only for migration releases, with the preflight confirming the nightly backup.
6. **Release pipeline (REL-01).** Options:
   - A: commit a parameterized release script and runbook under `scripts/release/`, with no evidence files.
   - B: keep the per-release scripts local.
7. **Missing release records (DOC-04).** Options:
   - A: back-fill short records for the seven tagged deploys and 4b5abd8.
   - B: list them as a known gap.
8. **UI structure (the 2026-09-22 instruction).** Options:
   - A: make it standing: preserve the current structure, and change it only to fix a workflow gap or when you ask.
   - B: it applied only to the 09-22 work.
9. **Journey labels (IAW-04).** Options:
   - A: accept labels that change with the view.
   - B: make labels stable across the account.
10. **Brand line and marks (ICP-02, ICP-03, BRD-01).** Options:
    - A: "Stay in the mix".
    - B: "Good relationships have a rhythm."
    - C: "A little follow-through goes a long way."
    - D: none yet.

    Also: is `public/icon-source.svg` (the "JM" monogram) retired?
11. **Voice (VOI-06).** Options:
    - A: first person singular by default, with "we" only when the owner's business is a crew.
    - B: other.
12. **Design deviations (DES-02).** Options:
    - A: codify the shipped values.
    - B: restore the export values.
13. **Screenshots (TST-04).** Options:
    - A: synthetic data only, kept in `.artifacts/`, and committed only after sanitizing.
    - B: other.
14. **Open Journey product questions:** status taxonomy, catch-up policy after pauses, strong/weak targets, emailing member invitations, early updates for legacy Mixes, tooltip access. JITM-09 §6 lists them; answer when convenient.
15. **Primary checkout (AGT-03).** Options:
    - A: an agent inventories it read-only and proposes a cleanup.
    - B: leave it as it is.

16. **Pricing wording (D11).** D11 is applied as "no prices, tiers or payment terms". The claim you reviewed on 2026-09-18, that accounts are free with no payment card, stays usable. Options:
    - A: confirm.
    - B: strict reading: say only "free beta, access by invitation or waitlist", and remove "no card" from shipped copy.
17. **The "Ready-made mixes" library.** It still has its own entry (More, desktop; `/templates`) beside the Marketplace's Jump in the Mix section. Options:
    - A: keep both.
    - B: fold the library into the Marketplace and drop the separate entry.
18. **Merging (O3).** Pull requests have been merged from your GitHub account, by you or at your instruction. JITM-16 §2.5 proposes that agents never merge on their own. Options:
    - A: confirm (agents merge only when you explicitly tell them to, or not at all).
    - B: other.

## 8. Follow-up backlog

None of these are part of this documentation-only change. Each item becomes its own task under WF-04, WF-03 or WF-08.

**Update 2026-09-28 (D14):** B-01, B-02 and B-03 run as one coordinated copy batch under WF-03, which also checks template claims about availability and deadlines. It includes the Contact stages wording (D16) and the pricing example (D28). B-08, B-09 and B-11 to B-19 come from Kevin's answers (D13–D30); B-10 is unused, because the Contact stages wording joined the copy batch.


- **B-01 (HIGH):** correct the reminders-page automation claim and the retired demo text on the template and feature pages (VOI-01, VOI-02).
- **B-02 (MEDIUM):** a copy pass for vocabulary, casing, glossary wording, Help and FAQ terms, stage wording on More and Settings, the waitlist confirmation, the invitation-email promise and the social card (VOC-02–05, IAW-01, IAW-05, VOI-07, ICP-02).
- **B-03 (HIGH):** replace third-party sales-method and author names in ready-made plans and search with descriptive labels, and add "only if true" cues to ready-made messages that assert facts (VOI-03, VOI-05). Question 2 is answered (D14).
- **B-04 (MEDIUM):** design-token and stylesheet drift: the dark `--accent` value, tokens for export literals, separator usage, import order, and the counts in the drift baseline (DES-01, DES-03, DES-04, DES-06).
- **B-05 (MEDIUM):** a pixel baseline for the shipped design layer, compared in context with the export (D24), and making the Journey people-row details reachable by tap and keyboard, verified on real input (DES-05, ACC-01, D26f).
- **B-06 (MEDIUM):** a documentation correction pass on stale runbooks and entry documents: sessions, deploy order, Netlify pages, pre-deploy migrations, auto-deploy, five invitations, Plans, the storage contract §9b and dead links (DOC-03, DOC-05, CON-02, IAW-02, IAW-07).
- **B-07 (LOW):** engineering hygiene: consolidate the timezone helpers, fix the industry-audit script's dependency on untracked files, retire the staging configs, and prune remote branches (ENG-01, ENG-02, REL-04, GIT-02).
- **B-08 (HIGH):** set up a free external uptime monitor on the public site and the application health endpoint, and test that its alerts reach Kevin (D13; JITM-14 §2.30). Owner step: restore GitHub Actions billing for CI and the hourly smoke.
- **B-09 (MEDIUM):** say in the Marketplace report, help and staff wording that "verified" means the reporter's email; confirm that `mixes.publish` is held by Kevin and name a backup moderator when needed (D15; JITM-09 §2.49, §2.70).
- **B-11 (MEDIUM):** commit the reusable release script and runbook under `scripts/release/`, with the fresh backup automated (D17, D18; JITM-14 §2.10, §2.12).
- **B-12 (LOW):** back-fill reconstructed records for the seven tagged deploys without one and for 4b5abd8 (D19; JITM-15 §2.19).
- **B-13 (MEDIUM):** compute Journey labels from the account's complete graph and filter per view, so switching views never renames a Mix (D21; JITM-09 §2.54).
- **B-14 (LOW):** pair "Stay in the mix" with a literal description, align the footer line and the social card, and remove the retired monogram and its proxy allowlist entry (D22; JITM-02 §2.14, JITM-03 §2.9).
- **B-15 (MEDIUM):** check and fix the Journey rules for status and stage labels, resume review, target states and the stop-only early update (D26a–c, e; JITM-09 §2.58, §2.71–§2.73).
- **B-16 (MEDIUM):** optional invitation email after a preview and an explicit Send invitation, keeping personal sharing and copy link (D26d; JITM-09 §2.18). A WF-04 feature.
- **B-17 (HIGH):** onboarding recommends one person and one follow-up, with Mega-Mix setup as an optional next step; observe whether testers prepare a first follow-up without help (D26g; JITM-09 §2.20).
- **B-18 (MEDIUM):** a read-only inventory of the owner's primary checkout, with a cleanup proposal (D27; AGT-03).
- **B-19 (MEDIUM):** fold the Ready-made mixes library into the Marketplace's Jump in the Mix section, keeping filters, previews, favorites and guided setup, redirecting the old entry and keeping setup links working (D29; JITM-09 §2.74).
- **B-20 (LOW), added 2026-10-12:** on Today, keep a card whose review is open in place when a refresh brings another of that person's follow-ups onto the page. The card is placed by the person's latest follow-up on the page, so it moves and the review closes (D99's older case; JITM-08 §2.33, §2.36).
