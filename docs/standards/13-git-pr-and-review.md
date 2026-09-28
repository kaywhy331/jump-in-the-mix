---
id: JITM-13
title: Git, PR and review
status: active
version: 1.0.1
owner: Kevin
last_reviewed: 2026-09-28
applies_to: [git, worktrees, branches, commits, pull-requests, reviews]
supersedes: [CONTRIBUTING.md#branch-and-commit-conventions]
sources:
  - CONTRIBUTING.md
  - AGENTS.md
  - .github/pull_request_template.md
  - docs/standards-audit-2026-09-28/OWNER_DECISIONS.md
  - docs/HOMEPAGE_RELEASE_AND_ROLLBACK_2026-09-10.md
  - docs/PR78_PRODUCTION_PROMOTION_DECISION_2026-09-16.md
  - docs/UI_ICONS_PRODUCTION_RELEASE_2026-09-23.md
  - docs/FULL_AUDIT_2026-09-24.md
  - docs/audit-2026-09-24/tests-quality-process.md
  - docs/BETA_READINESS_AUDIT_2026-09-26.md
  - docs/BETA_BLOCKERS_RELEASE_2026-09-26.md
related_skills: [jitm-feature, jitm-ui-change, jitm-copy, jitm-review, jitm-release, jitm-standards-update]
related_workflows: [WF-01, WF-04, WF-05, WF-06, WF-08]
---

# JITM-13 — Git, PR and review

> How work moves through Git: a worktree per task, branch and commit names, pull requests, review and merging.

## 1. Purpose and scope

This standard applies to every change that reaches the repository, whether a person or an agent makes it. It replaces the "Branch and commit conventions" section of `CONTRIBUTING.md` (D3, D10).

Neighboring topics live elsewhere:
- who may merge, and destructive Git operations: JITM-16 §2;
- evidence and check tiers: JITM-12 §2;
- releasing a merged commit: JITM-14 and WF-06;
- record documents: JITM-15;
- the review rubric and severities: JITM-17 §2.

## 2. Rules

### Worktrees

**2.1** Every task MUST run in its own Git worktree created from a fresh `origin/main`: `git fetch origin`, then `git worktree add -b <branch> <path> origin/main`. Release and audit work use a worktree at the exact commit under test. [SOURCE docs/UI_ICONS_PRODUCTION_RELEASE_2026-09-23.md:17] [SOURCE docs/BETA_READINESS_AUDIT_2026-09-26.md:452] [PROPOSED]

**2.2** Agents MUST NOT make changes in a checkout that holds work that is not theirs, such as the owner's working copy with uncommitted changes. They create a worktree instead and leave that checkout as it was. [SOURCE docs/UI_ICONS_PRODUCTION_RELEASE_2026-09-23.md:21] [SOURCE docs/BETA_READINESS_AUDIT_2026-09-26.md:452-453]

### Branches

**2.3** Branch names follow `<type>/<topic>-<YYYYMMDD>`:
- the type is `feat`, `fix`, `docs`, `ci` or `release`, and `chore` MAY be used for maintenance;
- the topic is a few lowercase words joined by hyphens;
- the date is the UTC day the branch is created.

Example: `feat/journey-map-navigation-20260928`. [OWNER 2026-09-28 D10]

**2.4** A release record goes on a `docs/<topic>-record` branch with no date, where the topic names the release, for example `docs/invite-page-record`. [PROPOSED]

### Commits

**2.5** Commit subjects are imperative and in sentence case, with no type prefix, no trailing period and at most 72 characters. A finding or task id goes in parentheses at the end, as in "Import a person whose date cannot be read (DATA-03)". [OWNER 2026-09-28 D10] [PROPOSED]

**2.6** The 72-character limit applies to new commits. History is never rewritten to meet it. [OWNER 2026-09-28 D10] [PROPOSED]

**2.7** Each commit holds one logical change. Its body says what changed for the person using the product and why, in wrapped plain sentences. [OWNER 2026-09-28 D10] [PROPOSED]

**2.8** The only prefixed subject is the release-record commit: `docs: record the <release> release (<sha7>)`, where `<sha7>` is the deployed commit. [PROPOSED]

**2.9** Commits keep the `Co-Authored-By:` trailer that the agent tool adds. Agents MUST NOT remove it or misstate authorship. [PROPOSED]

**2.10** The Next.js agent-rules block in `AGENTS.md` is committed exactly as `next dev` writes it. If `next dev` re-adds or rewrites it during a task, commit that change with the work rather than dropping it from the diff. [SOURCE AGENTS.md:7]

**2.11** Before each commit, agents MUST review the staged diff and commit only files that belong to the task. `.artifacts/`, `src/generated/`, test reports and anything JITM-11 §2.41 forbids never enter a commit. [SHIPPED 9439fd6 .gitignore:5,26,30-31] [SOURCE CONTRIBUTING.md:55]

### Pull requests

**2.12** Every change reaches `main` through a pull request. Nothing is pushed to `main` directly. [SOURCE docs/BETA_BLOCKERS_RELEASE_2026-09-26.md:3] [SOURCE docs/FULL_AUDIT_2026-09-24.md:154]

**2.13** The description follows `.github/pull_request_template.md`:
- what changed and why;
- the workflow, skills and cited rules;
- the evidence, labeled per JITM-12 §2.1;
- the NOT RUN list;
- the rollout.

[OWNER 2026-09-28 D8]

**2.14** Evidence in a pull request MUST be for its final head commit. Results from an earlier commit do not carry over, so checks are rerun after every push that changes code. [SOURCE docs/PR78_PRODUCTION_PROMOTION_DECISION_2026-09-16.md:33]

**2.15** A pull request that changes the schema or stored data includes migration notes and a rollback plan: what the previous release does with the new schema and data (JITM-11 §2.28). [SOURCE CONTRIBUTING.md:51]

**2.16** For stacked pull requests, merge the base first and retarget every dependent before deleting the base branch. Stack them so each merged tree equals the tree that was verified. [SOURCE docs/HOMEPAGE_RELEASE_AND_ROLLBACK_2026-09-10.md:18,75]

**2.17** A feature pull request contains no release steps. After it is merged, releasing is a separate task through WF-06. [SOURCE docs/BETA_BLOCKERS_RELEASE_2026-09-26.md:3] [SOURCE docs/INVITE_PAGE_RELEASE_2026-09-27.md:8]

### Review and merge

**2.18** Pull requests are reviewed through WF-05 and scored with the rubric in JITM-17 §2. A pull request is ready to merge only when the verdict is Approve, or when Kevin accepts the open findings. [OWNER 2026-09-28 O6] [PROPOSED]

**2.19** Pull requests are merged with a merge commit. Squash and rebase merges MUST NOT be used: tags and records point at merge commits, and squashing rewrites authorship. Who may merge: JITM-16 §2.5. [OWNER 2026-09-28 D10] [PROPOSED] [SOURCE docs/audit-2026-09-24/tests-quality-process.md:169]

## 3. Canonical implementations

- `.github/pull_request_template.md`: the pull request checklist.
- WF-05 (review) and the rubric in JITM-17 §2.
- Model history on `main`:
  - branch `feat/invite-page-redesign-20260927` became PR #88, merge commit `1da264f`, tag `prod-2026-09-27-1da264f`, then record branch `docs/invite-page-record`;
  - subject `1ebcf48` "Schedule a promised follow-up exactly once, at the chosen time (LOOP-01)";
  - record subject `e3b16a1` "docs: record the invitation send-clarity release (2313748)".

## 4. Do / Don't

- **Do** start with `git fetch origin` and a new worktree, even for a one-line documentation fix.
- **Do** run `npm ci` in a new worktree before its checks; it has no `node_modules` of its own.
- **Do** keep the release record in its own `docs/<topic>-record` pull request.
- **Don't** use CONTRIBUTING's old forms such as `feature/contact-import` or `feat: add contact import preview`.
- **Don't** delete a stacked pull request's base branch first; on 2026-09-15 that closed #66 instead of retargeting it.
- **Don't** squash-merge, even for a one-commit pull request.
- **Don't** describe a local, git-ignored hook or guard as repository protection. The repository has no branch protection.

## 5. Verification

- `git branch --show-current` matches §2.3 or §2.4.
- `git log --format=%s origin/main..HEAD` shows no subject longer than 72 characters and no type prefix except a record commit.
- `git status` in the task worktree shows only the task's files; `git diff --stat origin/main...HEAD` matches the pull request's scope.
- The pull request description has every template section, including NOT RUN.
- After merge, `git log --merges -1` shows "Merge pull request #N".

## 6. Open decisions and known deviations

- The repository is private and cannot carry branch protection. There are no CODEOWNERS or hooks, and enforcement is advisory (D8; `docs/FULL_AUDIT_2026-09-24.md:10`).
- About one in five recent commit subjects exceeds 72 characters. History stays as it is (§2.6).
- One audit report reached `main` as a local merge (`a57520c`) rather than through a pull request, against §2.12.
- About 115 remote branches remain, including historical `agent/`, `codex/` and `backup/` prefixes. Kevin: prune merged branches, or keep them?
- GitHub Actions does not run on pull requests while billing is blocked; evidence comes from local runs (JITM-12 §2.12).
- `CONTRIBUTING.md:28-44` still shows the old conventions and needs the one-line supersession banner (JITM-15 §2.13).
- Commits carry a personal-domain author address; the hygiene review suggests a GitHub no-reply address (`docs/PUBLIC_REPOSITORY_HYGIENE.md:15`). Kevin: switch, or keep?

## 7. Changelog

- 1.0.0 — 2026-09-28 — Initial version.
- 1.0.1 — 2026-09-28 — Base 61d4df4. §2.17–§2.19 point to JITM-16 §2.5 for who merges (D30).
