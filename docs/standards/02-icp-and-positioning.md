---
id: JITM-02
title: ICP and positioning
status: active
version: 2.1.0
owner: Kevin
last_reviewed: 2026-09-29
applies_to: [marketing, public-pages, profession-pages, onboarding, copy, product-decisions]
supersedes: [docs/CANONICAL_PRODUCT_DECISIONS.md]
sources:
  - docs/standards-audit-2026-09-28/OWNER_DECISIONS.md
  - assets/README.md
  - assets/ICP - Real Estate Agent - Maya Bennet.md
  - assets/ICP - Painter Contractor - Marcus Reed.md
  - assets/ICP - Independent Operations Consultant - Daniel Mercer.md
  - assets/ICP - Photographer - Elena Brooks.md
  - assets/ICP - Independent Recruiter - Lauren Mitchell.md
  - assets/Jump_in_the_Mix_Brand_Search_Conversion_Strategy.md
  - docs/SEARCH_STRATEGY_IMPLEMENTATION_2026-09-12.md
  - docs/HOMEPAGE_EXPERIENCE_ROADMAP_2026-09-10.md
  - docs/HOMEPAGE_COPY_AND_CLAIM_MATRIX_2026-09-10.md
  - docs/HOMEPAGE_PROFESSION_PAGES_2026-09-11.md
  - docs/HOMEPAGE_RESEARCH_PROTOCOL_2026-09-10.md
  - docs/ui-ux-audit-2026-09-18/CLAIM_REVIEW.md
  - docs/CONVERSION_COPY.md
  - docs/PRODUCT_AUDIT_2026-09-04.md
related_skills: [jitm-copy, jitm-feature, jitm-review, jitm-audit]
related_workflows: [WF-03, WF-04, WF-05, WF-07]
---

# JITM-02 — ICP and positioning

> Whom Jump in the Mix is for, how the ICP hypotheses may be used, how the product is positioned, and which claims it may and may not make.

## 1. Purpose and scope

This standard sets audience priority, the rules for using the five ICP profiles, the applied and proposed positioning, the differentiators the product may claim, and the claims that are off limits, including price (D11).

Neighboring topics live elsewhere:
- how a claim is proven, reviewed and written: JITM-04 §2;
- profession-page structure and the homepage demo: JITM-09 §2;
- what the product does and does not do: JITM-01 §2;
- the brand name, logo and social card artwork: JITM-03 §2.

## 2. Rules

### Audience priority

**2.1** The product serves five audiences: owner-operated contractors (trades), solo real-estate agents, independent consultants, photographers and independent recruiters. The earlier launch list (home services, real estate, insurance or financial services) no longer guides targeting. [OWNER 2026-09-28 D2] [SHIPPED 9439fd6 src/lib/persona-mixes.ts:34,72,117,155,194]

**2.2** When the audiences' needs conflict, product and marketing decisions MUST favor trades owners and solo real-estate agents: the owner's reference users are a self-employed plumber and a solo real-estate agent with no marketing experience. [OWNER 2026-09-28 D2] [OWNER 2026-09-04 O1]

**2.3** The five audiences illustrate uses; they do not limit who may join. Personal-connection and networking uses stay available in the product and in Help. The nine business types in onboarding classify accounts; they are not a target list. [SOURCE docs/HOMEPAGE_EXPERIENCE_ROADMAP_2026-09-10.md:18] [SHIPPED 9439fd6 src/components/ProfessionMarks.tsx:23] [SHIPPED 9439fd6 src/lib/business-taxonomy.ts:1-4]

### Using the ICP profiles

**2.4** The five ICP profiles in `assets/` are fictional composites and hypotheses. Agents MUST use them only as research inputs: situations, problems and objections. Their quotes, biographies, incomes and figures MUST NOT be presented as customer testimony, measured behavior or validated targeting criteria. [SOURCE assets/README.md:17] [SOURCE assets/ICP - Real Estate Agent - Maya Bennet.md:11] [SOURCE assets/ICP - Painter Contractor - Marcus Reed.md:21]

**2.5** Target by behavior, never demographics. Age, gender, family, vehicle and hobbies in the profiles are creative details. Strong-fit signals:
- income depends on relationships;
- already has people worth following up with;
- personally handles client communication;
- can describe recent missed or late follow-ups;
- has a fragmented current process;
- values personal messages over volume;
- will spend a few minutes following through.

[SOURCE assets/ICP - Real Estate Agent - Maya Bennet.md:50,314-320] [SOURCE docs/HOMEPAGE_EXPERIENCE_ROADMAP_2026-09-10.md:34,100]

**2.6** Lower-priority fits SHOULD NOT drive design or messaging: bulk or cold outreach, teams replacing a full operational CRM, people satisfied with their current system, casual users, and emergency-dispatch businesses. [SOURCE assets/ICP - Real Estate Agent - Maya Bennet.md:322] [SOURCE assets/ICP - Painter Contractor - Marcus Reed.md:45]

**2.7** Industry statistics and product assumptions in the profiles, including their planned AI, voice and QR features and the paid assistant tier, MUST be re-verified before any public use. A newer verified product fact beats an older proposal's feature or pricing assumption. [SOURCE assets/README.md:17,32] [SOURCE docs/HOMEPAGE_EXPERIENCE_ROADMAP_2026-09-10.md:30]

**2.8** ICP persona names MUST NOT appear in the product, demos or public copy; demo contacts use other fictional names (JITM-09 §2). Refer to a profile by its audience, for example "the real-estate ICP". Its filename spells "Bennet" and the profile "Bennett"; keep the filename so links stay stable. [SOURCE assets/README.md:11] [SHIPPED 9439fd6 src/lib/marketing-scenarios.ts:4-8] [PROPOSED]

**2.9** Content for each audience MUST respect the profiles' cautions:
- contractors: no default sequences that keep asking past customers for more work; a service issue outranks promotional follow-up;
- photographers: no assumptions about family milestones after a wedding;
- recruiters: no inferred open roles, résumé handling or implied integrations; discreet previews; "not now", "no longer interested" and "do not contact" stay distinct;
- real estate: personal friendships stay out of sales treatment.

[SOURCE docs/HOMEPAGE_EXPERIENCE_ROADMAP_2026-09-10.md:40-42] [SOURCE assets/ICP - Painter Contractor - Marcus Reed.md:269-271] [SOURCE assets/ICP - Photographer - Elena Brooks.md:278] [SOURCE assets/ICP - Independent Recruiter - Lauren Mitchell.md:307-310] [SOURCE assets/ICP - Real Estate Agent - Maya Bennet.md:143]

### Category and positioning

**2.10** The public category is "client follow-up app". It appears in the homepage title, the opening copy, the default metadata, the manifest and the structured data, and it MUST stay the public category until Kevin changes it. [SOURCE docs/SEARCH_STRATEGY_IMPLEMENTATION_2026-09-12.md:11,19] [SHIPPED 9439fd6 src/app/page.tsx:9] [SHIPPED 9439fd6 src/app/layout.tsx:28]

**2.11** The applied positioning, live since 2026-09-12:
- hook: "You meant to follow up. Then work happened.";
- statement: "A client follow-up app for independent professionals. Put the next check-in on a simple plan, with a message ready to make your own. You choose the timing. You review, edit, and send.";
- definition: `PRODUCT_DEFINITION` in `src/lib/public-seo.ts`.

The hook comes from the owner-supplied strategy (`assets/Jump_in_the_Mix_Brand_Search_Conversion_Strategy.md:11`) and is a hypothesis, not a proven winner (JITM-04 §2). [SHIPPED 9439fd6 src/components/PublicLanding.tsx:22-23] [SHIPPED 9439fd6 src/lib/public-seo.ts:9] [SOURCE docs/SEARCH_STRATEGY_IMPLEMENTATION_2026-09-12.md:11,31] [SOURCE assets/Jump_in_the_Mix_Brand_Search_Conversion_Strategy.md:11]

**2.12** Internally, positioning decisions target small owner-operators who personally handle client communication and have no marketing help, trades and solo real estate first (§2.2). Public copy SHOULD NOT call the product a CRM or "phone-first" until Kevin decides to; the metadata moved from "phone-first CRM" to the category in §2.10, and physical-device qualification has not run. [OWNER 2026-09-28 D2] [SOURCE docs/SEARCH_STRATEGY_IMPLEMENTATION_2026-09-12.md:19] [SOURCE assets/Jump_in_the_Mix_Brand_Search_Conversion_Strategy.md:37] [SOURCE docs/BETA_READINESS_AUDIT_2026-09-26.md:363]

**2.13** The message core SHOULD stay:
- one reader: an owner who personally handles client communication and already has people to follow up with;
- one problem: planned follow-ups disappear under current work;
- one idea: follow-through should have a plan, not depend on memory;
- one feeling: relief, confidence and personal care, never shame or made-up urgency.

[SOURCE assets/Jump_in_the_Mix_Brand_Search_Conversion_Strategy.md:54-61] [SOURCE docs/HOMEPAGE_COPY_AND_CLAIM_MATRIX_2026-09-10.md:28]

**2.14** The brand line is "Stay in the mix". It MUST be paired with a literal description of the product, such as "client follow-up app", because the line alone does not explain it. Its customer comprehension is untested, so research SHOULD check it. "Good relationships have a rhythm." and "A little follow-through goes a long way." MUST NOT be presented as the brand line; where they still ship is listed in §6. [OWNER 2026-09-28 D22] [SHIPPED 9439fd6 src/components/PublicFooter.tsx:7] [SHIPPED 9439fd6 src/app/page.tsx:10] [SOURCE assets/Jump_in_the_Mix_Brand_Search_Conversion_Strategy.md:3,9-10] [SOURCE docs/RELATIONSHIP_VOCABULARY.md:3]

### Differentiators and claims

**2.15** Differentiation is the mechanism: context kept with the person, a reusable plan, a draft ready to make your own, review before sending, and a small start. Copy MUST NOT claim superiority over other tools or imply that they cannot do follow-up; the opening is the owner whose current process is fragmented. [SOURCE docs/HOMEPAGE_EXPERIENCE_ROADMAP_2026-09-10.md:11] [SOURCE assets/Jump_in_the_Mix_Brand_Search_Conversion_Strategy.md:62] [SOURCE assets/ICP - Painter Contractor - Marcus Reed.md:41-43]

**2.16** These claims are verified against shipped behavior on 2026-09-28 and may be used as written:
- you review each message and send it from your own text or email app;
- automatic sending is off during the beta;
- the app doesn't read your messages or watch for replies;
- a text comes from the number you already use;
- private notes stay out of messages;
- you can export your data or delete your account;
- joining and creating an account are free, with no payment card;
- the plans: Free at $0, Plus at $15 a month or $144 a year, Pro at $29 a month or $288 a year; paid plans haven't started; you're charged only if you choose a paid plan (Kevin approves the exact wording);
- access is by a member's invitation or the waitlist, with no promised date; each member has three personal invitations;
- optional notifications stay off until you turn them on;
- you record what happened;
- the public demo uses a fictional contact and sends nothing.

Any other claim needs a claim–proof ledger entry (JITM-04 §2). [SHIPPED 9439fd6 src/app/faq/page.tsx:25-30] [SHIPPED 9439fd6 src/app/privacy/page.tsx:12] [SHIPPED 9439fd6 src/app/features/follow-up-reminders/page.tsx:26-32] [SHIPPED 9439fd6 src/components/PublicLanding.tsx:25] [SOURCE docs/ui-ux-audit-2026-09-18/CLAIM_REVIEW.md:7-14] [SHIPPED 9439fd6 src/lib/automatic-delivery.ts:20-24] [SHIPPED 9439fd6 src/lib/system-mix.ts:1] [SHIPPED 9439fd6 prisma/product-platform.prisma:34-36]

**2.17** These claims are off limits until Kevin approves the evidence:
- testimonials, reviews, ratings, "trusted by" or customer logos;
- customer or usage counts, revenue, conversion, time saved or bookings won;
- guarantees, invented deadlines or scarcity, promised invitation dates;
- "award-winning" or "high-converting";
- "reviewed by" a practitioner, until one reviews with permission;
- universal device or messaging-app compatibility;
- AI, voice or other roadmap features as available;
- automatic sending, confirmed delivery or reply detection.

[SOURCE docs/CONVERSION_COPY.md:21] [SOURCE docs/HOMEPAGE_PROFESSION_PAGES_2026-09-11.md:83-85] [SOURCE docs/SEARCH_STRATEGY_IMPLEMENTATION_2026-09-12.md:40-41] [SOURCE docs/HOMEPAGE_CONVERSION_AUDIT_2026-09-07.md:5]

**2.18** Price statements MUST match Kevin's plans (JITM-01 §2.9) and say that paid plans haven't started until charging starts. The owner-reviewed access facts stay: joining and creating an account are free, and no payment card is asked for. "No card required" always sits beside "free beta" and accurate invitation or waitlist wording, for example "Free beta. No card required. Join the waitlist." Copy MUST NOT state or imply a start date for charging, trials, discounts, a lasting price, immediate admission or what happens to beta accounts when charging starts. While paid plans can't be bought, structured data and the social card describe no offers or prices. [OWNER 2026-09-29 docs/PRICING_DECISION_2026-09-29.md:7] [OWNER 2026-09-29 docs/PRICING_DECISION_2026-09-29.md:11] [OWNER 2026-09-29 docs/PRICING_DECISION_2026-09-29.md:12] [OWNER 2026-09-28 D28] [OWNER 2026-09-18 docs/ui-ux-audit-2026-09-18/CLAIM_REVIEW.md:9]

### Research

**2.19** No customer research has run yet: there are no participant sessions and no real prospect wording. Until it runs, positioning is a hypothesis. Research recruitment SHOULD start with trades owners and solo real-estate agents, and select participants by behavioral fit using the existing protocol and session template. [OWNER 2026-09-28 D2] [SOURCE docs/HOMEPAGE_RESEARCH_PROTOCOL_2026-09-10.md:3,5] [SOURCE docs/HOMEPAGE_READINESS_RECONCILIATION_2026-09-18.md:32]

## 3. Canonical implementations

- `assets/README.md` and the five `assets/ICP - …` profiles: the research inputs.
- `src/components/PublicLanding.tsx`: the applied positioning, shared by `/` and the five `/for/*` pages.
- `src/lib/persona-mixes.ts`: each profession's headline, supporting line, demo call to action and honest boundary.
- `src/lib/marketing-scenarios.ts`: the five allowlisted profession scenarios and their fictional contacts.
- `src/lib/public-seo.ts`: the product definition and structured data, limited to visible facts.
- `docs/ui-ux-audit-2026-09-18/CLAIM_REVIEW.md`: the last owner claim review, and the format for the next one.
- `docs/HOMEPAGE_RESEARCH_PROTOCOL_2026-09-10.md` and `docs/HOMEPAGE_RESEARCH_SESSION_TEMPLATE_2026-09-10.md`: the research method.

## 4. Do / Don't

- **Do** lead with a recognizable trade situation: "The estimate went out. Don't let the follow-up disappear."
- **Do** state an honest boundary: "A follow-up planning tool, not an estimating, dispatch, or invoicing system."
- **Do** write "Free accounts, no card" only beside the invitation-or-waitlist access facts.
- **Don't** quote a profile ("I do not want people to feel they are inside a campaign") as if a customer said it.
- **Don't** write "Trusted by contractors", "Plus plan", "free forever" or "a better CRM".
- **Don't** target by age or family ("for agents under 40"); describe the situation instead.

## 5. Verification

- Every public claim in the change is on the list in §2.16 or has a ledger entry with Kevin's approval (JITM-04 §2).
- Search public code for off-limits patterns and review each hit:

```bash
grep -rniE 'trusted by|testimonial|risk-free|award|guarantee|free forever|per month|/mo\b|\$[0-9]' \
  src/app/page.tsx src/app/for src/app/faq src/app/features src/app/follow-up-templates \
  src/components/Public* src/lib/persona-mixes.ts src/lib/public-seo.ts
```

- `grep -rlE "Maya|Bennett|Marcus Reed|Daniel Mercer|Elena Brooks|Lauren Mitchell" src` prints nothing.
- Research sessions are recorded in the session template, with counts and raw uncertainty.

## 6. Open decisions and known deviations

Open questions for Kevin:
- Should the public audience phrase stay "for independent professionals", or name owner-operators, trades and solo real estate (D2)?
- Should the social card be regenerated around the current category? JITM-03 §2 owns the artwork; the wording needs your approval.
- Should public copy changed since the 2026-09-18 claim review (the homepage access note on 2026-09-25, the FAQ sending answer on 2026-09-26) get a dated claim review?

Known deviations at 9439fd6:
- The social sharing card and its alt text carry the 2026-09-07 positioning: "For the people who matter", "Good relationships have a rhythm.", "Business · Personal · Your network" (`scripts/generate-brand-assets.mjs:27-32`; `src/lib/public-seo.ts:15`).
- The homepage meta description uses "Stay in the mix" (`src/app/page.tsx:10`), and the footer ships "A little follow-through goes a long way." (`src/components/PublicFooter.tsx:7`). Pairing the brand line with a literal description and aligning the footer and social card are backlog B-14 (§2.14).
- The research protocol recruits real estate and consultants first (`docs/HOMEPAGE_RESEARCH_PROTOCOL_2026-09-10.md:5`), and the strategy proposal names contractors and consultants as first acquisition paths (`assets/Jump_in_the_Mix_Brand_Search_Conversion_Strategy.md:15`). D2 puts trades and solo real estate first.
- `docs/SEARCH_STRATEGY_IMPLEMENTATION_2026-09-12.md:36` still says automatic sending needs a connected provider; production keeps it off for the beta.
- No industry statistic from the profiles has been re-verified (`assets/README.md:17`).

## 7. Changelog

- 1.0.0 — 2026-09-28 — Initial version.
- 2.0.0 — 2026-09-28 — Base 61d4df4. "Stay in the mix" is the brand line, paired with a literal description (§2.14, D22). "No card required" confirmed beside free-beta and access wording (§2.18, D28).
- 2.0.1 — 2026-09-29 — Base 9f967bc. §6: asks whether §2.18 allows the approved FAQ sentence about prices after the beta (O8).
- 2.1.0 — 2026-09-29 — Base dc81d10. §2.16 adds the plans; §2.18 lets copy state Kevin's prices and says what it still must not promise. §6: the O8 question about the FAQ price sentence is answered (docs/PRICING_DECISION_2026-09-29.md).
