---
id: JITM-17
title: Governance and audit rubric
status: active
version: 2.0.0
owner: Kevin
last_reviewed: 2026-09-28
applies_to: [standards, skills, workflows, reviews, audits]
supersedes: []
sources:
  - docs/standards-audit-2026-09-28/OWNER_DECISIONS.md
  - docs/BETA_READINESS_AUDIT_2026-09-26.md
  - docs/beta-audit-2026-09-26/FINDINGS_TABLE.md
  - scripts/check-standards.mjs
related_skills: [jitm-review, jitm-audit, jitm-standards-update]
related_workflows: [WF-05, WF-07, WF-08]
---

# JITM-17 — Governance and audit rubric

> How the standards change, how often they are reviewed, and how reviews and audits score work against them.

## 1. Purpose and scope

This standard governs the lifecycle of the JITM standards, the workflows in `docs/standards/workflows/` and the shared skills in `.agents/skills/`. It also defines the rubric and severity scale that reviews (WF-05) and audits (WF-07) use.

Other standards cover related ground:
- Precedence between documents: JITM-00 §2.
- How agents report evidence: JITM-12 §2 and JITM-16 §2.
- Document types and supersession banners: JITM-15 §2.

## 2. Rules

### Authority and change

**2.1** Kevin owns the standards. A change takes effect when its pull request is merged to `main`. Agents propose changes and merge them only as JITM-16 §2.5 allows. [OWNER 2026-09-28 D3] [OWNER 2026-09-28 D30]

**2.2** A rule MUST be changed only in its home standard. The same pull request MUST bump the standard's `version`, update `last_reviewed` and add a changelog line. [PROPOSED]

**2.3** Versions follow semantic versioning:
- major: a rule is removed or its meaning changes;
- minor: a rule is added;
- patch: clarifications, citations and wording.

[PROPOSED]

**2.4** Owner decisions are captured per JITM-15 §2.11; the amendment then follows §2.2–§2.6. [OWNER 2026-09-28 O6] [PROPOSED]

**2.5** A rule tagged `[PROPOSED]` is in force as the default. An owner decision can change it without a deprecation period. [PROPOSED]

**2.6** A change to a standard MUST update, in the same pull request:
- the skills, workflows, `AGENTS.md` routing and PR template that depend on it;
- the result of `npm run standards:check`.

[PROPOSED]

**2.7** Standards and workflows MUST NOT be deleted. A replaced document gets `status: superseded` and a link to its replacement (JITM-15 §2). [PROPOSED]

**2.8** A new standard takes the next free number and is added to the index in `docs/standards/README.md`. Numbers are never reused. [PROPOSED]

**2.16** Rules are never renumbered. A new rule takes the next free number, even when it sits out of numeric order. A retired rule keeps its number with the text `Retired <date>: see JITM-NN §2.N`, and the standard takes a major version bump. [PROPOSED]

### Cadence

**2.9** WF-07 MUST be re-run after every five production releases or monthly, whichever comes first. A re-run:
- refreshes the drift baseline;
- folds new dated records into the standards;
- flags standards whose `last_reviewed` date is more than 90 days old.

[PROPOSED]

**2.10** A release that changes customer-visible behavior SHOULD be reviewed with WF-05 before it ships: WF-06 checks that its merged pull requests have a WF-05 verdict (JITM-13 §2.18). [PROPOSED]

### Enforcement

**2.11** Enforcement is advisory:
- agents MUST run `npm run standards:check` before opening a pull request that touches standards, workflows, skills, `AGENTS.md` or the PR template;
- reviewers apply the rubric below.

Neither CI nor a pre-push hook blocks changes until Kevin decides otherwise. [OWNER 2026-09-28 D8]

### Audit rubric

**2.12** Reviews and audits MUST score each applicable dimension from 0 to 3. A score below 2 in any dimension MUST produce findings.
- 0 — a MUST rule is violated.
- 1 — SHOULD rules are violated, or evidence is missing.
- 2 — compliant, with minor gaps.
- 3 — compliant, with evidence.

[PROPOSED]

| Dimension | Home standard |
|---|---|
| Constitution principles | JITM-00 |
| Concept and goals | JITM-01 |
| ICP and positioning | JITM-02 |
| Brand identity | JITM-03 |
| Voice, tone and copy | JITM-04 |
| Vocabulary | JITM-05 |
| Design system | JITM-06 |
| Layout and responsive structure | JITM-07 |
| Interaction and UX patterns | JITM-08 |
| IA and user workflows | JITM-09 |
| Accessibility and quality bar | JITM-10 |
| Engineering architecture | JITM-11 |
| Testing and evidence | JITM-12 |
| Git, PR and review | JITM-13 |
| Release and environments | JITM-14 |
| Documents and records | JITM-15 |
| Agent conduct | JITM-16 |

**2.13** Every finding MUST carry:
- an ID of the form `<AREA>-<NN>` (for example VOC-01 or LAY-03);
- the rule it cites (`JITM-NN §2.N`);
- evidence (`path:line`, a command and its output, or a screenshot);
- an evidence label (JITM-12 §2);
- a severity;
- a fix direction.

[SOURCE docs/beta-audit-2026-09-26/FINDINGS_TABLE.md:20]

**2.14** Severity uses this scale. It is based on the beta audit's definitions and generalized to every change.
- **BLOCKER** — the owner cannot complete the core loop, data is lost or corrupted, a customer is misled about sending or delivery, a tenant boundary or security control fails, or the owner cannot learn that something is broken.
- **HIGH** — a MUST rule is violated in a customer-visible way, or the owner will probably get stuck or lose trust.
- **MEDIUM** — a SHOULD rule is violated, or a MUST rule is violated with no customer impact.
- **LOW** — polish and consistency.

[SOURCE docs/BETA_READINESS_AUDIT_2026-09-26.md:50-54] [SOURCE docs/beta-audit-2026-09-26/FINDINGS_TABLE.md:6-10]

**2.15** Audit reports MUST contain these sections:
- a summary or verdict;
- findings by dimension;
- documents that disagree with each other;
- documents that disagree with the code;
- gaps where no rule exists;
- NOT READ / NOT RUN;
- questions for Kevin.

[SOURCE docs/BETA_READINESS_AUDIT_2026-09-26.md:33] [OWNER 2026-09-28 O6]

## 3. Canonical implementations

- `docs/standards/README.md`: the index, precedence and citation format.
- `docs/standards/_templates/standard.md` and `docs/standards/_templates/workflow.md`: templates for new documents.
- `scripts/check-standards.mjs` (`npm run standards:check`). It checks:
  - frontmatter, numbering and section structure;
  - that every rule has a basis tag;
  - citations (`JITM-NN §x`, `WF-NN`) and relative links;
  - skill format and parity between Claude Code and Codex;
  - the router's budget and the Next.js block;
  - repository hygiene.
- The audit record `docs/STANDARDS_AUDIT_2026-09-28.md` and its evidence folder: the baseline for the next WF-07.

## 4. Do / Don't

- **Do:** when Kevin says a label should change, edit the home rule in JITM-05, bump it to 1.1.0, add the changelog line, update any skill that quotes the old label, and run `npm run standards:check`, all in one pull request.
- **Don't:** restate a rule in a second standard "for convenience". Link to its home.
- **Don't:** renumber rules (§2.16). Citations in pull requests and records depend on the numbers.

## 5. Verification

- `npm run standards:check` passes.
- Each changed standard shows a new version, today's `last_reviewed` date and a changelog line.
- Audit and review reports contain the sections in §2.15. Every finding cites a rule and carries an evidence label.

## 6. Open decisions and known deviations

- Enforcement is advisory (D8). Gating in CI waits for Kevin's decision and for GitHub Actions to become available.
- The cadence in §2.9 is a proposal until Kevin confirms it or changes it.

## 7. Changelog

- 1.0.0 — 2026-09-28 — Initial version.
- 2.0.0 — 2026-09-28 — Base 61d4df4. §2.1: merging follows JITM-16 §2.5 (D30).
