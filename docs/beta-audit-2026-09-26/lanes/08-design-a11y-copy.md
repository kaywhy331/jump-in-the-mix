# Lane 8 — Design, accessibility and copy

> Raw lane report from the read-only lane reviewer, kept as written. The reconciled severities, merged IDs and runtime labels are in [../FINDINGS_TABLE.md](../FINDINGS_TABLE.md), which takes precedence where the two differ.

**Lane verdict: GO WITH CONDITIONS.** Nothing in this lane stops a plumber from signing up or finishing the core loop. The colour tokens match the design export exactly in both themes. Every text and control colour pair passes WCAG AA. The single-key shortcut (prior DES-F1) is fixed, no interaction needs dragging, and no public page shows prices, testimonials, ratings, user counts or the proposed Plus/Pro catalogue.

Two conditions before inviting:
1. **(UX-01)** Public copy says "you review and send messages yourself" and that automatic sending "needs a connected provider". In production any user can turn on automatic email, and it goes out under the platform's own sender. Customer replies go to the operator's reply-to mailbox. Fix the copy, or keep automatic email off for the beta.
2. **(UX-02)** Four public pages describe demo steps and a weekly email that no longer exist. This is a cheap copy fix.

The rest can be fixed during the beta: inline links that look like plain text, the Mix/Beat vocabulary conflict with the canonical decisions, and the prior design P2s.

Scope: static review of `/tmp/jitm-beta-audit-20260926` (commit `4b5abd8`). Nothing was built, rendered or run against production.

Marketing references:
- **Read in full:** the untracked `/home/trix/home/trix/project/jump-in-the-mix/assets/Jump_in_the_Mix_Brand_price_freatures.md`.
- **Not opened:** the two Joanna Wiebe files and the ICP files. No claim here depends on them.

## Summary table

| ID | Severity | Label | Title |
|---|---|---|---|
| UX-01 | HIGH | VERIFIED (code, copy) · INFERRED (who sees what) | Public sending claims ("you review and send yourself", "needs a connected provider", "replies stay in your messaging app") contradict production's opt-in automatic email. It is sent from the platform's own From and Reply-To. |
| UX-02 | MEDIUM | VERIFIED | Template and feature pages describe demo behaviour and a weekly email that do not exist (a planned Beat with a date picker; a four-step estimate Mix; a three-step proposal Mix; "each page plays that profession's own Mixes"; a "week ahead" summary) |
| UX-03 | MEDIUM | VERIFIED (cascade) · INFERRED (visual) | Inline links in body copy render as plain text, with no colour change and no underline, on the homepage, sign-up, help and settings screens. axe cannot detect this (`allowSameColor`). |
| UX-04 | MEDIUM | VERIFIED | Vocabulary: about 310 customer strings say Mix, 84 say Beat, 74 say Mega-Mix and 68 say Journey. CANONICAL_PRODUCT_DECISIONS mandates "Plan" and claims precedence. The glossary is missing where a plumber first meets the words (Today, onboarding, contact profile). |
| UX-05 | LOW | VERIFIED | Internal state words shown to users ("This follow-up is no longer pending: reconciled", "workflow held", "The worker rechecks…", "Mix occurrence", "timing anchor") |
| UX-06 | LOW | VERIFIED | Prior design P2s still open: DES-F4, F7, F8, F15, F16, F20, plus the rest of DES-F6 (11 px "Recommended" tag on the Today review) |
| UX-07 | LOW | INFERRED | Focus Not Obscured (2.4.11) risks: a sticky 64 px header at 768–900 px with no `scroll-padding-top`; the import action bar sits above the phone scroll padding |
| UX-08 | LOW | NOT RUN | `/security` names `security@jumpinthemix.com` as the private reporting address, but Release B lists that alias as a pending owner step |
| UX-09 | LOW | VERIFIED | Lighthouse CI covers 6 of the 15 indexed public pages, and no funnel or signed-in pages |

## Flows traced

- **Homepage and profession claims.** `src/app/page.tsx:7-14` and `src/app/for/[profession]/page.tsx:16-20` → `src/components/PublicLanding.tsx:15-51`. The demo is `ProductDemo.tsx:13-99`, fed by `src/lib/demo-workspace.ts:4-8` (text day 0, email day 1, call day 7). Its state is kept in memory only, with no `sms:`/`mailto:`/`tel:` in the rendered demo; `src/lib/product-demo.ts:89-103` `demoActionUrl` is imported only by `tests/product-demo.test.ts`. Structured data is `src/lib/public-seo.ts:35-44` (no offers, prices or ratings).
- **Automatic sending.**
  - The settings page (`src/app/(app)/settings/sending/page.tsx:21-39`) marks email "Available" when `automaticEmailConfigured()`.
  - That is `src/lib/automatic-delivery.ts:20-22`, which returns `transactionalEmailConfigured()` (Resend is set in `render.yaml`).
  - The save action `src/lib/notification-actions.ts:40-67` checks only consent, the review window and configuration.
  - The worker sends through `automatic-delivery.ts:81-87` `sendTransactionalEmail({ to, subject, text, html })` with no `from` or `replyTo`.
  - `src/lib/transactional-email.ts:36-37` then fills in `from: message.from ?? env.emailFrom` and `reply_to` from `env.emailReplyTo`.
  - `docs/HOSTED_DEPLOYMENT.md:34` documents `EMAIL_REPLY_TO` as the operator's "Monitored reply mailbox".
- **Reminder claims.** `src/app/features/follow-up-reminders/page.tsx:14-57`.
  - Notification defaults: `prisma/product-platform.prisma:34-37` (all `false`) and `src/lib/account-provisioning.ts:47`.
  - Weekly report: `src/lib/notification-delivery.ts:283-298` ("Here's last week at …").
  - "Next up": `src/app/(app)/jumps/page.tsx:365`.
- **Access and pricing.**
  - `src/lib/system-mix.ts:1` `REFERRAL_INVITE_LIMIT = 3` agrees with FAQ `faq/page.tsx:30`, terms `terms/page.tsx:10`, register `register/page.tsx:41` and `(app)/mixes/system/page.tsx:40`.
  - `git grep -niE "stripe|checkout|billing|credit card"` over `src`: no payment code (only dead `.public-billing-toggle` CSS, `base.css:105-108`).
  - Admission ceilings default to 0: `prisma/admission.prisma:4-5`.
- **Link styling cascade.** `base.css:63` `a { color: inherit; text-decoration: none; }`, then `.auth-card > p { color: var(--muted) }` (`base.css:155`) and `.relationship-steps p { … color: var(--muted) }` (`homepage.css:94`). Underlines are added only for `.public-document a` (`public-documents.css:7`), `.public-definition-links a`, `.public-related-links a` (`homepage.css:127`), `.public-questions .section-heading a` (`homepage.css:108`) and `.hero-audiences a` (`homepage.css:23`).
- **Shortcut (DES-F1).** `src/lib/quick-add-shortcut.ts:30-35` ignores modifiers, repeats, composition, fields and open dialogs. The switch is at `src/components/Appearance.tsx:71-72`, and the listener is only added when enabled (`QuickAdd.tsx:97-103`).
- **Dragging (2.5.7).** `src/components/WorkflowConnections.tsx:97`: "A normal click is also the touch/keyboard alternative" (click a port, then click the target). Beat and record reordering use buttons (`RepeatableProfileRecords.tsx:9`). There are no other drag handlers (`git grep draggable|onDrag|pointermove|touchmove|swipe`).

## Findings

### UX-01 — Public sending claims contradict production's opt-in automatic email, sent from the platform's own address
- Severity: HIGH · Label: VERIFIED (code and copy) / INFERRED (what the customer sees) · Prior: none (related TOD-F1/F2, handled in the Today lane)
- **What the user experiences.** The homepage, structured data, app description and manifest say you send every message yourself.
  - `src/lib/public-seo.ts:9`: "You review and send messages yourself, and the app does not read or interpret replies." This renders on the homepage and all five profession pages (`PublicLanding.tsx:43`) and in JSON-LD.
  - `layout.tsx:28` and `manifest.ts:7`: "reminders you review and send yourself".
  - `persona-mixes.ts:74` (consultants hero): "Nothing goes out until you've reviewed it."
  - FAQ (`faq/page.tsx:25`): "Automatic sending is optional and needs a connected provider."
  - `features/follow-up-reminders/page.tsx:37`: "Nothing goes out on its own unless you connect an optional sending provider and turn that on."
  - `PublicCapabilities.tsx:3`: "Replies and attachments stay in your messaging app."
  - Privacy (`privacy/page.tsx:12`): "Automatic sending requires a configured provider and your opt-in."

  In production, however, any beta user can turn on automatic email in Settings → Sending without connecting anything:
  - Email shows "Available" (`settings/sending/page.tsx:35`).
  - The only gates are a consent tick and a review window (`notification-actions.ts:52-63`).
  - After the review window, unedited follow-ups go out without the owner opening them ("Prepared messages send after your review window", `sending/page.tsx:28`).
  - They are sent through the platform's Resend account with the platform's `EMAIL_FROM`, and replies go to the platform's `EMAIL_REPLY_TO` (`transactional-email.ts:36-37`), which `HOSTED_DEPLOYMENT.md:34` defines as the operator's monitored mailbox.

  So a plumber's customer would see a follow-up from "Jump in the Mix <…>", and their reply would land in the operator's inbox, not the plumber's. Neither the settings page nor its consent text names the sender or where replies go (`sending/page.tsx:30-39`, `AutomaticSendPreview.tsx:13`).
- **Reproduction.** 1. Sign in as a test user, then open `/settings/sending`. 2. Tick "Send prepared messages automatically", "Email" and the consent box, then save. 3. Give a test contact with your own inbox a due email follow-up. 4. Wait out the 15-minute window. 5. Inspect the received email's From and Reply-To. 6. Compare with `/faq` ("needs a connected provider") and the homepage ("You review and send messages yourself").
- **Evidence.**
  - `src/lib/automatic-delivery.ts:20-22` — "export function automaticEmailConfigured(): boolean { return transactionalEmailConfigured(); }"
  - `src/lib/automatic-delivery.ts:81-86` — "sendTransactionalEmail({ to: recipient, subject: prepared.subject || `A note from ${company}`, text: prepared.body, … })" (no `from` or `replyTo`)
  - `src/lib/transactional-email.ts:36-37` — "const replyTo = message.replyTo === undefined ? env.emailReplyTo : message.replyTo; … from: message.from ?? env.emailFrom"
  - `render.yaml` has `RESEND_API_KEY`, `EMAIL_FROM` and `EMAIL_REPLY_TO` (lines 54-61) and no Twilio keys, so only email automation is live (texts show "Not available yet").
- **Root cause.** Automatic email was built on the account-email transport. The copy was written for the "bring your own provider" model.
- **Fix direction.** Either keep automatic email off for the beta (hide the switch until a per-user sender exists), or state plainly on the settings page and in the FAQ, privacy page and product definition that messages are sent from Jump in the Mix's address and where replies go. Add "by default" to the "you send it yourself" lines.
- **Runtime check for the lead.** On a candidate or test build, do steps 1–5, then record the From and Reply-To headers. Confirm the production values of `EMAIL_FROM` and `EMAIL_REPLY_TO` in the Render dashboard. Escalate to BLOCKER if Reply-To is the operator's support inbox and the owner wants automatic email available to beta users.

### UX-02 — Template and feature pages describe demo behaviour and a weekly email that do not exist
- Severity: MEDIUM · Label: VERIFIED · Prior: none
- **What the user experiences.** A visitor who follows these pages' instructions finds something different:
  - **Reminders page.** `features/follow-up-reminders/page.tsx:44` says "In the demo, open a planned Beat and choose its date. In the product, that date is when the Beat lands on your Today list." The demo has no planned Beat and no date control: `ProductDemo.tsx:57-97` has only a Situation select, a subject input, a message textarea and buttons. Planned Beats were removed on 09-18 in `a0bf38b`, and this page was last changed earlier (`594a1bb`).
  - **Estimate templates.** `estimate-follow-up/page.tsx:31-37` says "The sample estimate Mix in the demo runs like this: Estimate on its way … Help them choose … Walk it through … around day five … Dates filling up … around day ten." The CTA `/for/contractors#sample` (`:47`) plays the fixed three-Beat demo: text today, email tomorrow, call in one week (`demo-workspace.ts:4-8`).
  - **Proposal templates.** `proposal-follow-up/page.tsx:33` says "a same-day email …, the check-in itself on the date you agreed, and an optional note about ten days later". The demo is the same three Beats.
  - **Template hub.** `follow-up-templates/page.tsx:41` says "Each page plays a demo with that profession's own Mixes". Only the situation names are per-profession. The per-profession Beats in `persona-mixes.ts:44-229` are rendered nowhere; they are used only by `mix-portable.test.ts:130`.
  - **Weekly email.** `features/follow-up-reminders/page.tsx:30` says "A weekly summary email. A look at the week ahead, each Monday." The actual email is a look back ("Here's last week at …: follow-ups completed, conversations connected, customers quiet 60+ days, review-link visits, top referrer", `notification-delivery.ts:285-292`). The in-app label is accurate: "Monday owner report — Completed follow-ups, quiet customers, and referrals".
- **Reproduction.** 1. Open `/features/follow-up-reminders` and follow "Try a follow-up reminder" to `/#sample`: there is no planned Beat or date to choose. 2. Open `/follow-up-templates/estimate-follow-up`, then "Try this estimate follow-up plan": it shows three Beats (text, email, call), not the four described.
- **Evidence.** The quotes above. `git log -S planned -- src/components/ProductDemo.tsx` → `a0bf38b 2026-09-18 Simplify mobile follow-ups and guided product examples`.
- **Root cause.** The demo was simplified without updating the pages that describe it. `e2e/public-pages.spec.ts:8-10` checks headings and titles only.
- **Fix direction.** Rewrite the four passages to describe the three-Beat demo, or remove them. Change "week ahead" to "a look back at last week".
- **Runtime check for the lead.** Walk both reproductions at 375 px.

### UX-03 — Inline links look like plain text (no colour, no underline)
- Severity: MEDIUM · Label: VERIFIED (CSS cascade) / INFERRED (rendered look) · Prior: none (not in DES-F*)
- **What the user experiences.** Links inside sentences have the same colour, weight and decoration as the words around them, and `-webkit-tap-highlight-color: transparent` (`design-system.css:8`) removes the iOS tap flash. A plumber cannot tell that these are tappable:
  - `/waitlist`: "Already a member? **Sign in**" and "Leave the waitlist or stop invitation emails" (`waitlist/page.tsx:24-25`).
  - `/register`: "Sign in" and "Get help with an invitation or account" (`register/page.tsx:59,61`).
  - `/forgot-password`, `/reset-password`, `/verify-email/pending`: "Contact support" (`forgot-password/page.tsx:38`, `reset-password/page.tsx:36`, `verify-email/pending/page.tsx:57`).
  - Homepage step 2 "reminders" (`PublicLanding.tsx:35`).
  - In the app:
    - Settings → Sending: "Talk to support" and "Notifications" (`settings/sending/page.tsx:43`).
    - Help: "public contact support" (`help/page.tsx:83`).
    - Account: "Need to change this email?" (`account/page.tsx:61`).
    - Today notices: "Return to setup" and "Review its current context" (`jumps/page.tsx:411,458`).
    - Contact notice: "Set up reminders for me (optional)" (`ContactProfile.tsx:174`).
    - The template hub's profession list (`follow-up-templates/page.tsx:42`).
  - A heuristic scan found 91 unclassed inline links; the policy pages and the "related" lists are correctly underlined.
- **Reproduction.** 1. Open `/waitlist` at 375 px in light and dark. 2. Look for the "Sign in" link in "Already a member? Sign in." It is the same grey as the sentence. 3. Repeat on `/settings/sending` for "Talk to support".
- **Evidence.**
  - `src/styles/base.css:63` — "a { color: inherit; text-decoration: none; }"
  - `base.css:155` — ".auth-card > p { color: var(--muted); margin-top: 0; }"
  - There is no `.auth-card a`, `.notice a`, `.muted-copy a` or `p a` rule. Search: `grep -rnE "\.notice[^{,]*\ba\b|muted-copy a|auth-card[^{]*\ba\b" src/styles` returns only `.registration-card > p a` (`auth.css:12`), which does not apply to these `auth-card` pages.
  - axe 4.13's `link-in-text-block` passes same-colour links: `node_modules/axe-core/axe.min.js` "…link-in-text-block … options:{requiredContrastRatio:3,allowSameColor:!0". This explains why the A2 axe runs passed.
- **Root cause.** A global link reset with no body-copy rule to replace it.
- **Fix direction.** Add one shared rule: `:where(p, li, dd, small, .notice) a:not([class]) { color: var(--violet-text); text-decoration: underline; text-underline-offset: 3px; }`. That gives 5.55:1 light and 7.96:1 dark on page.
- **Runtime check for the lead.** Screenshot `/waitlist` and `/settings/sending` at 375 px in light and dark, and zoom on the sentences above.

### UX-04 — Vocabulary conflicts with the canonical product language, with no glossary where a plumber first meets it
- Severity: MEDIUM · Label: VERIFIED · Prior: related to the 09-22 vocabulary item (`docs/UI_UX_WORKFLOW_AND_ICON_AUDIT_2026-09-22.md:203`)
- **The conflict.**
  - `docs/CANONICAL_PRODUCT_DECISIONS.md:8` says "When code, copy, tests, or another document disagrees with this file, this file wins".
  - Its "Product language" table (`:36-48`) maps a timed sequence to **Plan** and a reusable starting point to **Ready-made plan**.
  - `:50` — "“Jump in the Mix” is the brand, not a noun for work. Internal database names such as `Jump`, `Mix` … must not leak into customer copy."
  - `:58` names the third navigation destination **Plans**.

  Against it:
  - The UI uses Mixes: `Nav.tsx:11` "Mixes", `:12` "Journey".
  - The design export uses the same words: `screens/Main.html` and `Review.html` show "Mixes", "Beat 1 of 2" and "Skip beat".
  - `docs/RELATIONSHIP_VOCABULARY.md:7` adopts Mix, Beat, Tempo, Cue and Loop.
  - The owner decided on 09-22 that "Mix, Beat, Mega-mix, Journey and Today stay as the brand names" (`UI_UX_WORKFLOW_AND_ICON_IMPLEMENTATION_2026-09-22.md:9`).
  - The canonical file was never updated. It is also stale on invitations: "each member also has five lifetime invitations" (`:12`), where the code uses 3 (`system-mix.ts:1`).
- **Counts.** Heuristic extraction of rendered strings from `src/app/(app)/**` and `src/components/*.tsx`, excluding admin and public components. The script is in the reviewer's scratchpad (`lane8/jargon.js`, `jargon-ctx.js`).

  | Term | Occurrences | Files |
  |---|---|---|
  | Mix/Mixes | 326 (310 strings) | 60 |
  | Beat(s) | 84 | 25 |
  | Mega-Mix | 74 | 15 |
  | Journey | 68 | 29 |
  | path | 52 | 10 |
  | Marketplace | 21 | 6 |
  | Saved date (canonical) | 17 | — |
  | Plan (canonical) | 17 | 11 |
  | track | 3 | — |
  | branch | 3 | — |
  | touchpoint | 3 | — |
  | Loop | 2 | — |

  By context:
  - Navigation: "Mixes" and "Journey" (desktop rail), "Customer journey" (More), and the tabs "My mixes / Mega-Mixes / Marketplace" (`mixes/page.tsx:57`).
  - Headings: 33, including "Create your first Mix", "New Mega-Mix", "Journey map" and "Path".
  - Buttons: at least 46, including "Skip beat" (Today, `jumps/page.tsx:328,385`), "Stop mix…" (`:385`), "Start a touchpoint" (`ContactProfile.tsx:142`), "Add a mega-mix" and "Create Mega-Mix".
  - Empty states: "Create your first mix", "Name your first Mega-Mix — A Mega-Mix groups connected Mixes into one named pipeline…" (`mixes/mega/page.tsx:109`) and "No Mixes yet".
  - Other terms: "pipeline", "cue", "tempo", "Remix", "Loop · repeat this date" (`ContactProfile.tsx:248`) and "Work label" (`WorkflowJourney.tsx:248`).
- **What the user experiences.** A plumber's first screens:
  - Onboarding recommends "A complete mega-mix · Recommended — Your whole pipeline on day one" (`OnboardingForm.tsx:39`).
  - Today's options sheet says "Move it to a better day, skip it, or stop this mix" with buttons "Skip beat" and "Stop mix…" (`jumps/page.tsx:380-385`).
  - The glossary sheet "What these words mean" (`BrandTermsHelp.tsx:6-12`) is only on Mixes, Mega-Mixes, Marketplace and Journey (`mixes/page.tsx:50`, `mixes/mega/page.tsx:61`, `marketplace/page.tsx:74`, `WorkflowJourney.tsx:198`). It is not on Today, the contact profile or onboarding. Help's FAQ explains Mix, Beat, Tempo, cue and loop (`src/lib/support-content.ts:44,46`), but only if the user searches for it.
- **Reproduction.** Complete onboarding at `/onboarding`, then open a follow-up's ⋯ on `/jumps` at 375 px. Note the terms and the absence of an ⓘ.
- **Root cause.** The owner's 09-22 decision was never reflected in the canonical file. The explanation was placed on the library pages, not the core loop.
- **Fix direction.** An owner decision: update CANONICAL_PRODUCT_DECISIONS to the chosen vocabulary. Then either add the ⓘ glossary to Today's options sheet and onboarding, or use plain words ("Skip this step", "Stop this plan") on Today.
- **Runtime check for the lead.** Screenshot onboarding and Today's options sheet.

### UX-05 — Internal state words shown to users
- Severity: LOW · Label: VERIFIED · Prior: related to TOD-F15
- **What the user experiences.** Opening an old follow-up link (from a digest, a push or history) shows "This follow-up is no longer pending: reconciled." (or "workflow held", "mix stopped for contact", "outcome:skipped"). The notice renders `exactRecord.completionMethod.replaceAll("_", " ")` (`jumps/page.tsx:458`), and the stored values include `"reconciled"`, `"workflow_held"` and `"outcome:skipped"` (`git grep 'completionMethod: "'`). The canonical file forbids exposing "reconciliation". Other examples:
  - `AutomaticSendPreview.tsx:13` — "The worker rechecks recipient eligibility…" (the canonical file says copy never explains workers).
  - The Today review's aria-label "Pending beats in this Mix occurrence" (`jumps/page.tsx:372`).
  - "Waiting for its timing anchor" (`WorkflowProgress.tsx:23`).
- **Reproduction.** Complete a follow-up, then open `/jumps?jump=<its id>`.
- **Fix direction.** Map completion methods to plain sentences, with a generic fallback.
- **Runtime check for the lead.** As in the reproduction.

### UX-06 — Prior design P2s still open
- Severity: LOW · Label: VERIFIED · Prior: DES-F4, F6 (remainder), F7, F8, F15, F16, F20
- **Evidence.**
  - **DES-F4.** The docked review is still uncapped: no `.review-composer` max-width anywhere in `src/styles`.
  - **DES-F6 remainder.** `.channel-recommended { … font-size: .6875rem }` (`phone-icons.css:83`) is 11 px meaningful text on the Today review, below the 12 px button floor of the floor test (`e2e/visual-fitment.spec.ts:68`).
  - **DES-F7.** `JumpWorkflow.module.css:15` still uses "color-mix(in srgb, Canvas 94%, currentColor 6%)"; `.quick-add-original` still uses `--surface` with no tail (`design-system.css:112`).
  - **DES-F8.** `MixLibraryNav.tsx:15` renders "active · 3 Beats · 2 people" and no `.mix-library-rhythm`.
  - **DES-F15.** The tablet header is still sticky (`auth.css:68`).
  - **DES-F16.** The landing scale is unchanged (`homepage.css:28,93`).
  - **DES-F20.** There is no `@media print`.
  - **Also minor.** Page titles are weight 600 (`design-system.css:6`) against the export's 700. The phone h1 is 28 px (`design-workspaces.css:152`) against 30 px. The nav Quick Add bubble renders 56×52 because `min-height: 52px` (`base.css:286`) beats `height: 48px` (`design-workspaces.css:141`); the export is 58×48.
- **Fix direction.** Needs owner decisions: F4, F7, F15 and F16 were listed as open questions on 09-24. F6, F8 and F20 are small.

### UX-07 — Focus Not Obscured (2.4.11): two places where a sticky bar can cover the focused control
- Severity: LOW · Label: INFERRED · Prior: none
- **Evidence.**
  - Phones and small tablets get `html { scroll-padding-bottom: calc(6rem + env(safe-area-inset-bottom)) }` at ≤900 px (`design-details.css:286`), which is correct for the fixed bottom nav.
  - At 768–900 px, however, `.mobile-app-header { position: sticky; top: 0; … min-height: 64px }` (`auth.css:68`) has no matching `scroll-padding-top` (no `scroll-padding-top` anywhere in `src/styles`). Shift-Tab upward can put a 44 px control fully under the header.
  - `.import-stage-actions { position: sticky; bottom: 86px }` (`contact-import.css:17`) spans roughly 86–150 px above the bottom, while the scroll padding is 96 px.
- **Runtime check for the lead.** At 834×1194 on `/contacts/<id>/edit`, Shift-Tab back up the form and check each focused field is visible below the header. At 375 px on `/contacts/import` with a mapped file, Tab through the rows above the action bar.

### UX-08 — The security reporting address may bounce
- Severity: LOW · Label: NOT RUN · Prior: related to the Release B owner step
- **Evidence.**
  - `src/app/security/page.tsx:8` — `const SECURITY_EMAIL = "security@jumpinthemix.com"`, presented as "tell us privately at …" (`:12`).
  - `docs/AUDIT_RELEASE_B_2026-09-25.md:111` — "Add it as an alias in ImprovMX … Until then, mail to `security@` may bounce".
  - The page falls back to support only "If you have not heard from us within five business days" (`:13`). `security.txt` lists both addresses.
- **Fix direction.** Create the alias, or name `support@` first on the page until it exists.
- **Runtime check for the lead.** Ask Kevin whether the alias exists; no probe is needed.

### UX-09 — Lighthouse budgets cover only 6 public URLs
- Severity: LOW · Label: VERIFIED · Prior: related to PRO-F8
- **Evidence.**
  - `.lighthouserc.cjs:10-17` lists `/` and the five `/for/*` pages, with 3 runs and `throttlingMethod: "devtools"`.
  - `:29-36` sets the budgets: performance ≥0.90, accessibility ≥0.95, best-practices ≥0.90, LCP ≤2500 ms (median), CLS ≤0.1.
  - It runs against the local standalone build (`startServerCommand: node .next/standalone/server.js`), via CI `ci.yml:335`.
- **Not covered.**
  - The other 9 indexed pages in `public-trust.ts:33`: `/faq`, `/features/follow-up-reminders`, `/follow-up-templates` and its two sub-pages, `/privacy`, `/terms`, `/security`, `/contact`.
  - The funnel: `/waitlist`, `/register`, `/login`, `/auth/magic`, `/verify-email/pending`, `/forgot-password`, `/onboarding`.
  - Every signed-in page.
- **Fix direction.** Add the nine indexed pages plus `/waitlist` and `/login` to `url` (they are cheap and static).

## Screenshot comparison checklist (for the lead)

The phone exports are 390×844, so compare them at 375 and 414 and use 320 for reflow only. The desktop exports are 1920×1080, so compare them at 1440 for layout, not pixels. Dark variants are `Dark<Name>.html`.

| Export screen | App URL (viewport) | Compare |
|---|---|---|
| `Main.html` / `DarkMain.html` | `/jumps` with 1+ overdue and 2+ due today (375/414; 320 reflow) | 1. Header: "Today" (export 30 px/700; app 28 px/600) and subtitle; export has an icon-only Filter, app has Search plus a labelled "Filter". 2. Group headings in sentence case: "Overdue" in `--late`, "Today" in `--text-3`, 13 px/600, counts right-aligned. 3. Row: 40 px avatar with 14 px initials, 16 px/600 name, right-aligned time or "N days late", 14 px Mix line, one-line Newsreader 15 px snippet. The export's "Beat N of M" dots are absent in the app. 4. The right-hand "Review" action (52 px) plus ⋯ inside a 36 px grid track (`design-workspaces.css:376`): check for no overflow or clipping at 320. 5. Bottom nav: 5 equal columns, Today active in violet, Quick Add violet bubble with a tail (export 58×48 r18; app 56×52 r16), labels 13 px (export 11 px). |
| `Review.html` / `DarkReview.html` | `/jumps?jump=<id>` (375, 414) | 1. Bottom sheet with grabber, scrim, 24 px top radius; title focused on open (A2). 2. 44 px avatar, 18 px/700 name, stage line; Mix name, due label, and the date track with the current Beat highlighted. 3. `--violet-wash` compose bubble with a transparent 18 px Newsreader textarea. 4. Text/Email/Call segmented control at 44 px, "Goes to …" at 13 px, primary handoff (export 54 px r16), Copy. 5. Mark sent / Snooze / Skip beat visible together with a short draft at 375×667 without scrolling. |
| `TodaySent.html` | After "Mark sent" on `/jumps` (375) | 1. The confirmation sits above the bottom nav and doesn't cover the last row. 2. Export has a dark `--toast` bubble with a light-violet Undo and tail; app has a light card (DES-F7). 3. Undo reachable at 44 px. |
| `QuickAdd.html` | Tap the nav Quick Add on `/jumps` (375) | 1. "Quick add" title. 2. Capture bubble: export `--violet-wash` 22/22/6/22 with tail; app `--surface`, no tail. 3. "Saving as" rows (New contact / Note / Follow-up). 4. Primary "Save all N" size and radius. |
| `Contacts.html` | `/contacts` with 8+ people (375/414) | 1. h1, header icons (person-plus, ⋯) and 44 px `--surface` search. 2. "N people" and the "Last name" sort. 3. Rows: avatar (app 36 px vs export 40 px), 16 px/600 names, "Stage · next date" at 13 px, violet "Add phone or email", late in `--late`. 4. Separators and 65 px row height. |
| `Contact.html` | `/contacts/<id>` (375) | 1. "Contacts" back and Edit. 2. 56 px avatar, 24 px/700 name, stage chip. 3. Four 48 px circular quick actions with labels, and the disabled reason. 4. "Next" card: Mix, Beat position, late label, Review pill, date track (edge fade). 5. Details rows and History with Newsreader notes. |
| `Mixes.html` | `/mixes` (375/414) | 1. h1 "Mixes" with ⓘ, +, ⋯ (the export has a bottom "New mix"). 2. Tabs: export "My mixes / Ready-made"; app "My mixes / Mega-Mixes / Marketplace" in a `--surface` pill, 44 px. 3. Rows: name, then "N people" and status; the export's rhythm-dot track and "N beats over N days" are missing (DES-F8). 4. Selected row in `--violet-wash`. |
| `More.html` | `/more` (375) | 1. 56 px rows, 20 px icons, 16 px/500 labels, chevrons. 2. Order: Journey ("Customer journey"), Calendar, Lead connections, Settings, Personal preferences, Notifications, My account, Help. 3. Appearance picker (with the N-shortcut switch) and Sign out reachable above the nav. |
| `DesktopToday.html` | `/jumps` (1440×900) | 1. 248 px rail with Quick Add (export tail corner 14/14/14/4; app r12). 2. Queue 300–440 px beside the review pane. 3. Composer width (export max 680 px; app fluid, DES-F4). 4. Snooze/Skip beside the name and Mark sent beside the send controls (≥1200). |
| `DesktopContacts.html` / `DesktopMixes.html` | `/contacts`, `/mixes` (1440) | Directory 360 px beside the profile or editor; no third column below 1700; tokens and surfaces. |
| `LandingPhone.html` / `Landing.html` | `/` (375; 1440) | 1. Hero h1 with the "Then work happened." line (app `--text-3` 5.24:1; export #8988A0 3.45:1). 2. CTAs: export 54–56 px r16; app 44–48 px r12 (DES-F16). 3. Section heading scale (export 36/52 px). 4. Waitlist band dark in light mode and `--surface` in dark mode. 5. The inline "reminders" link in step 2 (UX-03). |

## What holds up

- **Tokens match the export exactly (VERIFIED).** The diff script compared `docs/design/jump-in-the-mix-designs/tokens.css` with `src/styles/design-tokens.css`. Light: 25 export tokens, no differences except the font stacks, which prepend the self-hosted `var(--font-instrument)` and `var(--font-newsreader)`. System dark: 18 tokens, no differences. Forced dark: 18 tokens, no differences. Radii are 12/24/20 in both. The export has no type-scale or spacing tokens; its sizes are inline, so they are compared in the checklist.
- **Fonts.** Instrument Sans 400–700 and Newsreader 400 are self-hosted (`layout.tsx:15-21`). The UI font is on `body` and controls (`design-system.css:3-4`). Newsreader is used for drafts, snippets, notes, support bodies and Quick Add (`design-system.css:5,65,112,126`; `ContactTimeline.module.css:8`; `mix-library.css:66`). Only Newsreader 400 is loaded, so any bold or italic would be synthesized; none was found in customer views.
- **Contrast.** Computed with `node /tmp/claude-1000/…/scratchpad/lane8/contrast.js` (WCAG relative luminance, token values). All pairs pass AA in both themes:

  | Pair | Light | Dark |
  |---|---|---|
  | text / page | 17.25 | 16.15 |
  | text-2 / page | 7.33 | 9.56 |
  | text-3 / page | 5.24 | 6.45 |
  | placeholder (`--text-3` on the `--surface` inputs, `design-system.css:9-10`) | 4.81 | 5.88 |
  | text-3 / violet-wash | 4.54 | 4.84 |
  | links (`--violet-text`) / page | 5.55 | 7.96 |
  | link / violet-wash | 4.82 | 5.98 |
  | primary button (white on `--violet`) | 5.55 | 5.55 |
  | soft button (`--violet-ink` / wash) | 7.10 | 8.54 |
  | late / page | 5.20 | 8.19 |
  | late / violet-wash | 4.51 | 6.15 |
  | success ink / bg | 5.04 | 8.59 |
  | warning ink / bg | 6.43 | 8.23 |
  | band text / band | 14.85 | 14.72 |
  | band late | 7.53 | 7.46 |
  | field border / page | 3.34 | 4.40 |
  | field border / raised | 3.34 | 3.58 |
  | focus ring (`--violet-mark`) / page | 5.55 | 4.94 |
  | focus ring / raised | 5.55 | 4.02 |
  | focus ring / wash | 4.82 | 3.71 |

  - `--border` (1.56 / 2.74) and `--quiet` (1.72 / 2.60) fail 3:1 but are decorative.
  - Disabled buttons (opacity .55) measure 2.39 light / 3.37 dark for primary and 3.88 / 4.97 for default. They are exempt, listed for information.
  - `--selected` and `--accent` are unused (`grep var(--selected)|var(--accent)` returns nothing).
- **Focus-visible.** The global ring is `:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px }` (`base.css:67`), with forced-colors and prefers-contrast variants (`base.css:74-83`). Every `outline: none` has a replacement:
  - `.profession-grid li:has(> a:focus-visible)` (`homepage.css:131-132`)
  - `.demo-notes-bubble:focus-within` (`product.css:483-484`)
  - `.mix-directory-search:focus-within` (`mix-library.css:17-19`)
  - `.contact-search-row:focus-within` (`contacts-workspace.css:17,20`)
  - `.contact-open:focus-visible::after` (`contacts-workspace.css:36-37`)
  - `.speech-bubble--compose textarea:focus-visible` (`design-system.css:64` beats `conversation.css:64`)
  - the input reset `base.css:165` is overridden by the higher-specificity `:focus-visible`
  - headings used as programmatic focus targets only (`WorkflowJourney.module.css:62,184`)

  Caveat: the `prefers-contrast: more` override of `--line` and `--muted` (`base.css:75`) is dead, because `design-tokens.css` redefines both later on `:root`. Only the 4 px ring applies.
- **Reduced motion.** Handled globally in `base.css:69-72,329-332`; the demo's `scrollIntoView` checks the media query (`ProductDemo.tsx:44`).
- **Labels and names.** A heuristic scan of all non-admin TSX found no unlabelled input, select or textarea; the only hits used `aria-label` (`ContactForm.tsx:220-235`, `RepeatableProfileRecords.tsx:11`). The phone "Join" keeps the full name "Join the waitlist" (label-in-name OK, `PublicHeader.tsx:28`).
- **Targets.** A2's fixes are present in code:
  - calendar week nav at 44 px (`design-workspaces.css` A2 diff)
  - duration chips at 44 px (`design-details.css:141`)
  - Journey tabs `min-height:44px` (`WorkflowJourney.module.css`)
  - Marketplace chips and tabs at 44 px (`mega-mixes.css`)
  - contact filter `min-height: 44px` (`contacts-workspace.css:21`)
  - profile track links at 44 px
  - the ≤900 px restore block (`phone-icons.css:58-75`) and `.button.small { min-height: 48px }` at ≤900 (`components.css:238`)

  Desktop compact controls (32–36 px) meet 2.5.8's 24 px minimum.
- **Accessible authentication (3.3.8).** No CAPTCHA or cognitive test (`git grep captcha|turnstile` returns nothing). Paste is never blocked (no `onPaste`). Autocomplete is set (`login/page.tsx:92-93`, `register/page.tsx:57`). A magic link and optional Google/Apple sign-in are the alternatives. The show/hide control is at `PasswordInput.tsx:6`.
- **Consistent help (3.2.6).** Help is always in `AccountNav` (`Nav.tsx:17-21`), the last More row (`more/page.tsx:19`) and the public footer trust links (`PublicFooter.tsx`, `PublicTrustLinks.tsx`).
- **Redundant entry (3.3.7).** The invited email is prefilled read-only (`register/page.tsx:54`) and the SMS signature is prefilled with the name (`OnboardingForm.tsx:55`). The "Confirm email" field on text invitations (`register/page.tsx:56`) is a deliberate typo guard, noted as advisory.
- **The single-key shortcut (DES-F1) is fixed.**
- **Honest public claims (VERIFIED).**
  - "Free accounts, no card" (`PublicLanding.tsx:25,47`; `faq/page.tsx:29`; `terms/page.tsx:10`): there is no payment code.
  - Three member invitations, consistent across code, FAQ, terms and register.
  - "Nothing is sent and no messaging app opens" in the demo (`ProductDemo.tsx`, no native URLs).
  - "Does not read replies": no inbound message processing.
  - Notifications are off by default (`product-platform.prisma:34-37`).
  - "Next up" exists (`jumps/page.tsx:365`).
  - The outcome list (Mark sent, Not sent, No answer, Left voicemail, Rescheduled, Skip) exists.
  - "No analytics provider" (`PublicConversionEvents.tsx` dispatches window events only).
  - No testimonials, ratings, user counts or "trusted by". The profession marks are declared "not customer logos" (`ProfessionMarks.tsx:7`), and the templates are labelled illustrative (`estimate-follow-up/page.tsx:25`). The OG image (`public/relationship-preview.png`) makes no claims.
  - The proposed catalogue does not leak: `git grep` of all public pages and their libs for `$`, Pro, Plus, Assistant, AI, WhatsApp, attachment, Gmail, Outlook, booking and Smart Field found only benign hits (the sample `$250` in unused `product-demo.ts`, "not a … booking calendar" boundaries, the privacy page's Gmail forwarding line, "Replies and attachments stay in your messaging app").

## Test coverage for this lane

- **Public claims.** `e2e/homepage-conversion.spec.ts`, `profession-pages.spec.ts`, `product-demo.spec.ts` and `public-trust.spec.ts`; `public-pages.spec.ts:8-10` checks headings and titles only; `tests/product-demo.test.ts` tests the unused `demoActionUrl`. **No test** ties the template or feature page descriptions to the demo (UX-02), and none checks the automatic-email disclosure (UX-01).
- **Accessibility.**
  - `e2e/accessibility.spec.ts:7` runs axe (wcag2a/aa/21aa/22aa) on `/jumps`, `/contacts`, `/contacts/new` and `/mixes/new` only.
  - About 30 other specs call axe.
  - `e2e/a2-css-checks.spec.ts` covers the A2 targets and floors.
  - `visual-fitment.spec.ts:66-69` sets text floors of 11 (nav), 12 (buttons) and 13 px (other).
  - **Not covered:** inline-link affordance (axe `allowSameColor`), focus-obscured checks, and axe on `/more`, `/contacts/<id>`, `/mixes` and `/onboarding` with the review sheet open.
- **Vocabulary.** `e2e/relationship-vocabulary.spec.ts`. No check against CANONICAL_PRODUCT_DECISIONS.
- **Lighthouse.** Covers 6 URLs (UX-09).

## NOT RUN

- **All rendering:** screenshots, 200% text, forced colours, a screen-reader pass. These need the lead's browser runs; see the checklist.
- **Physical devices:** whether iOS and Android keep the `sms:${number}?&body=` draft (`EditableFollowUpAction.tsx:57`), which the FAQ's "with the draft ready" relies on; iOS Home Screen push. These need real devices.
- **Production values:** `EMAIL_FROM`, `EMAIL_REPLY_TO`, admission ceilings (default 0) and whether the `security@` alias exists. These need Render dashboard or owner answers.
- **Lighthouse runs.** The lead runs Lighthouse.

## Questions for Kevin

1. **Vocabulary.** Should CANONICAL_PRODUCT_DECISIONS be updated to your 09-22 choice (Mix/Beat/Mega-Mix/Journey/Marketplace), or should the customer screens move to "Plan"? Either way, should Today's options sheet and onboarding get the "What these words mean" ⓘ?
2. **Automatic email for the beta.** Should beta users be able to turn it on? If yes, which From name and Reply-To should their customers see, and is it acceptable that replies reach the operator's mailbox?
3. **Waitlist.** Are the production admission ceilings above 0? They default to 0 (`admission.prisma:4-5`), and otherwise "from the waitlist as space opens" never happens.
4. **Positioning.** The target user is a plumber, but the public site's trade page `/for/contractors` is painting-specific ("bedrooms vs the full interior", "flooring"). The in-app library has 11 Home services plans. Add a home-services or plumbing variant?
5. **Security alias.** Does `security@jumpinthemix.com` exist yet?
6. **Open design decisions from 09-24.** Docked review width (DES-F4), the dark toast (DES-F7), the tablet header (DES-F15) and the landing scale (DES-F16).
