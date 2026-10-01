---
id: JITM-01
title: Product concept, goals and non-goals
status: active
version: 2.2.2
owner: Kevin
last_reviewed: 2026-10-01
applies_to: [product, features, onboarding, access, marketing, agents]
supersedes: [docs/CANONICAL_PRODUCT_DECISIONS.md]
sources:
  - docs/standards-audit-2026-09-28/OWNER_DECISIONS.md
  - docs/PRODUCT_AUDIT_2026-09-04.md
  - docs/CANONICAL_PRODUCT_DECISIONS.md
  - README.md
  - docs/ADMIN_REPORTS.md
  - docs/BETA_BLOCKERS_RELEASE_2026-09-26.md
  - docs/BETA_READINESS_AUDIT_2026-09-26.md
  - docs/PRODUCTION_LAUNCH_PLAN.md
  - docs/ONBOARDING_INVITATIONS_2026-09-17.md
  - docs/UI_UX_WORKFLOW_AND_ICON_IMPLEMENTATION_2026-09-22.md
  - docs/CONTRACTOR_UX_IMPLEMENTATION_2026-09-22.md
  - docs/MEGA_MIXES_2026-09-22.md
  - docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md
  - docs/design/QUICK_ADD_AND_ACTIVATION_2026-09-20.md
  - docs/VOICE_PRD_REVIEW.md
  - docs/VOICE_WORKFLOWS.md
  - assets/Jump_in_the_Mix_Brand_Search_Conversion_Strategy.md
related_skills: [jitm-feature, jitm-copy, jitm-review, jitm-audit]
related_workflows: [WF-01, WF-04, WF-05, WF-07]
---

# JITM-01 — Product concept, goals and non-goals

> What Jump in the Mix is and is not, the loop it supports, what it aims for, and how to test whether new behavior fits.

## 1. Purpose and scope

This standard defines the product concept: what the product does and does not do, its editions, the core loop, the first-run promise, the activation definition, goals, non-goals, deferred work, the feature map, and the concept-fit test that every change to product behavior passes (WF-01, WF-04).

It does not restate:
- the mission, the product promise and the non-negotiable principles (JITM-00 §2);
- who the audiences are and what may be claimed publicly (JITM-02 §2);
- the user workflows, routes and access flows (JITM-09 §2);
- customer terms (JITM-05 §2) and copy (JITM-04 §2).

## 2. Rules

### What the product is

**2.1** The concept serves the mission in JITM-00 §2: a follow-up product for small owner-operators with no marketing experience, with a self-employed plumber and a solo real-estate agent as the reference users. It MUST work without extra services the owner has to set up. It prepares the owner's outreach; fully autonomous sending is an opt-in for later. [OWNER 2026-09-04 O1] [SOURCE docs/PRODUCT_AUDIT_2026-09-04.md:5]

**2.2** The product organizes the owner's contacts into reusable follow-up plans called Mixes. Each Beat in a Mix is a scheduled text, email or call with a prepared draft that the owner makes their own, reviews and sends from their own phone or email app. [SHIPPED 9439fd6 src/lib/public-seo.ts:9] [SOURCE README.md:3]

**2.3** The product MUST NOT read, watch or interpret replies. The owner records what happened and decides the next step. New features MUST NOT imply reply detection, delivery tracking or read receipts. [SHIPPED 9439fd6 src/app/faq/page.tsx:26] [SOURCE assets/Jump_in_the_Mix_Brand_Search_Conversion_Strategy.md:33-36]

**2.4** Automatic sending is built but off for the beta: automatic customer email is not enabled in production, and automatic SMS is not configured (JITM-00 §2.3; configuration: JITM-14 §2.4). Features MUST work with review and handoff alone and MUST NOT depend on automatic sending. [SOURCE docs/BETA_BLOCKERS_RELEASE_2026-09-26.md:6] [SHIPPED 9439fd6 src/lib/automatic-delivery.ts:20-24] [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:75] [SOURCE docs/BETA_READINESS_AUDIT_2026-09-26.md:370]

**2.5** Each account owns one business workspace. There are no seats, team invitations, role-management screens or workspace switcher for customers. A personal invitation creates a separate free account for the invited person; it is not a team seat. [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:93] [SHIPPED 9439fd6 src/app/faq/page.tsx:30]

### Editions and access

**2.6** The hosted, multi-tenant free beta is the primary product, and it MUST never require Docker knowledge. The Docker edition is a secondary, privacy-oriented option: single owner, loopback-only by default, possibly without transactional email, with an operator command for password recovery. New features target the hosted product first. [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:34,81,83] [SOURCE README.md:5]

**2.7** The product is an installable web app. Native iOS and Android apps are deferred until measured demand justifies them. [SHIPPED 9439fd6 src/app/manifest.ts:10] [SOURCE docs/VOICE_PRD_REVIEW.md:24] [SOURCE docs/PRODUCTION_LAUNCH_PLAN.md:68]

**2.8** Access is closed during the beta: a hosted account comes only from the waitlist or a member's personal invitation, never from open sign-up, and lead forms and QR or device intake create contacts in the owner's account, never accounts or invitations. The flows, the invitation allowance and the admission limits are JITM-09 §2.15–§2.19 and JITM-09 §2.69. [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:12,81,131,135-137] [SOURCE docs/ADMISSION_CONTROLS.md:9] [OWNER 2026-09-17 docs/ONBOARDING_INVITATIONS_2026-09-17.md:3,11] [OWNER 2026-09-18 docs/ui-ux-audit-2026-09-18/CLAIM_REVIEW.md:10] [SHIPPED 9439fd6 src/lib/system-mix.ts:1]

**2.9** Kevin set the plans: Free at $0; Plus at $15 a month or $144 a year; Pro at $29 a month or $288 a year. Until charging starts on a date he chooses, nothing is charged and the beta sets no commercial limits on contacts, tags, saved dates, Mixes, imports or follow-ups. From that date the plans limit only people with follow-ups on (100, 1,000 and 5,000) and active Mixes (3, 25 and 100). A person counts once, a Mega-Mix counts as one Mix, and reaching a limit stops new additions, never access to what the account has. Public wording about price follows JITM-02 §2.18. [OWNER 2026-09-29 docs/PRICING_DECISION_2026-09-29.md:11] [OWNER 2026-09-29 docs/PRICING_DECISION_2026-09-29.md:12] [OWNER 2026-09-29 docs/PRICING_DECISION_2026-09-29.md:13] [OWNER 2026-09-29 docs/PRICING_DECISION_2026-09-29.md:14] [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:85,95] [SOURCE local-only 00e0a87b7f6e77fc assets/Jump_in_the_Mix_Brand_price_freatures.md:371,533]

### Core loop, first run and activation

**2.10** The core loop, in current terms:
1. add a person or log what happened (Quick Add or Contacts);
2. decide when to follow up: start a Mix, or schedule one follow-up;
3. review the prepared follow-up on Today;
4. open the text or email app, copy the draft, or call;
5. record what happened and the next promise.

[SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:61-69] [SOURCE docs/BETA_BLOCKERS_RELEASE_2026-09-26.md:24]

**2.11** Daily work runs from Today: the person and the action, then record what actually happened, then see the next step or date. Daily work MUST NOT require understanding the Journey graph or maintaining stages. [SOURCE docs/CONTRACTOR_UX_IMPLEMENTATION_2026-09-22.md:5] [SOURCE local-only f7ea577d837b6b1f docs/CONTRACTOR_UX_APPROACH_2026-09-22.md:7]

**2.12** First-run promise: an invited owner can create an account, identify the business, add one person and see a useful prepared follow-up in minutes from a phone. A change that lengthens this path MUST say so in its plan. [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:34] [SOURCE docs/BETA_READINESS_AUDIT_2026-09-26.md:18,169-171]

**2.13** The first-run route and its default are JITM-09 §2.20–§2.21; setup never starts anyone on a Mix (JITM-09 §2.11). [OWNER 2026-09-22 docs/UI_UX_WORKFLOW_AND_ICON_IMPLEMENTATION_2026-09-22.md:8] [SHIPPED 9439fd6 src/components/OnboardingForm.tsx:39-40] [SOURCE docs/MEGA_MIXES_2026-09-22.md:19]

**2.14** An account is activated when setup is complete and the owner has recorded at least one completed outcome since the account was created. Automatic completion never activates an account. Goals, reports and audits MUST use this definition. [SOURCE docs/ADMIN_REPORTS.md:13] [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:154]

**2.15** Retention counts meaningful owner actions (copy, compose, call, voicemail, outcome, manual done, skip or reopen) in fully elapsed D7 and D30 windows. Page opens, automation and support staff do not count. [SOURCE docs/ADMIN_REPORTS.md:14-15] [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:154]

### Goals

**2.16** The product exists to help an owner:
- keep estimates and new leads from going quiet;
- check in after a job or a closing;
- earn reviews and referrals without sounding pushy;
- remember renewals, anniversaries and promised callbacks;
- open the app and immediately know who to contact next.

New work SHOULD name the goal it serves. [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:26-32]

**2.17** Goals are aims, not results. No customer outcome has been measured yet, and Mega-Mix and ready-made cadences are editable starting points, not proven sequences. Plans and reports MUST keep planned, verified and measured apart (JITM-15 §2). [SOURCE docs/MEGA_MIXES_2026-09-22.md:15] [SOURCE docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:113]

### Non-goals and deferred work

**2.18** These are not part of the product, and new work MUST NOT add them without Kevin's decision:
- reading or interpreting replies (§2.3), or team seats (§2.5);
- bulk or cold outreach;
- replacing a full CRM, an applicant-tracking system or a brokerage system;
- quoting, estimating, contracts, invoicing, dispatch, galleries or booking;
- continuous address-book sync (contact import and selection only).

[SOURCE assets/Jump_in_the_Mix_Brand_Search_Conversion_Strategy.md:32-38] [SHIPPED 9439fd6 src/lib/persona-mixes.ts:42,80,125,163,202] [SOURCE docs/ONBOARDING_INVITATIONS_2026-09-17.md:9]

**2.19** Google Contacts sync, the AI plan wizard and signup-reward referrals are retired. They MUST NOT compile into the app or gate core behavior. [SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:87] [SOURCE README.md:20]

**2.20** Deferred work MUST be labeled planned or deferred, never available:
- charging: Stripe's hosted checkout and billing portal are built and stay off until Kevin chooses a start date (§2.9, `docs/BILLING.md`) [OWNER 2026-09-29 docs/PRICING_DECISION_2026-09-29.md:12];
- native apps;
- a paid realtime voice assistant, inbox analysis and messaging bridges;
- multiple paid tiers, discounts and advanced analytics;
- automatic matching of inbound replies to work.

[SOURCE docs/CANONICAL_PRODUCT_DECISIONS.md:18,85,131] [SOURCE docs/PRODUCTION_LAUNCH_PLAN.md:128] [SOURCE docs/VOICE_WORKFLOWS.md:39] [SOURCE docs/JOURNEY_IMPLEMENTATION_2026-09-21.md:61]

**2.21** Voice is optional input, never automatic authority. Dictation and Quick Add produce an editable review; they never create a contact, start a Mix, send a message or spend an invitation by themselves. [SOURCE docs/VOICE_PRD_REVIEW.md:28] [SOURCE docs/design/QUICK_ADD_AND_ACTIVATION_2026-09-20.md:7,9]

### Feature map

**2.22** Every feature carries one status: Shipped (live at 9439fd6), Built but off, Planned (Kevin intends it; details undecided), Proposed (a document suggests it; nothing decided), Deferred or Retired. A release that adds, removes or changes the status of a feature MUST update this map. [SHIPPED 9439fd6 src/components/Nav.tsx:9-22] [PROPOSED]

| Feature | Status | Basis |
|---|---|---|
| Today: due and overdue follow-ups, outcomes, snooze, skip, undo, Needs your input, quiet-day check-ins | Shipped | `src/app/(app)/jumps/page.tsx:459-464` |
| Contacts: search, notes, history, tags, saved dates, archive, duplicates, CSV/VCF import, device contact picker | Shipped | `README.md:10,12`; `docs/QUICK_ADD.md:12` |
| Mixes: editor, start rules, text/email/call versions of every Beat, appointment timing | Shipped | `docs/CHANNEL_VERSIONS_FOR_EVERY_BEAT_2026-09-23.md:7` |
| Mega-Mixes: five ready-made, named sets, file export and import | Shipped | `docs/MEGA_MIXES_2026-09-22.md:7-13`; `docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:41-49` |
| Marketplace: Jump in the Mix, Community and My shares; favorites, reports, staff review | Shipped | `docs/MARKETPLACE_AND_NUMBERING_2026-09-24.md:53-80` |
| Journey: map of Mixes and Beats, A1/A1.a numbering, Setup/Progress/Results | Shipped | D4; `src/lib/journey-numbering.ts:10-16` |
| Calendar: meetings, time blocks, iCalendar import, subscribe and export | Shipped | `docs/CUSTOMER_JOURNEY_AND_CONNECTIONS.md:21-30` |
| Quick Add, typed or spoken; spoken Today summary | Shipped (devices NOT RUN) | `docs/design/QUICK_ADD_AND_ACTIVATION_2026-09-20.md:7`; `docs/VOICE_WORKFLOWS.md:31`; `docs/CANONICAL_PRODUCT_DECISIONS.md:131` |
| Lead connections: hosted lead form, authenticated intake | Shipped | `README.md:15` |
| Opt-in notifications: morning email, due push, weekly report | Shipped | `docs/CANONICAL_PRODUCT_DECISIONS.md:77` |
| Waitlist and personal invitations | Shipped | §2.8; JITM-09 §2.17 |
| Data controls: export, sessions, account deletion | Shipped | `docs/CANONICAL_PRODUCT_DECISIONS.md:111` |
| Help and support conversations; staff console | Shipped | `docs/SUPPORT.md:3`; `docs/CANONICAL_PRODUCT_DECISIONS.md:16` |
| Contact stages: optional labels such as Lead or Client, and the Mix each stage can start | Shipped | D16; `src/app/(app)/settings/page.tsx:11` |
| Automatic customer email; automatic SMS | Built but off | §2.4 |
| Payments: Stripe hosted checkout, billing portal and Plan and billing (`/account/billing`) | Built but off (`BILLING_ENABLED`) | `docs/BILLING.md`; `docs/STRIPE_BILLING_IMPLEMENTATION_2026-09-29.md` |
| Native apps; paid voice assistant, inbox analysis, messaging bridges | Deferred | §2.7, §2.20 |
| Plans and prices: Free, Plus and Pro, shown on `/pricing` and in the FAQ; plan limits for people with follow-ups on and active Mixes | Prices shipped; limits built but off (`BILLING_ENABLED`) | §2.9; `docs/PRICING_DECISION_2026-09-29.md`; JITM-09 §2.75 |
| Automatic email sent as "{Business} via Jump in the Mix" | Proposed | `docs/BETA_READINESS_AUDIT_2026-09-26.md:48` |
| Industry Mix catalog, per-enrollment context, contact spreadsheet | Proposed (local-only `fb11e3b1f8847bb3`) | not decided |
| Google Contacts sync, AI plan wizard, signup-reward referrals | Retired | §2.19 |

### Concept-fit test

**2.23** A plan that adds or changes product behavior MUST answer, in writing:
1. Which goal (§2.16) and which core-loop step (§2.10) does it serve?
2. Does it work for a trades owner and a solo real-estate agent on a phone (JITM-02 §2)?
3. Does the owner stay in control, with nothing sent, started or enrolled without an explicit action (JITM-00 §2)?
4. Does it avoid the non-goals and deferred work (§2.18–§2.20) and add no paid service?
5. Does it fit the existing structure (§2.24)?
6. Can every claim it makes to customers be shown to be true (JITM-04 §2)?

If any answer is no or unclear, stop and ask Kevin (JITM-16 §2). [OWNER 2026-09-28 O6] [OWNER 2026-09-25 O4] [PROPOSED]

**2.24** Changes SHOULD preserve the current UI structure: navigation, page hierarchy, workspace, pane and sheet layouts, components and responsive patterns. This is a standing default. Visible structure changes only when a specific workflow, accessibility or responsive-layout problem requires it, or when Kevin asks; the task names that problem or request. [OWNER 2026-09-28 D20] [OWNER 2026-09-22 O7] [SOURCE docs/CONTRACTOR_UX_IMPLEMENTATION_2026-09-22.md:7] [SOURCE local-only f7ea577d837b6b1f docs/CONTRACTOR_UX_APPROACH_2026-09-22.md:5]

## 3. Canonical implementations

- `src/lib/public-seo.ts` (`PRODUCT_DEFINITION`): the plain product definition, shown on the homepage and in structured data.
- `src/components/Nav.tsx`: the shipped product areas.
- `src/components/OnboardingForm.tsx` and `src/components/MegaMixSetup.tsx`: the first-run choices.
- `src/lib/one-time-follow-up.ts`: one follow-up at a chosen time, shared by Quick Add and "Schedule the next follow-up".
- `src/lib/automatic-delivery.ts`: the automatic-email switch.
- `src/lib/system-mix.ts` (`REFERRAL_INVITE_LIMIT`): the invitation allowance.
- `src/lib/plans.ts` (`PLANS`): the plans, prices and limits (§2.9).
- `src/lib/billing-sync.ts` and `src/app/api/webhooks/stripe/route.ts`: an account's plan follows Stripe's own record (JITM-11 §2.54).
- `src/lib/persona-mixes.ts`: the per-profession boundary lines that say what the product is not.
- `docs/ADMIN_REPORTS.md`: the exact activation and retention populations.

## 4. Do / Don't

- **Do** open a feature plan with its concept fit: "Serves step 3 of the core loop: the owner reviews a quiet-day check-in on Today without leaving the list."
- **Do** label a proposal "Proposed, not decided", as the industry catalog is.
- **Don't** add an "Invite your team" control or a workspace switcher.
- **Don't** add a "they replied" badge or an inbox view; the product does not read replies.
- **Don't** describe automatic sending as a beta feature, in a plan or in copy.
- **Don't** add a paid speech or AI service to make a feature work.

## 5. Verification

- Plans under WF-04 contain written answers to §2.23.
- After a release, compare the feature map with `src/components/Nav.tsx`, the routes and the release record; update statuses in the same pull request.
- Automatic sending stays off: `src/lib/automatic-delivery.ts` returns false unless `AUTOMATIC_CUSTOMER_EMAIL=true`, and production does not set it (JITM-14 §2).
- Activation figures in audits and reports use the definition in `docs/ADMIN_REPORTS.md:13`.

## 6. Open decisions and known deviations

Open questions for Kevin:
- Before charging starts (§2.9): the start date; what happens to beta accounts; sales tax; refunds, cancellation timing and the grace period after a failed payment; deleting an account with a paid plan (`docs/PRICING_DECISION_2026-09-29.md` "Still open before charging starts").
- No numeric time-to-first-value target exists (`docs/PRODUCT_QUALITY_GATES.md:18`).
- Status of the proposed industry Mix catalog and contact spreadsheet (local-only `fb11e3b1f8847bb3`, line 3).

Known deviations at 9439fd6:
- `README.md:5` still names the superseded contract, and `README.md:17` lists optional email/SMS delivery without saying it is off for the beta. The copy batch (PR #96) removed "Plans" from `README.md:11`.
- `docs/CANONICAL_PRODUCT_DECISIONS.md:12,135,149` still says five member invitations sent by email.

## 7. Changelog

- 1.0.0 — 2026-09-28 — Initial version.
- 2.0.0 — 2026-09-28 — Base 61d4df4. §2.24 is a standing default and also allows changes for accessibility or responsive-layout problems, or at Kevin's request (D20). §6 updated for D16 and D26.
- 2.0.1 — 2026-09-29 — Base 722d64b. §6: onboarding on `main` now recommends one person and one follow-up, matching the registration and invitation promise (B-17). Production follows at the release that includes it.
- 2.0.2 — 2026-09-29 — Base 9f967bc. §2.22: the feature map names Contact stages, whose role D16 settled. §6: `README.md` no longer lists "Plans" (PR #96, O8). Its superseded-contract and delivery lines remain.
- 2.1.0 — 2026-09-29 — Base dc81d10. §2.9 records Kevin's plans, prices and limits, with charging off until he chooses a start date; §2.20, §2.22, §4 and §6 follow (docs/PRICING_DECISION_2026-09-29.md).
- 2.2.0 — 2026-09-29 — Base db54cc7. Payments are built but off (§2.20, §2.22); §3 names the billing sync; §6 notes that JITM-09 §2.65 must name Plan and billing (docs/STRIPE_BILLING_IMPLEMENTATION_2026-09-29.md).
- 2.2.1 — 2026-09-30 — Base 94b9539. §6: JITM-09 §2.65 now names Plan and billing, so that deviation is gone.
- 2.2.2 — 2026-10-01 — Base f1ac84d. §2.22: the plan limits are built and stay off with billing (docs/PLAN_LIMITS_IMPLEMENTATION_2026-10-01.md).
