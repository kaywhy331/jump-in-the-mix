---
id: JITM-16
title: Agent operating standard
status: active
version: 2.0.0
owner: Kevin
last_reviewed: 2026-09-28
applies_to: [agents, claude-code, codex, all-tasks]
supersedes: []
sources:
  - AGENTS.md
  - CLAUDE.md
  - docs/standards-audit-2026-09-28/OWNER_DECISIONS.md
  - docs/standards-audit-2026-09-28/VERIFICATION.md
  - docs/BETA_READINESS_AUDIT_2026-09-26.md
related_skills: [jitm-ui-change, jitm-copy, jitm-feature, jitm-review, jitm-release, jitm-audit, jitm-standards-update]
related_workflows: [WF-01, WF-08]
---

# JITM-16 — Agent operating standard

> How any AI agent, whether Claude Code, Codex or another tool, takes in, performs and reports work in this repository.

## 1. Purpose and scope

This standard applies to every agent session that reads, changes, reviews, releases or reports on Jump in the Mix. That includes interactive and scheduled sessions, in any tool. People who follow the same workflows use it too.

It governs how agents start a task, what they may decide alone, how they report, and how Claude Code and Codex see the same rules. Product, design and engineering rules live in the other standards; this one says how to apply them. Evidence labels are defined in JITM-12 §2. Amendments follow JITM-17.

## 2. Rules

### Starting a task

**2.1** Agents MUST start sessions at the repository root or at the root of a task worktree, then work in the task worktree (JITM-13 §2.1). Sessions started outside the repository (for example in the home directory) do not load `AGENTS.md` or the shared skills. Sessions anywhere inside it do, because Codex reads `AGENTS.md` from the repository root down to the working directory and `CLAUDE.md` is a symlink to `AGENTS.md`. [SOURCE docs/standards-audit-2026-09-28/VERIFICATION.md:19,35,38] [OWNER 2026-09-28 O6] [PROPOSED]

**2.2** Every task MUST enter through WF-01:
- read the router in `AGENTS.md`;
- classify the task;
- load every matching skill;
- list the standards that apply;
- check for open owner decisions before planning. [OWNER 2026-09-28 O6]

**2.3** Plans, reviews and pull requests MUST name the workflow and skills used and cite the rules applied (`JITM-NN §2.N`). [OWNER 2026-09-28 O6] [PROPOSED]

**2.4** When a task spans areas, agents MUST load every matching skill (for example UI, copy and feature together) rather than the first one that fits. [PROPOSED]

### Authority

**2.5** Agents prepare, validate and open pull requests on their own, but MUST NOT merge one without Kevin's explicit authorization for that pull request or for a clearly defined batch. Once he has authorized it, the agent completes the merge without asking for the same permission again. Where a permission prompt or classifier refuses the merge, the agent stops and tells Kevin. [OWNER 2026-09-28 D30]

**2.6** Agents MAY run production release steps on Kevin's behalf, but only when the task explicitly asks for a release, deploy or rollback, and only through WF-06 and JITM-14. [OWNER 2026-09-24 O3] [PROPOSED]

**2.7** Agents MUST NOT decide new product behavior, pricing, access rules, customer promises or vocabulary. They propose the change and ask, following the concept-fit test in JITM-01 §2. [OWNER 2026-09-28 O6] [OWNER 2026-09-28 D11] [PROPOSED]

**2.8** Agents MUST NOT add a paid service, plan upgrade or cost-bearing dependency without Kevin's approval. [OWNER 2026-09-25 O4] [PROPOSED]

**2.9** Agents MUST NOT run destructive Git operations in a checkout they did not create for the task. Destructive means reset, clean, stash, forced checkout or force-push. A shared checkout can hold other work in progress. [SOURCE docs/STANDARDS_AUDIT_2026-09-28.md:144]

**2.10** Agents MUST NOT read customer workspace data or production data outside the audited support-case path or checks Kevin approved (JITM-11 §2). [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:16]

**2.11** Repository tasks MUST NOT edit user-level or machine-level agent instruction files, such as a home-directory `CLAUDE.md`, a global Codex `AGENTS.md` or fleet configuration. [PROPOSED]

**2.24** When an agent's own operator or host instructions are stricter than a standard (for example forbidding releases or merges), the agent follows the stricter instruction and asks Kevin. [PROPOSED]

### Honesty and reporting

**2.12** Agents MUST report outcomes with the evidence labels in JITM-12 §2 and MUST NOT claim completion they have not verified. [SOURCE docs/FULL_AUDIT_2026-09-24.md:9] [SOURCE docs/BETA_READINESS_AUDIT_2026-09-26.md:359]

**2.13** When a check fails, the report MUST say so and include the relevant output. Before calling a failure a regression, agents MUST compare it with the baseline in JITM-12 §2.14. [PROPOSED]

**2.14** Agents MUST NOT fabricate facts, metrics, customer evidence, quotes or decisions. Unknowns are stated as unknown (JITM-00 §2). [OWNER 2026-09-28 O6] [PROPOSED]

**2.15** Reports MUST keep planned work, verified implementation and measured customer outcomes apart (JITM-15 §2). [SOURCE AGENTS.md:27]

### Stop and ask

**2.16** Agents MUST stop and ask Kevin when:
- a standard is silent on a choice that affects users;
- standards conflict with each other, or his instruction conflicts with a standard (confirm it, record it through WF-08; it then wins per JITM-00 §2.12);
- the task needs new product behavior, pricing, legal or security-policy changes;
- an action is destructive or irreversible outside the task's worktree;
- a release gate fails;
- a tool or safety classifier blocks a step.

They MUST NOT route around a blocked step. [OWNER 2026-09-28 O6] [PROPOSED]

**2.17** When Kevin decides something during a task, agents MUST record it as JITM-15 §2.11 and WF-08 describe. [OWNER 2026-09-28 O6] [PROPOSED]

### Tool parity

**2.18** `AGENTS.md` is the single router for every tool. `CLAUDE.md` MUST stay a relative symlink to `AGENTS.md`. An `@AGENTS.md` import is expanded only in the directory where a Claude Code session starts, so sessions started in a subdirectory lost the router; the symlink loads it from any directory. The Next.js agent-rules block MUST stay first and unchanged. `next dev` rewrites only the text between its markers, inside `AGENTS.md`. [SOURCE AGENTS.md:1] [SOURCE docs/standards-audit-2026-09-28/VERIFICATION.md:17-19,27]

**2.19** Shared skills live in `.agents/skills/<name>/SKILL.md`, which Codex reads. `.claude/skills` is a relative symlink to that directory, which Claude Code reads.
- Agents MUST edit skills only under `.agents/skills`.
- Skill frontmatter MUST contain only `name` and `description`.
- Agents MUST run `npm run standards:check` after changing a skill.

[SOURCE docs/standards-audit-2026-09-28/VERIFICATION.md:11-14,26]

**2.20** Any instruction one tool needs MUST be visible to both. Agents MUST NOT add tool-specific instruction files without pairing them for the other tool and recording the change through WF-08. Examples: nested `AGENTS.md` files, hooks, per-tool rule files. [PROPOSED]

### Communicating with Kevin

**2.21** Reports to Kevin SHOULD lead with the outcome and use short lines. He reads agent output in a narrow terminal that wraps long lines. [PROPOSED]

**2.22** Agents MUST NOT hand Kevin long or multi-line commands to paste. Put the script in a file inside the task worktree, give one short command, and say which environment it is for. [PROPOSED]

**2.23** Open questions SHOULD go out in one batch, and each SHOULD be answerable with a letter or a short phrase. [PROPOSED]

## 3. Canonical implementations

- `AGENTS.md`: the router. `CLAUDE.md`: a symlink to it, for Claude Code.
- `.agents/skills/`: the shared skills. `.claude/skills` is a symlink to them.
- `docs/standards/workflows/WF-01-task-intake.md`: intake for every task.
- `.github/pull_request_template.md`: the evidence checklist.
- `scripts/check-standards.mjs` (`npm run standards:check`): structural checks.
- For third-party material and local-only sources, follow JITM-04 §2 and JITM-15 §2. This standard does not restate them.

## 4. Do / Don't

- **Do** open a plan with: "WF-02 with jitm-ui-change and jitm-copy; applies JITM-06 §2, JITM-07 §2 and JITM-05 §2; no open decisions."
- **Do** end a report with a NOT RUN list, even when it is empty.
- **Don't** start a Codex or Claude Code session in the home directory and edit repository files by absolute path.
- **Don't** write "tests pass" without naming the commands and their results.
- **Don't** merge your own pull request, or ask a tool to bypass a blocked step.

## 5. Verification

- `npm run standards:check` passes.
- From the repository root, `codex debug prompt-input "x"` shows the router text and every `jitm-*` skill.
- A Claude Code session at the root lists every `jitm-*` skill.
- Pull request descriptions name the workflow, skills and cited rules, and include NOT RUN.

## 6. Open decisions and known deviations

- Scheduled fleet agents may start outside this repository. Their cycle prompts need a pointer to this router. That is an owner option outside this repository.
- Enforcement is advisory (D8). Nothing blocks a push that skips these rules; reviews apply JITM-17 §2.
- **Primary checkout.** Kevin approved a read-only inventory of his primary checkout and a cleanup proposal (D27). It is backlog B-18; until then, agents leave that checkout untouched (§2.9).

## 7. Changelog

- 1.0.0 — 2026-09-28 — Initial version.
- 2.0.0 — 2026-09-28 — Base 61d4df4. §2.5: agents merge only with Kevin's explicit authorization for a pull request or a defined batch (D30). §6 records D27.
