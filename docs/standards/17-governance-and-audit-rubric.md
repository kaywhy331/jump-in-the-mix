---
id: JITM-17
title: Governance and audit rubric
status: active
version: 3.1.0
owner: Kevin
last_reviewed: 2026-11-09
applies_to: [standards, skills, workflows, reviews, audits]
supersedes: []
sources:
  - docs/design/UX_AUDIT_2026-11-08.md
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

No CI job or pre-push hook runs `standards:check`, so the standards stay advisory. [OWNER 2026-09-28 D8] Hosted CI does gate merges on the product's checks (JITM-12 §2.12). [OWNER 2026-10-14 D122]

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
| Layout and responsive structure | JITM-07 §5: full size matrix, measured panes/measure/chrome |
| Interaction and UX patterns | JITM-08; JITM-12 §2.26: complete states pass and recovery |
| IA and user workflows | JITM-09 |
| Accessibility and quality bar | JITM-10; JITM-12 §2.26: touch, titles, skip link and route focus |
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

**2.17** A UI/design audit MUST cover the complete JITM-07 §5 size matrix and JITM-12 §2.26 states, touch and orientation passes for its declared page scope. A review applies the same passes to the changed scope. Score missing evidence under §2.12; never award 3 from a happy-path desktop screenshot or CSS inference alone. Report original observation versus fresh verification separately, and tie each unresolved finding to its owning fix task in the drift baseline. [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:105] [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:106] [PROPOSED] [SOURCE docs/design/UX_AUDIT_2026-11-08.md:89]

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

- Review/audit scores reflect §2.17: size, states and touch evidence gaps produce findings rather than a compliant score based on a happy path.

- `npm run standards:check` passes.
- Each changed standard shows a new version, today's `last_reviewed` date and a changelog line.
- Audit and review reports contain the sections in §2.15. Every finding cites a rule and carries an evidence label.

## 6. Open decisions and known deviations

### Design audit 2026-11-08

The first two audit passes missed size/state/touch evidence. UXR-01 job_471c4c2d6330 and UXD-01–UXD-04 retain the follow-up validation; this standards amendment does not resolve their findings by changing the rubric. Proposed automation remains advisory and unbuilt under D8.

Open or partially resolved finding IDs and owners (details and landed evidence: [DRIFT_BASELINE](../standards-audit-2026-09-28/DRIFT_BASELINE.md#design-audit-2026-11-08)):

- V-01, V-02, V-04 — UXC-01 (job_1d216b599b31).
- V-03, V-09 — UXC-02 (job_1412bc339852).
- V-05 — UXC-03 (job_04680345bf95).
- V-06 — UXC-04 (job_7d38cfe7c13b).
- V-07 — UXB-01 (job_fe7761baec35).
- V-08 — UXA-06 (job_e5a211855a70).
- E-18 — UXA-16 (job_30ad2b5af772).
- E-17, A-20 — UXB-03 (job_a2a12aba8e5a).
- P-02 — UXA-03 (job_44db7c9b8cd7).

- The standards' enforcement is advisory (D8): no CI job runs `standards:check`. Kevin decided that hosted CI gates merges (D122); `main` has no branch protection yet (JITM-13 §6).
- The cadence in §2.9 is a proposal until Kevin confirms it or changes it.

## 7. Changelog

- 1.0.0 — 2026-09-28 — Initial version.
- 2.0.0 — 2026-09-28 — Base 61d4df4. §2.1: merging follows JITM-16 §2.5 (D30).
- 3.0.0 — 2026-10-14 — Base 6630e49. §2.11 changes meaning: hosted CI gates merges (D122), while `standards:check` stays advisory (D8). §6 follows.

- 3.1.0 — 2026-11-09 — Base ef7a02c7b86d29d9c3ed5cab4928758166e24740. Add §2.17 and rubric prompts for size/state/touch coverage and explicit missing evidence; advisory enforcement stays unchanged.
