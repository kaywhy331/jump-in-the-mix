# Jump in the Mix standards

This is the rulebook for how Jump in the Mix looks, sounds, behaves and is built. Every agent session follows it, whether it runs in Claude Code or Codex, and so does every contributor. [`AGENTS.md`](../../AGENTS.md) routes each task to the right workflow, skills and standards. The standards replace the scattered dated documents as the source of rules. Those documents remain as history and evidence (see [JITM-00](00-constitution.md) and the [migration ledger](../standards-audit-2026-09-28/MIGRATION_LEDGER.md)).

## How to use the standards

1. Start at the repository root or at a task worktree's root, and read `AGENTS.md`.
2. Follow [WF-01](workflows/WF-01-task-intake.md): classify the task, load the matching skills and list the standards that apply.
3. Cite rules as `JITM-06 §2.3` in plans, reviews and pull requests.
4. When a standard is silent, or conflicts with an instruction from Kevin, stop and ask (JITM-16 §2.16). Record his answer through [WF-08](workflows/WF-08-standards-amendment.md).

JITM-00 §2 defines precedence between these standards, the design export, shipped code and dated records.

## Standards

| ID | Standard | Governs |
|---|---|---|
| JITM-00 | [Constitution](00-constitution.md) | Mission, promise, non-negotiable principles, precedence |
| JITM-01 | [Product concept, goals and non-goals](01-product-concept-and-goals.md) | What JITM is and isn't, core loop, goals, non-goals, feature map |
| JITM-02 | [ICP and positioning](02-icp-and-positioning.md) | Audiences, ICP hypotheses, positioning, claimable differentiators |
| JITM-03 | [Brand identity](03-brand-identity.md) | Name, logo, wordmark, brand color, bubble motif, imagery, email identity |
| JITM-04 | [Voice, tone and copy](04-voice-tone-and-copy.md) | Voice, registers, microcopy, message tone, persuasion floor, clean-room |
| JITM-05 | [Vocabulary and glossary](05-vocabulary-and-glossary.md) | Customer terms, numbering, retired terms, capitalization |
| JITM-06 | [Design system](06-design-system.md) | Export authority, tokens, color, type, shape, icons, themes, components, CSS |
| JITM-07 | [Layout and responsive structure](07-layout-and-responsive-structure.md) | Breakpoints, navigation layout, page archetypes, workspaces, viewport matrix |
| JITM-08 | [Interaction and UX patterns](08-interaction-and-ux-patterns.md) | Review and undo, confirmations, sheets, disclosures, forms, drafts, states |
| JITM-09 | [Information architecture and user workflows](09-information-architecture-and-user-workflows.md) | Routes, navigation labels, the canonical user workflows |
| JITM-10 | [Accessibility and quality bar](10-accessibility-and-quality-bar.md) | Targets, text size, contrast, keyboard, zoom, performance, devices |
| JITM-11 | [Engineering architecture](11-engineering-architecture.md) | Next.js rules, structure, tenancy, scheduling, data, security, cost |
| JITM-12 | [Testing and verification](12-testing-and-verification.md) | Suites, baselines, visual protocol, local CI, evidence labels |
| JITM-13 | [Git, PR and review](13-git-pr-and-review.md) | Worktrees, branches, commits, pull requests, merging |
| JITM-14 | [Release and environments](14-release-and-environments.md) | Environments, release sequence, tags, records, rollback, free plan |
| JITM-15 | [Documentation and decision records](15-documentation-and-decision-records.md) | Document types, naming, decisions, supersession, labels |
| JITM-16 | [Agent operating standard](16-agent-operating-standard.md) | How agents take in, perform and report work; tool parity |
| JITM-17 | [Governance and audit rubric](17-governance-and-audit-rubric.md) | Amendments, versioning, cadence, rubric, severities |

## Workflows

| ID | Workflow | Use for |
|---|---|---|
| WF-01 | [Task intake](workflows/WF-01-task-intake.md) | Every task |
| WF-02 | [UI change](workflows/WF-02-ui-change.md) | Pages, components, styles, layout, icons, themes |
| WF-03 | [Copy change](workflows/WF-03-copy-change.md) | Any customer-facing words |
| WF-04 | [Feature](workflows/WF-04-feature.md) | Product behavior end to end |
| WF-05 | [Review](workflows/WF-05-review.md) | Reviewing a diff, pull request, page or screenshot |
| WF-06 | [Production release](workflows/WF-06-production-release.md) | Releasing, deploying or rolling back production |
| WF-07 | [Audit](workflows/WF-07-audit.md) | Product, UX, design, copy, readiness or drift audits |
| WF-08 | [Standards amendment](workflows/WF-08-standards-amendment.md) | Recording a decision or fixing a standard |

## Skills

Shared skills live in `.agents/skills/`, which Codex reads. Claude Code reads the same files through the `.claude/skills` symlink.

| Skill | Use when | Workflow |
|---|---|---|
| [`jitm-ui-change`](../../.agents/skills/jitm-ui-change/SKILL.md) | Changing UI, pages, components, styles, layout, responsiveness, themes or icons | WF-02 |
| [`jitm-copy`](../../.agents/skills/jitm-copy/SKILL.md) | Writing or changing any customer-facing words | WF-03 |
| [`jitm-feature`](../../.agents/skills/jitm-feature/SKILL.md) | Building or changing product behavior | WF-04 |
| [`jitm-review`](../../.agents/skills/jitm-review/SKILL.md) | Reviewing work against the standards | WF-05 |
| [`jitm-release`](../../.agents/skills/jitm-release/SKILL.md) | Releasing, deploying or rolling back production (only when asked) | WF-06 |
| [`jitm-audit`](../../.agents/skills/jitm-audit/SKILL.md) | Auditing the product, code or documents | WF-07 |
| [`jitm-standards-update`](../../.agents/skills/jitm-standards-update/SKILL.md) | A decision from Kevin, or a standard that is missing, wrong or conflicting | WF-08 |

## Rules, tags and citations

- **Rule format.** Each rule is a numbered paragraph (`**2.3**`). It uses MUST, SHOULD or MAY and lives in exactly one standard.
- **Basis tags.** Every rule ends with at least one tag saying why it exists:
  - `[OWNER <date> <ref>]` — an owner decision, recorded in [OWNER_DECISIONS](../standards-audit-2026-09-28/OWNER_DECISIONS.md) or a dated record;
  - `[SHIPPED <sha> <path>]` — current behavior verified in code;
  - `[SOURCE <path>:<line>]` — an existing document;
  - `[PROPOSED]` — a recommendation, in force as the default until Kevin decides otherwise.
- **Line numbers.** Line numbers in SOURCE and OWNER tags, and in other `path:line` references, refer to the source file as it stood when the rule was written: `origin/main` 9439fd6 for every 1.0.0 rule (read them with `git show 9439fd6:<path>`). The program's own records listed below, which 9439fd6 does not contain, are cited as merged with 1.0.0. Amendments and new standards name their base commit in the changelog line. SHIPPED tags name their commit.
- **Evidence labels.** Reports label evidence VERIFIED, INFERRED, NOT RUN or BLOCKED (JITM-12 §2.1).
- **Checks.** `npm run standards:check` validates the structure, tags, citations, links, skills and router.

## Changing the standards

Follow [WF-08](workflows/WF-08-standards-amendment.md) and JITM-17 §2:
1. Edit the rule's home standard.
2. Bump the standard's version and add a changelog line.
3. Update the dependent skills and routing.
4. Run the check.
5. Open a pull request. Kevin merges.

## Records of the 2026-09-28 program

- [Standards audit](../STANDARDS_AUDIT_2026-09-28.md): findings, conflicts, gaps and questions.
- [Source register](../standards-audit-2026-09-28/SOURCE_REGISTER.md): every source, classified.
- [Drift baseline](../standards-audit-2026-09-28/DRIFT_BASELINE.md): measured deviations of the shipped code.
- [Owner decisions](../standards-audit-2026-09-28/OWNER_DECISIONS.md): D1–D12 and O1–O7.
- [Migration ledger](../standards-audit-2026-09-28/MIGRATION_LEDGER.md): where each rule of the superseded authorities went.
- [Verification](../standards-audit-2026-09-28/VERIFICATION.md): checks, discovery probes and behavior dry runs.

The program kept the planned set of eighteen standards, eight workflows and seven skills, with no merges or splits.
