---
id: JITM-00
title: Constitution
status: active
version: 2.0.0
owner: Kevin
last_reviewed: 2026-10-06
applies_to: [all]
supersedes: [docs/CANONICAL_PRODUCT_DECISIONS.md]
sources:
  - docs/CANONICAL_PRODUCT_DECISIONS.md
  - docs/PRODUCT_AUDIT_2026-09-04.md
  - docs/BETA_BLOCKERS_RELEASE_2026-09-26.md
  - docs/BETA_READINESS_AUDIT_2026-09-26.md
  - docs/FULL_AUDIT_2026-09-24.md
  - docs/standards-audit-2026-09-28/OWNER_DECISIONS.md
related_skills: [jitm-standards-update, jitm-review]
related_workflows: [WF-01, WF-08]
---

# JITM-00 — Constitution

> This document states what Jump in the Mix is, the principles no change may break, and which source wins when sources disagree.

## 1. Purpose and scope

This constitution is the root of the standards in `docs/standards/`. They apply to all product, design, copy, code, documentation and operations work, whether a person or an agent does it. JITM-01 through JITM-17 hold the detailed rules. This file holds only the mission, the principles those rules serve, and precedence. If another document conflicts with this one, this one wins, unless Kevin decides otherwise through WF-08.

## 2. Rules

### Mission and promise

**2.1** Jump in the Mix is a phone-first follow-up CRM (an internal description; the public category is JITM-02 §2.10) for small owner-operators who have no marketing experience, such as a self-employed tradesperson or a solo real-estate agent (JITM-01 §2, JITM-02 §2). [OWNER 2026-09-04 O1] [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:24]

**2.2** The product promise: the owner opens the app and immediately knows who to contact next. Every change MUST protect that promise, and a change that breaks it is a BLOCKER (JITM-17 §2.14). [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:32] [SOURCE docs/BETA_READINESS_AUDIT_2026-09-26.md:56]

### Principles no change may break

**2.3** Human review by default. The owner reviews and sends each message in their own voice. A message the owner's own connected assistant sends from the owner's own number or email account, after the owner says yes to that message, counts as the owner sending it; Jump in the Mix itself never sends it and records it as the assistant reported it, not as delivered. Opening a text, email or call app is not delivery, and the product never claims that it is. Automatic sending is an explicit option that is off by default. Automatic customer email is off in production during the beta, and automatic SMS is not configured. [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:73,75] [SOURCE docs/BETA_BLOCKERS_RELEASE_2026-09-26.md:6] [SOURCE docs/BETA_READINESS_AUDIT_2026-09-26.md:370] [SHIPPED 9439fd6 src/components/JumpWorkflow.tsx:478] [OWNER 2026-10-06 D38]

**2.4** Honesty. No one invents product behavior, capabilities, metrics, testimonials, customer evidence, research findings, pricing or decisions, in the product, in marketing or in reports. Unknowns are stated as unknown (JITM-04 §2, JITM-12 §2). [OWNER 2026-09-28 O6] [OWNER 2026-09-28 D11] [SOURCE docs/PRODUCT_COMPLETION.md:24]

**2.5** Tenant isolation. A workspace's data is reachable only through that workspace's authenticated session, or an access grant its owner gave their own assistant for that workspace, in every route, action, job, import, export, support view and assistant request (JITM-11 §2). [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:91] [OWNER 2026-10-06 D38]

**2.6** Settled work stays settled. Completed or skipped follow-ups never come back. A promised next follow-up creates exactly one follow-up at the chosen time. Scheduling stays timezone-safe and idempotent (JITM-09 §2, JITM-11 §2). [SOURCE docs/BETA_BLOCKERS_RELEASE_2026-09-26.md:7-8] [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:127]

**2.7** Deliberate strengths MUST NOT be weakened to simplify the product. They are:
- timezone-safe scheduling;
- idempotent outcomes;
- durable worker leases;
- recovery after returning from a messaging app;
- undo;
- append-only history;
- duplicate-safe imports;
- encrypted backups;
- the central request boundary.

[SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:127]

**2.8** Accessibility is a floor, not a feature. Every screen works on a phone, with a keyboard, in light and dark themes and at enlarged text sizes (JITM-10 §2). [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:115-118]

**2.9** Cost discipline. The product runs on free or minimal services until Kevin decides otherwise. No one adds a paid service without his approval (JITM-11 §2, JITM-14 §2). [OWNER 2026-09-25 O4] [PROPOSED]

**2.10** At pilot scale, correctness, data safety, the sign-up path and trust come before scale. [SOURCE docs/FULL_AUDIT_2026-09-24.md:8]

**2.11** Kevin decides product behavior, pricing, access, customer promises, vocabulary and brand. Agents propose; they do not decide (JITM-16 §2.7). [OWNER 2026-09-28 O6] [PROPOSED]

### Precedence

**2.12** When sources disagree, precedence runs:
1. Kevin's explicit current instruction, recorded through WF-08 in the same task;
2. this constitution;
3. the other JITM standards, where a newer version or amendment wins;
4. the design export in `docs/design/jump-in-the-mix-designs/`, for visual composition where the standards are silent, except Journey (JITM-06 §2);
5. dated records, audits and proposals, which are history and evidence only.

[OWNER 2026-09-28 D3] [OWNER 2026-09-28 O6] [PROPOSED]

**2.13** Shipped code is evidence of current behavior, not authority. When code contradicts a standard, the conflict is recorded as drift and fixed through a task, or the standard is amended through WF-08. It is never silently accepted either way. [PROPOSED]

**2.14** A newer verified product fact outranks an older proposal's assumption about features or pricing. [SOURCE assets/README.md:32]

**2.15** Every rule has exactly one home standard. Other documents link to that home rather than restate it (JITM-17 §2.2). [PROPOSED]

**2.16** Documents that claimed authority before these standards are superseded as authorities and kept as history. Among them are `docs/CANONICAL_PRODUCT_DECISIONS.md`, `docs/design/DESIGN_GUIDELINES.md` and the product-language and convention sections of `CONTRIBUTING.md`. [OWNER 2026-09-28 D3]

## 3. Canonical implementations

- `docs/standards/README.md`: the index of standards, workflows and skills.
- `AGENTS.md`: the router every agent loads. `CLAUDE.md` is a symlink to it, so Claude Code loads the same router.
- `docs/standards-audit-2026-09-28/OWNER_DECISIONS.md`: the owner decisions the standards cite.
- `docs/standards-audit-2026-09-28/MIGRATION_LEDGER.md`: where each rule of the superseded authorities went.

## 4. Do / Don't

- **Do:** when an old record and the current standard disagree, follow the standard and note the record as history.
- **Do:** treat a feature request that changes the promise in §2.2 as a question for Kevin.
- **Don't:** cite `CANONICAL_PRODUCT_DECISIONS.md` as the contract. Cite the JITM rule that absorbed it.
- **Don't:** say a message was sent because a messaging app opened.

## 5. Verification

- A review scores the change against JITM-17 §2.12. Any violation of §2.3–§2.11 is a BLOCKER or HIGH finding.
- `npm run standards:check` passes.

## 6. Open decisions and known deviations

- The audit lists shipped copy and documents that still contradict these principles. See `docs/STANDARDS_AUDIT_2026-09-28.md`.
- Preserving the current UI structure is a standing default (JITM-01 §2.24, D20).

## 7. Changelog

- 1.0.0 — 2026-09-28 — Initial version.
- 1.0.1 — 2026-09-28 — Base 61d4df4. §6: the UI-structure question is answered (D20).
- 2.0.0 — 2026-10-06 — Base 8bee3b1. §2.3 counts a message the owner's own connected assistant sends from the owner's number or email account, after the owner says yes to it, as the owner sending it; §2.5 lets an access grant an owner gives their own assistant reach that workspace (D38).
