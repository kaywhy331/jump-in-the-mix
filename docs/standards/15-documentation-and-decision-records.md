---
id: JITM-15
title: Documentation and decision records
status: active
version: 1.1.0
owner: Kevin
last_reviewed: 2026-09-28
applies_to: [docs, records, decisions, evidence, local-only-sources]
supersedes: []
sources:
  - AGENTS.md
  - docs/AUDIT_RELEASE_A2_2026-09-25.md
  - docs/INVITE_PAGE_RELEASE_2026-09-27.md
  - docs/FULL_AUDIT_2026-09-24.md
  - docs/BETA_READINESS_AUDIT_2026-09-26.md
  - docs/BETA_BLOCKERS_RELEASE_2026-09-26.md
  - docs/PRODUCT_SPEC.md
  - docs/PRODUCT_QUALITY_GATES.md
  - docs/standards-audit-2026-09-28/OWNER_DECISIONS.md
  - docs/standards-audit-2026-09-28/SOURCE_REGISTER.md
related_skills: [jitm-feature, jitm-release, jitm-audit, jitm-standards-update]
related_workflows: [WF-04, WF-06, WF-07, WF-08]
---

# JITM-15 — Documentation and decision records

> Which documents exist, what they are called, what a record must contain, how Kevin's decisions and superseded documents are kept, and how local-only sources and private evidence are handled.

## 1. Purpose and scope

This standard applies to everything written under `docs/` and to the private evidence behind it. It defines document types and names, the contents of release, implementation and audit records, the owner decision log, supersession banners, the planned, verified and measured labels, and the policy for local-only sources.

Neighboring topics live elsewhere:
- changing the standards themselves: JITM-17 and WF-08;
- evidence labels on checks: JITM-12 §2.1;
- when a release needs a record, and its tag: JITM-14 §2;
- third-party material and the clean-room rule: JITM-04 §2.

## 2. Rules

### Types and names

**2.1** Each document type has one home:
- standards and workflows: `docs/standards/` (JITM-17 governs them);
- living references (runbooks, policies, operations guides): `docs/<NAME>.md` in UPPER_SNAKE case, undated and kept current;
- dated records (release, implementation, audit, decision, qualification, handoff, fix): `docs/<TOPIC>_<KIND>_<YYYY-MM-DD>.md`;
- evidence folders: `docs/<topic>-<YYYY-MM-DD>/` in lowercase;
- owner decisions: `docs/standards-audit-2026-09-28/OWNER_DECISIONS.md`;
- private evidence: the git-ignored `.artifacts/<topic>-<YYYYMMDD>/`.

[PROPOSED]

**2.2** A dated record's name ends with its kind and its date, as in `AUDIT_RELEASE_A2_2026-09-25.md` or `TODAY_EMPTY_STATE_FIX_2026-09-25.md`. The date is the UTC date of the release or the work, and every time inside a record is UTC and says so. [SOURCE docs/APPEARANCE_INVITATIONS_RELEASE_2026-09-27.md:3] [SOURCE docs/FULL_AUDIT_2026-09-24.md:116]

**2.3** A living reference MUST change in the same pull request as the code or process it describes, or carry a banner that names the parts now out of date. [SOURCE docs/BETA_READINESS_AUDIT_2026-09-26.md:477-479 (problem evidence)] [PROPOSED]

**2.4** Relative links MUST point to tracked files. Local-only files and `.artifacts/` contents are named in code format, never linked. [SOURCE docs/UI_ICONS_PRODUCTION_RELEASE_2026-09-23.md:72 (problem evidence)] [PROPOSED]

### Records

**2.5** Besides release records (JITM-14 §2.20), a record is required for every audit (WF-07) and for implementation work worth releasing (WF-04). [OWNER 2026-09-28 O6] [PROPOSED] [SOURCE docs/FULL_AUDIT_2026-09-24.md:3]

**2.6** A release record contains, in this order:
1. a title `# <Name> — <Month D, YYYY>`, then the live URL and UTC time, what the release is, whether it is code-only or has a migration, and the one-line rollback;
2. a table: the previous production commit and tag; the application commit (the merge of PR #N) and tag; the migration and job, when present; any new dependency; the worker deploy id and live time; the web deploy id, live time and build; the final-check time;
3. what changed, by area and commit;
4. the decisions taken while building, numbered;
5. verification: where it ran, each check with its label (JITM-12 §2.1), the baseline method and how each failure was classified;
6. the release steps and their results, including failed attempts;
7. the rollback: order, any data reversal, and what the previous release ignores;
8. owner steps and NOT RUN;
9. follow-ups, carrying forward open items from earlier records.

[SOURCE docs/AUDIT_RELEASE_A2_2026-09-25.md:1-138] [SOURCE docs/INVITE_PAGE_RELEASE_2026-09-27.md:1-61]

**2.19** A record written after the fact is marked "Reconstructed" in its title line, with the date it was written. It follows §2.6 as far as the evidence allows: the commit, the deployment identifiers that exist, known changes, verification evidence and rollback context. Anything not found is written as unknown, and a check with no surviving evidence is never reported as run. [OWNER 2026-09-28 D19]

**2.7** A small follow-up release MAY be added to the previous record as a titled section with its own table, verification, release steps and rollback. [SOURCE docs/INVITE_PAGE_RELEASE_2026-09-27.md:63-94]

**2.8** An implementation record names the branch and pull request, and lists what changed by area, the decisions taken, the verification with labels, and the follow-ups. [SOURCE docs/AUDIT_RELEASE_A2_2026-09-25.md:25-60] [PROPOSED]

**2.9** An audit report uses the sections in JITM-17 §2. Its lane reports, findings table and runtime logs go in its evidence folder, which has a `README.md` index. [SOURCE docs/FULL_AUDIT_2026-09-24.md:3] [SOURCE docs/BETA_READINESS_AUDIT_2026-09-26.md:470-474]

**2.10** Records MAY name commits, tags, pull requests and deploy ids. They MUST NOT contain secrets, credentials, personal data or the contents of private evidence. [SOURCE docs/PRODUCT_QUALITY_GATES.md:36] [SOURCE docs/RELEASE_QUALIFICATION_2026-09-06.md:39]

### Owner decisions

**2.11** Kevin's decisions are recorded in the same task, as WF-08 describes: in the log, `docs/standards-audit-2026-09-28/OWNER_DECISIONS.md`, or in the dated record of the task where he made them. In the log:
- an answer to a question packet gets a `D<n>` entry: the question, the conflict, the decision and where it applies;
- any other decision gets an `O<n>` row: the date, the decision in Kevin's words where possible, and where it came from;
- ids are never reused, and a changed decision gets a new entry that names the one it replaces.

Standards cite a logged decision as `[OWNER <date> D<n>]` or `[OWNER <date> O<n>]`, and one kept in a record as `[OWNER <date> <path>:<line>]`.

Line numbers in SOURCE and OWNER tags, and in other `path:line` references, refer to the source file as it stood when the rule was written: `origin/main` 9439fd6 for every 1.0.0 rule (read them with `git show 9439fd6:<path>`). The program's own records (`docs/STANDARDS_AUDIT_2026-09-28.md` and `docs/standards-audit-2026-09-28/`), which 9439fd6 does not contain, are cited as merged with 1.0.0. Amendments and new standards name their base commit in the changelog line. SHIPPED tags name their commit.

[OWNER 2026-09-28 O6] [SOURCE docs/standards-audit-2026-09-28/OWNER_DECISIONS.md:7-9] [PROPOSED]

**2.12** When work cannot wait for Kevin, an agent MAY take a reversible default. The record lists it as a numbered default with its question. Until Kevin confirms it, standards cite it as `[SOURCE]`, not `[OWNER]`. [SOURCE docs/FULL_AUDIT_2026-09-24.md:136] [SOURCE docs/BETA_BLOCKERS_RELEASE_2026-09-26.md:5]

### History and supersession

**2.13** Documents are never deleted. A superseded document keeps a one-line banner at its top, naming what replaces it and the date:

`> Superseded on <YYYY-MM-DD> by <link>. Kept as history; do not implement from it.`

A document superseded only in part gets the banner on the affected section. [OWNER 2026-09-28 D3] [SOURCE docs/PRODUCT_SPEC.md:3-5] [SOURCE docs/design/DESIGN_ADOPTION_2026-09-19.md:3]

**2.14** Original source documents stay as supplied, including the design export, the ICP profiles and Kevin's briefs. Derived documents cite them rather than edit them, and implementation assumptions are written down separately. [SOURCE AGENTS.md:21,27]

### Labels for work and outcomes

**2.15** Documents keep three kinds of statement apart:
- **planned:** work intended but not done;
- **verified:** implementation proven, with evidence labeled per JITM-12 §2.1;
- **measured:** a customer or usage outcome, with the measurement and its source.

Planned or verified work MUST NOT be presented as a measured outcome. [SOURCE AGENTS.md:27] [SOURCE docs/ADMIN_UX_RELEASE_2026-09-16.md:3]

### Local-only sources and private evidence

**2.16** Private evidence (release scripts, receipts, logs and screenshots) lives in the git-ignored `.artifacts/` directory and is never published. A committed evidence folder holds only sanitized, synthetic material, and keeps screenshots in `captures/`, because `.gitignore` ignores `screenshots/`. [SOURCE docs/PRODUCT_QUALITY_GATES.md:36] [SOURCE docs/BETA_READINESS_AUDIT_2026-09-26.md:474] [SHIPPED 9439fd6 .gitignore:26,32]

**2.17** Files that exist only in the owner's local checkout stay out of Git. Documents refer to them by path and the first 16 hex digits of their SHA-256, as listed in `docs/standards-audit-2026-09-28/SOURCE_REGISTER.md`. No one claims to have read a file that was unavailable. [OWNER 2026-09-28 D6] [SOURCE AGENTS.md:25]

**2.18** Provider facts (limits, prices, retention windows) cite their source URL and the date they were checked. [SOURCE docs/EXTERNAL_DATA_RETENTION.md:23] [SOURCE docs/HOSTED_DEPLOYMENT.md:15]

## 3. Canonical implementations

- Model release records: `docs/AUDIT_RELEASE_A2_2026-09-25.md` (full) and `docs/INVITE_PAGE_RELEASE_2026-09-27.md` (lighter, with an appended follow-up release).
- Model audit: `docs/BETA_READINESS_AUDIT_2026-09-26.md` with its evidence folder `docs/beta-audit-2026-09-26/`.
- `docs/standards-audit-2026-09-28/OWNER_DECISIONS.md`: the decision log.
- `docs/standards-audit-2026-09-28/SOURCE_REGISTER.md`: every document's type and status, and the local-only files with their hashes.
- Banner examples: `docs/PRODUCT_SPEC.md:3-5` and `docs/PRODUCTION_PROMOTION_HANDOFF_2026-09-15.md:3`.

## 4. Do / Don't

- **Do** write "Live at https://jumpinthemix.com/ as of 2026-09-27 15:45 UTC" in a record's opening line.
- **Do** write "verified implementation; task-time improvements not measured", as the admin release record did.
- **Do** add a one-line banner to `CONTRIBUTING.md`'s superseded sections instead of deleting them.
- **Do** carry "Still open from Release A" items forward into the next record.
- **Don't** link `../.artifacts/...` from a tracked document; the link is dead for everyone else.
- **Don't** put Pacific dates in file names or record tables.
- **Don't** delete an old runbook because a standard replaced it.
- **Don't** commit a local-only file, or name a third-party author, to explain where a rule came from.

## 5. Verification

- New files follow §2.1–§2.2: `ls docs/` shows UPPER_SNAKE names with a trailing UTC date for records, and lowercase evidence folders.
- A release record has every part in §2.6, in order, with UTC times.
- `npm run standards:check` passes for documents it scans, and a link check over changed documents finds no dead relative links.
- Superseded documents carry the §2.13 banner.
- `git ls-files .artifacts` prints nothing.

## 6. Open decisions and known deviations

- **Release evidence is untracked.** Scripts and receipts live only in `.artifacts/`, and no retention policy covers them (`docs/EXTERNAL_DATA_RETENTION.md:21`). Whether a sanitized copy may be tracked is open (JITM-14 §6).
- **Missing records.** Several production deploys have no record (JITM-14 §6). Kevin chose reconstructed records under §2.19 (D19); the back-fill is a backlog task.
- **Dead links.** Tracked documents still link to local-only files, `.artifacts/` and removed source files, against §2.4. The source register lists them (`docs/standards-audit-2026-09-28/SOURCE_REGISTER.md:98-121`).
- **Banners still missing** on `CONTRIBUTING.md`'s superseded sections, `docs/CANONICAL_PRODUCT_DECISIONS.md`, `docs/FREE_TESTING.md` and `docs/NETLIFY_DEPLOYMENT.md`. `docs/PRODUCTION_PROMOTION_HANDOFF_2026-09-15.md:111` still names `PRODUCT_COMPLETION.md` and `PRODUCTION_LAUNCH_PLAN.md` as the release history; per-release records replaced them.
- **Decisions inside records.** Many earlier owner decisions live only inside release and audit records. The log gained O1–O7; older ones stay where they are unless a standard cites them.
- **Local-only files.** Kevin may later ask to commit his own local documents (D6), including two production release records.

## 7. Changelog

- 1.0.0 — 2026-09-28 — Initial version.
- 1.1.0 — 2026-09-28 — Base 61d4df4. New §2.19 for reconstructed release records (D19).
