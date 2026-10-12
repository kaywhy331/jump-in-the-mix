---
name: jitm-copy
description: Jump in the Mix customer-facing words — glossary terms, voice and registers, truthful sending and delivery language, the claims ledger and the persuasion floor, clean-room rules. Use when writing or changing any text customers or prospects see — UI labels, help, errors, empty states, confirmations, emails, ready-made Mix and Beat message wording, the homepage, profession pages, onboarding, FAQ, social cards or any marketing.
---

# Jump in the Mix — copy

Follow **WF-03** (`docs/standards/workflows/WF-03-copy-change.md`). The rules live in these standards:
- JITM-04: voice, tone and copy;
- JITM-05: vocabulary and glossary;
- JITM-02: ICP and positioning;
- JITM-03: brand identity.

If the text sits in a changed layout, also load `jitm-ui-change`.

## Checklist

1. **Name the register, and the reader for persuasive copy** (JITM-04 §2.3, JITM-04 §2.24).
   - The register: interface text, the owner's personal wording (drafts and messages), or marketing.
   - For persuasive copy, the reader: which audience and which ICP hypothesis (JITM-02 §2). Interface text needs only its register and the truth rules.
2. **Check every product word against the glossary** (JITM-05 §2). Use current terms only, never a retired term or an internal model name.
3. **Build a claims ledger for persuasive copy** (JITM-04 §2.26).
   - List each claim with its proof and its status.
   - Every consequential claim is removed, or proven in the ledger and approved by Kevin with a date (JITM-04 §2.28).
   - Public copy ships only with Kevin's approval (JITM-04 §2.31).
4. **Draft in the register's voice.**
   - Interface text is plain and short.
   - Personal wording sounds like the owner, not like marketing.
5. **Verify every factual statement against the product as it behaves now,** in code or in the running app, never against an old document.
6. **Clean-room check:** no third-party framework, method, course or author names (JITM-04 §2.34).
7. **Check it in place.** Take screenshots in both themes, and check narrow widths and 200% text (WF-02, step 5).

## Must-know rules

- **Sending:** the owner reviews and sends every message, or their own connected assistant sends it from their number or email with the owner's permission; Jump in the Mix never sends it itself. Opening a messaging app is not delivery, and never say it is; a send an assistant reports is not verified delivery either. Automatic customer email is off in production during the beta, and automatic SMS is not configured (JITM-00 §2.3).
- **Proof:** no invented testimonials, statistics, research, customer quotes or outcomes (JITM-00 §2.4, JITM-04 §2).
- **Pricing:** state only Kevin's plans and prices: Free $0, Plus $15 a month or $144 a year, Pro $29 a month or $288 a year (JITM-01 §2.9, `src/lib/plans.ts`). Say that paid plans haven't started until charging starts, and never promise a start date, a trial, a discount or what happens to beta accounts. "No card required" stays beside the free-beta and access wording, as in "Free beta. No card required. Join the waitlist." (JITM-02 §2.16, §2.18).
- **ICPs:** the five ICP profiles are fictional composites. Use them as research inputs only, never as proof or testimony (JITM-02 §2).
- **Clean-room:** no third-party framework, course, sales-method or author names in copy, standards or skills. Describe the mechanism instead (JITM-04 §2).
- **Implementation talk:** copy never explains workers, queues, databases or other internals. An empty state names the next useful business action (JITM-04 §2).
- **Who speaks:** the lead form, the private review page and the review request speak with the business name, never "we" or "I" (JITM-04 §2.37). Copy uses business wording by default, never "people in my circle" (JITM-04 §2.38).
- **Dates and times:** 12-hour times with AM/PM and time zones named by a city ("New York time"); never an IANA zone name, an ISO date or a 24-hour time (JITM-05 §2.19).
- **Demo:** homepage and profession-page demos follow the demo contract in JITM-09 §2.
- **Ready-made messages:** a message that asserts availability, scarcity or a fact needs a visible "only if true" cue or a placeholder the owner fills in (JITM-04 §2).

## Where to look

- Glossary and definitions: JITM-05. The in-app glossary is `src/components/BrandTermsHelp.tsx`.
- Public pages: `src/components/PublicLanding.tsx`, `src/app/for/[profession]/page.tsx`, `src/app/faq/`, `src/app/pricing/`, `src/app/features/`, `src/app/follow-up-templates/`.
- Help and FAQ content: `src/lib/support-content.ts`.
- Ready-made Mixes: `src/lib/persona-mixes.ts`, `src/lib/sales-plan-library.ts`.
- ICP hypotheses: the five `assets/ICP - *.md` files. The copywriting references are local-only; see the source register.

## Stop and ask Kevin when

- New claims touch pricing, outcomes, testimonials, or legal and privacy promises.
- A consequential claim or public copy is ready to publish; both need his dated approval (JITM-04 §2.28, §2.31).
- The brand voice, a brand line or a glossary term would change.
