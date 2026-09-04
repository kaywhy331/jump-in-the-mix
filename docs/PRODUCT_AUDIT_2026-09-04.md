# Jump in the Mix — Full Product Audit

**Date:** 2026-09-04
**Scope:** Every user-facing screen, the scheduling engine, worker, data model, deployment model, docs, tests, and CI at commit `e08e1d3` (v0.1.0-rc.1).
**Lens:** The product the owner described. A lightweight, phone-first CRM that a self-employed plumber or a solo real-estate agent can set up in minutes with no marketing knowledge, and that populates the important outreach for them without requiring extra services. Judged against "product ready" and "best in class."

---

## 1. Executive summary

The engineering underneath this app is unusually strong for its stage. Timezone-safe logical-date scheduling, idempotent outcome recording, a durable worker with leases, a return-from-composer tray, undo, append-only relationship timeline, encrypted backups, and a hardened request boundary are all real and tested. That foundation is worth keeping.

The product on top of that foundation is not yet the product described in the brief. Four things stand between the current release candidate and a product a plumber would love:

1. **The app currently positions itself as a "personal relationship follow-through" tool for one person, self-hosted with Docker on localhost.** The brief is a business CRM for small businesses used from a phone. A plumber cannot install Docker, and the landing page, onboarding, and copy never speak to a business owner.
2. **Three defects break the core promise on first use.** Every prepared message renders with empty signatures and blank business names because the screen that edits business info and signatures was removed in the single-user consolidation. All server-rendered dates and times display in the container's timezone rather than the user's. Password reset silently fails in the pilot profile, which locks the single owner out permanently.
3. **The vocabulary and information architecture are built for the author, not the user.** "Jump," "Mix," "Important Date Type," "Action Template," "Mix Template," "Day offset," "Broadcast," "Snapshot audience," "Reconciliation." A plumber has to learn seven invented nouns before creating one follow-up. Three docs describe three different navigation schemes.
4. **The app cannot reach the user.** There are no push notifications, no daily digest, no reminder of any kind. The whole value is "never forget," yet the app only works if the user remembers to open it.

Roughly half of the codebase (billing, Stripe, Google, AI wizard, referrals, admin control plane, MFA, impersonation, support tickets, community templates) is dormant behind a 404 list in the proxy. It inflates the attack surface, the mental load for anyone maintaining it, and the test matrix, and it leaks into user-facing copy ("Contact Jump in the Mix Support" in a self-hosted single-user install).

**Build health at audit time.** `tsc --noEmit` passes with zero errors. The database-free unit suite passes (51 tests across 9 files). Integration and Playwright suites were not run here because they need PostgreSQL; CI is configured to run them on every push; no CI result was checked during this audit.

Everything below is organized as findings with severity, evidence (file and line), and the recommended change. Section 16 is a prioritized roadmap to product-ready and then best-in-class.

**Severity key.** P0 = breaks the core promise or blocks launch. P1 = must fix before public release. P2 = needed for best-in-class. P3 = polish.

---

## 2. Product positioning and target-user fit

### F-2.1 (P0) The product is positioned as a personal tool, not a small-business CRM

- **Evidence.** `README.md` line 3: "single-user relationship follow-through application ... without turning the experience into a team CRM." Landing page `src/app/page.tsx`: eyebrow "Personal relationship follow-up," hero "gives one person a clear place." `docs/SINGLE_USER_PRODUCT_SCOPE.md`: "not an organization, team, enterprise CRM, subscription ... product." Registration creates a workspace named `${name}'s personal data` (`src/lib/auth-actions.ts:83`).
- **Impact.** A plumber or agent landing here does not see themselves. Nothing says "get more repeat jobs," "win back estimates that went quiet," "stay top of mind with past buyers so they refer you."
- **Recommendation.** Reposition around the business owner's outcomes. Rewrite the landing page, onboarding, and empty states in plain trade language. Pick two or three launch verticals (home services, real estate, insurance/financial) and speak to them directly with vertical starter kits (see F-3.4).

### F-2.2 (P0) Deployment model requires Docker on the user's own machine

- **Evidence.** `README.md` "Pilot requirements: Docker with Docker Compose v2, Node.js 22." `START_HERE.md` and the `start-local.*` launchers. `compose.pilot.yml` binds to `127.0.0.1` only. No hosted deployment path, no Vercel/Fly/Render config, no multi-tenant onboarding.
- **Impact.** The target user operates from a phone. They will never run `docker compose`. The current distribution reaches developers only.
- **Recommendation.** Ship a hosted SaaS (single Postgres, the existing worker as a background service). The schema already carries `workspaceId` on every row and isolation tests exist (`tests/workspace-isolation.test.ts`), so multi-tenant hosting is largely a matter of un-gating registration and adding billing later. Keep the self-host path as a secondary option for privacy-minded users.

### F-2.3 (P1) No installable mobile experience

- **Evidence.** No `manifest.ts`/`manifest.json`, no service worker, no `theme-color`, no `apple-touch-icon`, no icons in `public/` (only `product-proof/*.png` and `.gitkeep`). `grep -rn manifest src` returns nothing user-facing.
- **Impact.** Cannot be added to the home screen as an app. No offline shell, no splash, no standalone display. Feels like a website on a phone.
- **Recommendation.** Add a web app manifest (name, short name "JITM" or better, icons 192/512 maskable, `display: standalone`, `theme-color`), an `apple-touch-icon`, and a minimal service worker that caches the app shell and the Today page. Prompt "Add to home screen" after the first completed follow-up.

### F-2.4 (P1) The app never reaches out to the user

- **Evidence.** `grep -rn -i "notification|webpush|digest|reminder" src` finds only crypto digests and support email. `docs/SINGLE_USER_PORT_MATRIX.md` mentions "simple personal notifications" but nothing is implemented. The worker (`src/worker/index.ts`) only reconciles and imports.
- **Impact.** A plumber finishes a job at 6 pm and never opens the app. The follow-up that would have earned a five-star review and a referral sits unseen on Today.
- **Recommendation.** Three layers, in order of effort: (1) a morning email digest "3 people to reach today" with one-tap links (Resend is already wired); (2) Web Push via the service worker for "due now" and "overdue since yesterday"; (3) optional SMS reminder to the owner's own phone. Add a notification preference screen with quiet hours reused from scheduling defaults.

### F-2.5 (P1) Documentation describes three incompatible navigation models

- **Evidence.** `docs/PRODUCT_SPEC.md`: Home / Jumps / Contacts / Mixes / Library / Settings. `docs/CANONICAL_PRODUCT_DECISIONS.md` §3: Jump / Contacts / Settings / AI Assistant / Help. `docs/SINGLE_USER_PRODUCT_SCOPE.md`: Today / Contacts / Mixes / Templates / More. Code (`src/components/Nav.tsx`) matches the third.
- **Impact.** Every contributor and every future AI agent working on the repo picks a different truth. The "canonical" doc is not canonical.
- **Recommendation.** Retire or archive `PRODUCT_SPEC.md` and `CANONICAL_PRODUCT_DECISIONS.md` sections that no longer apply, or rewrite `CANONICAL_PRODUCT_DECISIONS.md` as the single source and delete the rest. One product doc, one IA.

---

## 3. Blocking defects (P0)

### F-3.1 (P0) Business info and signatures cannot be edited, so every message renders broken

- **Evidence.** `git log -S smsSignature -- src/app` shows the Profile and Messaging settings sections were removed in `99a5afd` ("Simplify ... single-user"). `git show 2a4f68c:src/app/(app)/settings/page.tsx` had `?section=profile` (company, website, phone, address, products) and `?section=messaging` (SMS and email signatures) wired to `updateWorkspaceProfileAction`. Current `src/app/(app)/settings/page.tsx` is a five-link hub with none of those. `src/lib/workspace-profile-actions.ts` and `src/components/RepeatableProfileRecords.tsx` are orphaned (grep shows no importer).
- **Rendering.** `src/lib/jump-render.ts:100-148` maps `{{My Company}}`, `{{My Phone}}`, `{{My Product 1}}`, `{{SMS Signature}}`, `{{Email Signature}}` to `profile?.x ?? ""`. `renderJumpTemplate` (line 155) replaces every unknown or empty token with `""`.
- **Content that depends on it.** Starter mix (`src/lib/mix-generator.ts`) uses `{{My Product 1}}`, `{{Email Signature}}`, `{{SMS Signature}}`, `{{Company}}`. All four seeded templates (`prisma/seed.ts`) end with `{{Email Signature}}` or `{{SMS Signature}}`.
- **What the user sees on their very first Jump.** "Hi Jordan, out of curiosity, how is  currently handling this? I ask because  may be relevant, but I would first like to understand..." followed by no sign-off. Double spaces, missing nouns, no name.
- **Why tests missed it.** `tests/jump-render.test.ts` passes a fully populated profile. The onboarding e2e (`e2e/core-flows.spec.ts:117`) asserts a Jump exists but never reads its rendered content.
- **Recommendation.** (a) Restore a "My business" screen under Settings with business name, phone, website, one to five services, SMS signature, email signature. (b) Collect business name and a one-line SMS signature during onboarding (two fields). (c) Change rendering so empty tokens degrade gracefully: `{{Company}}` → "your business" or drop the clause, signatures → the owner's name, and collapse double spaces. (d) Add an e2e assertion that the first rendered Jump contains no `{{`, no double space, and ends with the owner's name.

### F-3.2 (P0) Server-rendered dates and times use the server's timezone

- **Evidence.** `src/lib/format.ts:1-20`: `formatDate` and `formatDateTime` call `Intl.DateTimeFormat("en-US", {...})` with no `timeZone`. They run in Server Components. Used on Today (`src/app/(app)/jumps/page.tsx` due labels and action history), Contacts list (last interaction, next Jump), Account sessions, Templates. The Docker image (`Dockerfile`) has no `TZ`, so the container is UTC. Meanwhile the client-side `ContactTimeline.tsx:47` uses `Intl.DateTimeFormat(undefined, ...)` (browser zone). `ContactRelationshipStatePanel.tsx:22` converts `nextCommitmentAt` with `getTimezoneOffset()` on the server.
- **Impact.** A user in Chicago whose follow-up is scheduled for 10:00 AM sees "Today · 3:00 PM" on Today and "10:00 AM" on the contact timeline. Overdue math is correct (it uses `zonedDateTimeToUtc`), but the displayed clock is wrong everywhere the server renders it.
- **Recommendation.** Thread the user's timezone and locale (already stored in `UserPreference` and `WorkspaceProfile`) into `formatDate`/`formatDateTime` as required parameters, or create a `formatInZone(value, timezone, locale)` helper and replace all call sites. Add a unit test that renders a fixed instant in `America/Chicago` and `Asia/Tokyo`. Set `TZ=UTC` explicitly in the Dockerfile so the server is deterministic.

### F-3.3 (P0) Password reset silently fails in the pilot profile, locking out the only user

- **Evidence.** `compose.pilot.yml` sets `NODE_ENV=production` and `RESEND_API_KEY: ""`. `src/lib/transactional-email.ts:29-31` throws "Transactional email is not configured" in production. `requestPasswordResetAction` (`src/lib/auth-actions.ts:196-203`) catches the error, logs it, and redirects to `?sent=1`. The page then shows "If an account matches that email, a reset link has been sent." No dev token is exposed in production.
- **Impact.** Registration closes after one owner (`pilotRegistrationOpen`). If that owner forgets their password there is no recovery path at all short of database surgery.
- **Recommendation.** For self-host: make the forgot-password page detect unconfigured email and instead show a CLI recovery instruction (add `npm run pilot:reset-password -- email`). For hosted: email is mandatory, so wire Resend and verify delivery in staging before launch. Never show "sent" when delivery threw.

### F-3.4 (P0) Starter and template copy is B2B consulting language, wrong for the target user

- **Evidence.** `src/lib/mix-generator.ts:50-70`: "how is {{Company}} currently handling this?", "whether {{My Product 1}} could support what {{Company}} is trying to accomplish." `prisma/seed.ts` templates: "New Lead Follow-Up" (question-led consultative), "Referral Introduction," "New Client Onboarding" (coaching), "Renewal Value Check-In." Categories seeded as "Sales & Prospecting," "Client Success / Retention." Industry list includes "Coaching / Consulting."
- **Impact.** A plumber's homeowner customer receives "what tradeoff matters most?" The copy reads as a SaaS sales cadence, not a tradesperson checking in after a job.
- **Recommendation.** Replace the starter kit with vertical packs written in plain, warm, first-person language. Home services: "Job done, thank you + review request," "Estimate sent, 2-day and 7-day nudge," "Seasonal maintenance reminder," "One-year anniversary check-in." Real estate: "New lead 5-touch," "Under contract weekly update," "Closing anniversary," "Home anniversary," "Just listed / just sold neighbor note," "Past-client birthday." Generic: "Went quiet, gentle reconnect." Each 40 to 120 words, SMS under 160 characters, no jargon.

---

## 4. Onboarding and first-run

### F-4.1 (P1) Onboarding collects the wrong things

- **Evidence.** `src/app/onboarding/page.tsx` asks: contact name, email, phone, reason (five fixed options), date, timezone with a required "Confirm timezone" checkbox. It does not ask what kind of business the user runs, their business name, or how they want to sign messages. Yet those drive all rendered content (F-3.1) and which templates fit (F-3.4).
- **Recommendation.** Step 1: "What do you do?" (tile picker: Plumber/HVAC/Electrician, Real estate, Insurance/Finance, Other). Step 2: business name and how you sign texts (pre-filled from name). Step 3: first person to follow up with (existing form, phone-first). Auto-detect and silently apply timezone with a small "Change" link instead of a required checkbox. Install the vertical's starter pack on completion.

### F-4.2 (P1) Onboarding date and phone handling are inconsistent with the rest of the app

- **Evidence.** `onboarding/page.tsx:12` computes `today` with `new Date().toISOString()` (UTC) for both `min` and `defaultValue`, so a US user after roughly 7 pm sees tomorrow preselected. `onboarding-actions.ts:60` stores phone `normalized: contactPhone.replace(/\D/g, "")`, bypassing `normalizePhone` in `src/lib/contact-input.ts:40`, which preserves a leading `+`. A contact added as "+1 555..." in onboarding and again through the form produces different normalized values and escapes duplicate detection.
- **Recommendation.** Compute the default date in the detected timezone. Route onboarding through `buildPhoneInputs`/`buildEmailInputs`.

### F-4.3 (P1) Registration friction is high for phone users

- **Evidence.** `src/app/register/page.tsx`: name, email, 12-character minimum password. No passkeys, no magic link, no social sign-in. `AUTH_REQUIRE_EMAIL_VERIFICATION` defaults false, so email is unverified, which conflicts with using email for recovery.
- **Recommendation.** Offer "Continue with Google/Apple" and email magic link as the primary paths on mobile; keep password as fallback. Verify email at signup in hosted mode.

### F-4.4 (P2) The dashboard page is dead but still compiles and links into a 404

- **Evidence.** `src/app/(app)/dashboard/page.tsx` is unreachable (no links, `grep -rn "/dashboard" src` returns nothing) yet imports `PLAN_LIMITS` and links to `/mixes/wizard`, which `src/proxy.ts` returns 404 for. It also computes "today" with server-local `setHours(0,0,0,0)`.
- **Recommendation.** Delete it, or rebuild it as a real "Home" (see F-5.1).

---

## 5. Daily workflow: Today

The Today page is the strongest screen. Overdue first, next-up card on mobile, one-tap Text/Email/Call, return tray after the composer, undo, snooze presets, stop plan. Keep all of that. Findings:

### F-5.1 (P1) Too much chrome around the list on mobile

- **Evidence.** `src/app/(app)/jumps/page.tsx`: page header, next-up section, compact summary line, four range chips (Today/7 days/30 days/All), a Filter disclosure with Status and Channel selects and an Apply button (`mobile-filter-panel`), then Overdue, Today, Upcoming, Completed sections, then a three-link insights footer. A plumber wants: who do I call next.
- **Recommendation.** Default view is a single ordered list (overdue, then today). Move range and channel filters behind one "Filter" sheet with instant apply (the contacts page already does this through `GlobalLiveSearch`; Today still has an Apply button, contradicting `docs/UX_WORKFLOW_OPTIMIZATION.md` Phase 4). Drop the insights footer on mobile or fold it into a small "This week" line.

### F-5.2 (P1) Card content is hidden behind `<details>`; the message is not visible before acting

- **Evidence.** `jumps/page.tsx` renders `<details className="jump-details">` with the prepared content in the collapsed body; the summary shows a 120-character snippet. Copy button lives inside the expanded body.
- **Impact.** Users tap Text, the composer opens, and only then see the full message. Editing before sending is not possible in-app.
- **Recommendation.** Show the full prepared message on the card when the card is the "Next up." Add an inline "Edit before sending" textarea that rewrites the `sms:`/`mailto:` URL live. Keep Copy visible.

### F-5.3 (P2) Return tray vocabulary leaks internal model names

- **Evidence.** `JumpWorkflow.tsx:311-318` "Note visibility: Customer timeline / Private relationship update" with values `WORKSPACE`/`PRIVATE`. `outcome/route.ts` records `visibility: "WORKSPACE"` in a single-user product.
- **Recommendation.** One note field with a small "Keep private (never inserted into messages)" toggle. Rename the enum in a later migration; for now map labels.

### F-5.4 (P2) Snooze "Custom" uses `datetime-local` inside a hover menu

- **Evidence.** `jumps/page.tsx` custom snooze form inside `<details className="jump-overflow">`. On phones, `datetime-local` pickers are heavy and the menu closes on blur in some browsers.
- **Recommendation.** Replace with a bottom sheet with quick chips (Later today, Tomorrow 9am, Monday) and a date-only picker, time defaulting to the user's follow-up time.

### F-5.5 (P2) Channel action labels and missing-contact-method state

- **Evidence.** When a contact lacks a phone the primary action renders a `Missing` pill (`jumps/page.tsx`, `status-pill` with a title tooltip). Tooltips do not exist on touch.
- **Recommendation.** Render "Add phone" as a button that opens the inline basics form for that contact.

---

## 6. Plans, sequences, and templates (Mixes)

### F-6.1 (P0) Creating a follow-up plan requires understanding seven concepts

- **Evidence.** `src/components/MixEditor.tsx` on one screen: Mix name, description, Lifecycle (Draft / Review and activate / Paused), Plan classification (framework, category, industry), Trigger (From an Important Date / Start manually / On one fixed date), Important Date Type select with "System ·" prefixes, Audience (All active Contacts or Contact Groups), Action sequence with per-action mode radio (Write this action / Insert template), internal action name, channel, subject, message, "Also save as reusable Action Template," Day offset with negative numbers, optional local time override, drag handle. Then an activation review modal with "projected future Jumps."
- **Impact.** This is a marketing-automation builder. The brief says "no clue about marketing." Nobody in the target segment will finish this form on a phone.
- **Recommendation.** Two paths only. (1) **Pick a plan**: vertical templates with one screen: name, who it applies to (new leads / past customers / everyone / pick people), on. (2) **Simple custom**: "When [I add a follow-up date / a job is finished / a birthday], send [Text] [Day 0], then [Call] [Day 3], then [Email] [Day 10]." Each step is a channel pill, a day number, and a message. Hide framework/category/industry, action mode, save-as-template, time override, and negative offsets behind "Advanced."

### F-6.2 (P1) Templates are a top-level nav item and a separate mental model from Mixes

- **Evidence.** `src/components/Nav.tsx` gives Templates one of five slots. `src/app/(app)/mixes/page.tsx` "New Mix" menu offers three entries (Start from template / Build manually / Simple starter). `docs/UX_WORKFLOW_OPTIMIZATION.md` Phase 3 ("Replace the four-way New Mix menu with one goal-led creator") is unchecked.
- **Recommendation.** Fold Templates into Plans as the default "New plan" screen. Free the nav slot for Home or Inbox.

### F-6.3 (P1) Template library exposes versioning metadata nobody asked for

- **Evidence.** `templates/page.tsx` shows "Version 1 · Updated Sep 1," "Previously used 2× · latest used version 1," "New version" pill, "Use latest version." Filters need an Apply button. `TemplateUseForm.tsx` "Setup review" shows "projected Jumps" and "day span."
- **Recommendation.** Show title, one-line promise ("Turns finished jobs into reviews and referrals"), the sequence as three or four pills (Text day 0 → Call day 3 → Email day 10), and one "Use this plan" button.

### F-6.4 (P2) Action Templates are a third content silo

- **Evidence.** `/settings/jumps` ("Jumps" heading, "Action Templates" title, "Create Jump" button — three names for one thing). `MixEditor` "Insert template" mode. Bulk "Apply Jump" offers "Existing Jump / One-time content."
- **Recommendation.** Remove reusable Action Templates as a user-facing concept. Keep the `StepTemplate` model internally. Offer "Save this message for later" inside the plan editor if needed later.

### F-6.5 (P2) Audience model is confusing and duplicated

- **Evidence.** `MixEditor` audience is "All active Contacts" or Groups, with a note "Direct Contact assignments remain separate." Contact detail has "Assign Mix" per contact. `mix-editor-actions.ts` derives `assignAllContacts` by checking `assignmentKey.includes(":audience:")` on the edit page.
- **Recommendation.** One audience concept: "Who gets this plan? Everyone tagged X / Pick people / Anyone I add a [date type] to." Represent groups as simple tags.

---

## 7. Contacts

### F-7.1 (P1) The add-contact form is too long for a phone

- **Evidence.** `src/components/ContactForm.tsx` renders six cards: details, first follow-up, emails (label + primary radio + remove), phones (same), addresses (seven fields each with primary radio), groups and notes (two textareas with policy copy), custom fields. Header copy: "Customer notes store reusable relationship context. Private relationship updates stay reserved for calls, deal movement, and sensitive follow-up context."
- **Recommendation.** Phone-first quick form: Name, Phone, (Email), Tag, Note, "Follow up on [date]" toggle. One "More details" disclosure for addresses, extra numbers, custom fields. Default label the first phone "Mobile" and skip the primary radios when there is one value.

### F-7.2 (P1) Contact detail is a nine-card board with drag-to-reorder

- **Evidence.** `src/app/(app)/contacts/[contactId]/page.tsx` builds nine `PersonalizableCardItem`s (Relationship state, Timeline, Important Dates, Add Important Date, Contact summary, All contact methods, Private summary, Custom fields, Assigned Mixes) rendered by `PersonalizableCardBoard` with pointer drag, keyboard reorder, collapse state synced to `/api/preferences/contact-layout`. Header has Duplicates, Edit, Back buttons plus four quick actions.
- **Impact.** Power-user personalization at the cost of a clear default. A plumber needs: name, call/text buttons, last three interactions, next follow-up, notes.
- **Recommendation.** Fixed layout: header with big Text/Call/Email, "Next: [action] on [date]" line, notes, timeline, then a collapsed "More" for dates, plans, fields. Remove drag ordering; if kept, gate behind a Settings toggle.

### F-7.3 (P1) Contacts header exposes edge-case tools as primary actions

- **Evidence.** `ContactsBulkWorkspace.tsx` header: Duplicates, Archived, More (groups manager with color picker), Add. On mobile all four are icon-only 44px buttons with `font-size: 0` labels (`mobile-ux.css`). Saved views bar with "Save or manage view" above the list.
- **Recommendation.** Header: search, Add. Everything else under one overflow. Hide saved views until the user has more than ~200 contacts.

### F-7.4 (P2) Bulk "Apply Jump" mixes two modes and three jargon terms

- **Evidence.** `ContactsBulkWorkspace.tsx` bulk panel: "Apply one-time Jump," radio "Existing Jump / One-time content," "Internal label," "Reason shown on Today," placeholder hint listing `{{Public Notes}}`.
- **Recommendation.** "Send a message to N people": channel, message, when. Done.

### F-7.5 (P2) Relationship-state panel is a form with a Save button and version field

- **Evidence.** `ContactRelationshipStatePanel.tsx`: priority, preferred channel, free-text status, `datetime-local` next commitment, do-not-contact, "Save relationship state." Optimistic `version` hidden input.
- **Recommendation.** Inline chips (Priority ●, Prefers text, Do not contact toggle) that save on change.

### F-7.6 (P2) Contact list search uses `contains` on unindexed text

- **Evidence.** `contacts/page.tsx` `OR` over displayName, company, publicNotes, privateNotes, emails, phones, custom values with `contains`/`insensitive`. Indexes exist on `[workspaceId, displayName]` and `[workspaceId, company]` only.
- **Recommendation.** Fine for hundreds of rows; add a `tsvector` or trigram index before hosted multi-tenant scale.

---

## 8. Quick Add

### F-8.1 (P1) Quick Add promises natural language but is a small regex

- **Evidence.** `src/lib/quick-add-capture.ts` recognizes "follow up with|call|text|email|add|met <name>", one phone pattern, today/tomorrow/next <weekday>/next week/MM-DD. "Text Maria Friday about the estimate" fails on "Friday" (no bare weekdays), "in 2 weeks," "Mon," "Sept 12." Anything unrecognized yields "Choose a capture type and finish the details."
- **Recommendation.** Either (a) widen the parser (bare weekdays, "in N days/weeks," month names, "@" phone/email) and show a live preview of the interpretation, or (b) route the sentence through the existing deterministic path plus an optional local LLM later. Also add voice: the `VoiceNoteButton` already exists; put a mic in Quick Add.

### F-8.2 (P2) Quick Add dialog offers five destinations plus free text

- **Evidence.** `QuickAdd.tsx` grid: New Contact, Important Date, One-time Jump, New Mix, Import Contacts.
- **Recommendation.** Free text box plus two buttons: "Add a person" and "Log what happened." Everything else is reachable from the page it belongs to.

---

## 9. Settings, account, help

### F-9.1 (P0) See F-3.1: no "My business" screen.

### F-9.2 (P1) Two timezone fields, two quiet-hour stores

- **Evidence.** `UserPreference.timezone` and `WorkspaceProfile.timezone`; `WorkspacePreference.quietHours*` and `WorkspaceProfile.quietHours*`. `account-preference-actions.ts` writes both, but the Today page reads `workspace.profile?.timezone`, the engine reads `WorkspacePreference` first then falls back to profile (`jump-engine.ts:135-143`).
- **Recommendation.** Pick one source per setting, migrate, and delete the other.

### F-9.3 (P1) Support tickets and FAQ are written for a SaaS with a support team

- **Evidence.** `help/page.tsx` "Contact Jump in the Mix Support," "Jump in the Mix Response" labels, ticket categories, priorities, statuses "Waiting on Jump in the Mix." In self-host there is no one on the other end. FAQ answers use "reconciliation," "logical calendar dates," "Important Date Type matches the Mix trigger."
- **Recommendation.** Self-host: replace tickets with "Email us" mailto plus a link to a public help site. Hosted: keep tickets but rewrite FAQ in plain language with screenshots. Either way, remove the support-ticket subsystem from the single-user build or hide it behind a config flag.

### F-9.4 (P2) Locale is collected but never used

- **Evidence.** `account/preferences/page.tsx` locale select. `format.ts` hardcodes `"en-US"`.
- **Recommendation.** Use it in the timezone-aware formatter (F-3.2) or remove the field.

### F-9.5 (P2) Timezone picker is a free-text input with a datalist

- **Evidence.** `TimezonePicker.tsx`. iOS Safari renders datalists poorly; users must type "America/Chicago."
- **Recommendation.** Auto-detect, show "Chicago (CDT)" with a Change link that opens a searchable list of city names.

---

## 10. Copy, terminology, and tone

### F-10.1 (P0) Invented vocabulary throughout

- **Evidence.** Jump, Jumps (queue and template both), Mix, Mix Template, Action Template, Important Date, Important Date Type, Day offset, Broadcast, Manual-start, Snapshot, Reconciliation, Activation impact, Customer notes vs Private relationship updates, Contact Group activation, Saved views. `docs/CANONICAL_PRODUCT_DECISIONS.md` even defines "Jumps" as reusable content and "Jump" as the queue.
- **Recommendation.** Adopt plain words and use them consistently in UI, docs, and code DTOs: Today (to-dos), Follow-up (one action), Plan (sequence), Tag (group), Date (important date), Note. Keep "Jump in the Mix" as the brand only. Add a terminology lint to `tests/single-user-scope.test.ts` that fails on "Mix Template," "Action Template," "Day offset," "reconcil" in user-facing files.

### F-10.2 (P1) Success notices explain internals

- **Evidence.** 13 `Notice` variants on `contacts/page.tsx` and 16 on `contacts/[contactId]/page.tsx`, e.g. "Mix assigned. The background worker is preparing matching Jumps," "Active Contact Groups updated. Existing memberships are preserved and future Jumps are being reconciled."
- **Recommendation.** One toast per action, five words max: "Saved," "Plan started," "Follow-up scheduled for Fri." Never mention the worker.

### F-10.3 (P2) Empty states are generic

- **Evidence.** `EmptyState.tsx` always shows the same bolt icon. Today empty: "You're all caught up" links to Contacts. Mixes empty links to Templates.
- **Recommendation.** Contextual first-run empties with one clear next action per vertical.

---

## 11. Visual design and mobile ergonomics

### F-11.1 (P1) CSS is a layered override system

- **Evidence.** 21 stylesheets, 3,246 lines. `mobile-ux.css` header comment: "Authoritative mobile application layout. Loaded after legacy feature styles." 14 `!important`s. `desktop-only`/`mobile-only` classes used 21 times in TSX to render duplicate DOM for both breakpoints (Today renders Overdue and Today sections twice).
- **Recommendation.** Consolidate to tokens + components + one responsive layer. Render one DOM and adapt with CSS. Consider CSS Modules everywhere (two components already use them).

### F-11.2 (P1) Type sizes below readable on phones

- **Evidence.** 65 declarations under 0.8rem, including `.62rem` and `.68rem` (about 10 to 11px) for nav labels, meta lines, and pills.
- **Recommendation.** Minimum 0.8125rem (13px) for any text a user must read; 0.75rem only for decorative labels.

### F-11.3 (P2) No dark mode

- **Evidence.** `grep -rc prefers-color-scheme src/styles` = 0. Contrast and forced-colors are handled.
- **Recommendation.** Add a dark token set; phones are used in trucks and at night.

### F-11.4 (P2) Heavy reliance on `<details>` for menus and disclosures

- **Evidence.** Row menus, filter panels, snooze menus, create panels, edit forms are all `<details>`. Open state is uncontrolled, does not close on outside tap, and stacks oddly on small screens.
- **Recommendation.** A shared bottom-sheet/menu component with outside-tap close and focus trap.

### F-11.5 (P3) Brand mark is generic

- **Evidence.** `Logo.tsx` SVG is four abstract strokes. No favicon or app icon in `public/`.
- **Recommendation.** Commission an icon set (192/512 maskable) and a favicon; reuse the purple.

---

## 12. Data model and engine

### F-12.1 (P1) Roughly half the schema and code is dormant

- **Evidence.** `prisma/schema.prisma` + companion files: PlanTier, SubscriptionStatus, Subscription, IntegrationConnection, SyncRun, OAuthState, MessagingIdentity, ChannelLinkCode, CaptureDraft, AiMixDraft, SharedMix*, Referral*, AdminMfa*, AdminImpersonation, SupportTicket*, WebhookEvent, PlatformSetting. `src/lib`: billing*, stripe-client, google-*, ai-mix*, referral*, admin-*, impersonation, totp, shared-mix-*, support-*. Blocked only by a prefix list in `src/proxy.ts`. `vitest.config.ts` excludes 10 test suites for them. `PLAN_LIMITS` is still imported in `contact-actions.ts:11`, `mix-lifecycle-actions.ts:5`, `starter-mix-actions.ts:5`, and `PRO.contacts` is still 5000 in `plans.ts`.
- **Impact.** Every dependency upgrade, every migration, every security review carries the dormant weight. A proxy prefix miss reopens a dormant route.
- **Recommendation.** Decide the commercial model (hosted with tiers, or free single-user) and then either revive billing deliberately or delete the dormant modules and drop the tables in one reviewed migration. Half-alive is the worst state.

### F-12.2 (P1) Jump status enum still carries COPIED and SENT

- **Evidence.** `JumpStatus` has PENDING, COPIED, SENT, DONE, SKIPPED, CANCELED. Pages treat `["PENDING","COPIED"]` as pending and `["DONE","SENT"]` as done everywhere (`jumps/page.tsx:37-39`, `contacts/page.tsx`, `bulk-contact-actions.ts`). `CANONICAL_PRODUCT_DECISIONS.md` §4 says these are legacy.
- **Recommendation.** Migrate COPIED → PENDING and SENT → DONE, drop the enum values, and remove the arrays.

### F-12.3 (P2) Contact update deletes and recreates all methods

- **Evidence.** `contact-actions.ts:updateContactAction` `deleteMany` then `createMany` for emails, phones, addresses, group memberships, custom values.
- **Impact.** Loses `createdAt`, churns ids, and would break `ExternalContactLink` style references later.
- **Recommendation.** Diff and upsert by normalized key.

### F-12.4 (P2) Reconciliation loads the full graph every run

- **Evidence.** `jump-engine.ts:reconcileJumps` includes every assignment with workspace, profile, owner, contact, group memberships, each contact's emails/phones/addresses/custom fields/dates. The worker runs it every 5 minutes for all workspaces with no filter (`worker/index.ts:runMaintenanceIfDue`).
- **Impact.** Fine for one user. For hosted multi-tenant it will not scale; also `desired` is a full in-memory map.
- **Recommendation.** Per-workspace scheduling with a `nextReconcileAt`, and a lighter "due soon" horizon for the periodic pass.

### F-12.5 (P2) Rendering snapshot is regenerated on every profile change for every pending Jump

- **Evidence.** `sameDesired` compares JSON snapshots; any profile edit rewrites all pending Jumps. Correct, but a signature typo fix rewrites thousands of rows in hosted mode.
- **Recommendation.** Acceptable now; note for scale.

---

## 13. Security, privacy, operations

Strong areas: opaque hashed sessions with caps, DB-backed rate limits, origin/Fetch-Metadata mutation boundary, security headers, CSV formula-injection protection, AES-GCM backups with manifests, non-root images, account deletion with reauth. Findings:

### F-13.1 (P1) `DEMO_MODE` defaults to true outside production and pre-fills credentials

- **Evidence.** `env.ts:demoMode: enabled(process.env.DEMO_MODE, !isProduction)`; `login/page.tsx` pre-fills `defaultValue={env.demoEmail}` and password. `docker-compose.yml` default `DEMO_MODE: true`.
- **Recommendation.** Fine for local dev; make sure hosted staging sets it false explicitly and that the production readiness check (`productionConfigurationIssues`) also fails when `PILOT_MODE` is true on a public host.

### F-13.2 (P1) Session cookie is `SameSite=Lax` with a 30-day life and no rotation

- **Evidence.** `auth.ts:createSession` sets `sameSite: "lax"`, `expires` 30 days, never rotates. Fine for pilot.
- **Recommendation.** Rotate on privilege-sensitive actions and consider `Strict` where the mailto/sms handoffs allow.

### F-13.3 (P2) `mailto:` and `sms:` carry the full message in the URL

- **Evidence.** `jumps/page.tsx:actionUrl` encodes body into the URL. Private notes are correctly excluded from non-call channels. URL length limits on some Android SMS apps truncate around 1,000 characters.
- **Recommendation.** Warn when body exceeds ~900 characters for SMS; offer Copy as primary in that case.

### F-13.4 (P2) No CSP header

- **Evidence.** `proxy.ts:applySecurityHeaders` sets nosniff, frame-options, referrer, permissions, COOP, CORP, HSTS. No `Content-Security-Policy`.
- **Recommendation.** Add a nonce-based CSP once inline styles are removed (several `style={{}}` for group colors).

### F-13.5 (P2) Export is JSON only

- **Evidence.** `api/account/export/route.ts` returns a single JSON document.
- **Recommendation.** Add a CSV bundle (contacts, timeline) that opens in Sheets; small-business users do not read JSON.

---

## 14. Tests, CI, and quality gates

Strengths: migration rehearsal, backup/restore rehearsal, typecheck, unit + integration, production build, Playwright on desktop and Pixel 7, visual baseline. The DB-free unit suite passes locally (51 tests, 9 files).

### F-14.1 (P1) No test would have caught F-3.1 or F-3.2

- **Recommendation.** Add: (a) e2e that reads the first rendered Jump body and asserts no `{{`, no `"  "`, ends with owner name; (b) unit for `formatDateTime` in two zones; (c) contract test that every seeded template's placeholders are satisfiable by onboarding-collected fields.

### F-14.2 (P2) Terminology test is narrow

- **Evidence.** `tests/single-user-scope.test.ts` bans commercial words but checks only 28 files and does not check for `PLAN_LIMITS` in `contact-actions.ts`, `mix-lifecycle-actions.ts`, `starter-mix-actions.ts` (which still import it).
- **Recommendation.** Glob all `src/app` and `src/components`; add the plain-language vocabulary bans from F-10.1.

### F-14.3 (P2) No Lighthouse or axe in CI

- **Recommendation.** Add Lighthouse CI (mobile, PWA, performance) and `@axe-core/playwright` on Today, Contacts, Add contact, Plan editor.

### F-14.4 (P3) Manual device matrix is entirely NOT RUN

- **Evidence.** `docs/MANUAL_DEVICE_QUALIFICATION.md` all rows "NOT RUN."
- **Recommendation.** Run the SMS/email/call handoff and return-tray rows on one iPhone and one Android before any external user.

---

## 15. What is already best-in-class (keep)

- Logical-date scheduling with Feb 29 and month-end clamping, IANA zones, quiet hours, weekend shift (`jump-schedule.ts`, `personal-scheduling.ts`).
- Deterministic uniqueness keys and idempotent outcome API with replay (`outcome/route.ts`).
- Return-from-composer tray with call-specific outcomes and next-follow-up capture in one step (`JumpWorkflow.tsx`).
- Undo on completion; completed history immutable.
- Append-only timeline merging notes and completed actions (`activity/route.ts`).
- Worker leases, renewal, retry backoff, heartbeat, stale detection.
- Contact import with browser-side parsing, mapping, duplicate review, resumable batches.
- Device Contact Picker progressive enhancement with graceful fallback.
- Encrypted backup/restore that refuses in-place restore.
- Request-origin boundary and security headers in one place.

---

## 16. Roadmap to product-ready, then best-in-class

### Phase A — Stop the bleeding (1 to 2 weeks)

1. Restore "My business" settings and collect business name + SMS signature in onboarding (F-3.1).
2. Timezone-aware formatter everywhere; `TZ=UTC` in Dockerfile; tests (F-3.2).
3. Fix forgot-password so it never claims "sent" when it did not; add CLI reset for self-host (F-3.3).
4. Graceful placeholder fallbacks and a first-Jump content e2e (F-3.1, F-14.1).
5. Onboarding date/phone normalization (F-4.2). Delete dead dashboard (F-4.4).

### Phase B — Become the product in the brief (3 to 5 weeks)

6. Plain-language vocabulary pass across UI and docs; one canonical product doc (F-10.1, F-2.5).
7. Vertical starter packs and rewritten templates for home services, real estate, insurance (F-3.4, F-6.2).
8. Onboarding: business type tile → business name/signature → first person; auto timezone (F-4.1, F-9.5).
9. Simple plan builder with Advanced disclosure; fold Templates into Plans; drop Action Templates from UI (F-6.1 to F-6.4).
10. Phone-first Add Contact and fixed contact detail layout; declutter Contacts header (F-7.1 to F-7.3).
11. Today: single list, instant filters, full message on next-up card, edit before sending (F-5.1, F-5.2).
12. PWA manifest, icons, service worker, add-to-home-screen prompt (F-2.3).
13. Email digest + Web Push for due and overdue (F-2.4).
14. Decide commercial model; delete or revive dormant modules; drop COPIED/SENT (F-12.1, F-12.2).

### Phase C — Best-in-class (ongoing)

15. Hosted SaaS with Google/Apple sign-in and magic link; keep self-host (F-2.2, F-4.3).
16. Voice-first Quick Add ("Just finished the Hendersons' water heater, follow up in a week") with a stronger parser (F-8.1).
17. Autonomous mode, opt-in: connect Twilio/SendGrid or the user's Gmail to send prepared messages automatically after a review window; keep human-in-the-loop as default.
18. Review and referral engine: post-job "How did we do?" → Google review link → referral ask, tracked in timeline.
19. Weekly owner report: follow-ups done, replies logged, quiet customers, top referrers.
20. Dark mode, consolidated CSS, bottom-sheet component, axe + Lighthouse in CI (F-11.x, F-14.3).
21. Per-workspace reconciliation scheduling and search indexes for scale (F-12.4, F-7.6).

---

## 17. Finding index

| ID | Sev | Area | One-line |
|---|---|---|---|
| F-2.1 | P0 | Positioning | Personal tool framing, not SMB CRM |
| F-2.2 | P0 | Distribution | Docker-on-localhost only |
| F-2.3 | P1 | Mobile | No PWA manifest, icons, or service worker |
| F-2.4 | P1 | Engagement | No notifications or digests |
| F-2.5 | P1 | Docs | Three conflicting IA docs |
| F-3.1 | P0 | Defect | Business info/signature UI removed; messages render broken |
| F-3.2 | P0 | Defect | Server-timezone date display |
| F-3.3 | P0 | Defect | Password reset silently fails in pilot |
| F-3.4 | P0 | Content | B2B consulting copy for trades users |
| F-4.1 | P1 | Onboarding | Collects wrong fields |
| F-4.2 | P1 | Onboarding | UTC default date; phone normalization bypass |
| F-4.3 | P1 | Auth | High signup friction on phone |
| F-4.4 | P2 | Dead code | Dashboard page orphaned, links to 404 |
| F-5.1 | P1 | Today | Too much chrome; Apply button |
| F-5.2 | P1 | Today | Message hidden before acting; no edit |
| F-5.3 | P2 | Today | Internal visibility labels |
| F-5.4 | P2 | Today | Custom snooze UX |
| F-5.5 | P2 | Today | "Missing" pill not actionable |
| F-6.1 | P0 | Plans | Builder requires seven concepts |
| F-6.2 | P1 | Plans | Templates as top-level nav |
| F-6.3 | P1 | Plans | Version metadata noise |
| F-6.4 | P2 | Plans | Action Templates silo |
| F-6.5 | P2 | Plans | Audience model duplicated |
| F-7.1 | P1 | Contacts | Add form too long |
| F-7.2 | P1 | Contacts | Nine-card draggable detail |
| F-7.3 | P1 | Contacts | Edge tools as primary header actions |
| F-7.4 | P2 | Contacts | Bulk apply jargon |
| F-7.5 | P2 | Contacts | Relationship state form |
| F-7.6 | P2 | Contacts | Unindexed search |
| F-8.1 | P1 | Quick Add | Regex parser too narrow |
| F-8.2 | P2 | Quick Add | Five destinations |
| F-9.2 | P1 | Settings | Duplicate timezone/quiet-hour stores |
| F-9.3 | P1 | Help | SaaS support model in self-host |
| F-9.4 | P2 | Settings | Locale unused |
| F-9.5 | P2 | Settings | Free-text timezone picker |
| F-10.1 | P0 | Copy | Invented vocabulary |
| F-10.2 | P1 | Copy | Notices explain internals |
| F-10.3 | P2 | Copy | Generic empty states |
| F-11.1 | P1 | CSS | Layered overrides, duplicate DOM |
| F-11.2 | P1 | CSS | Sub-13px text |
| F-11.3 | P2 | CSS | No dark mode |
| F-11.4 | P2 | CSS | `<details>` as menus |
| F-11.5 | P3 | Brand | Generic mark, no icons |
| F-12.1 | P1 | Model | Half the code dormant |
| F-12.2 | P1 | Model | Legacy COPIED/SENT statuses |
| F-12.3 | P2 | Model | Delete-and-recreate on update |
| F-12.4 | P2 | Engine | Full-graph reconciliation |
| F-12.5 | P2 | Engine | Snapshot churn on profile edit |
| F-13.1 | P1 | Security | Demo defaults |
| F-13.2 | P1 | Security | No session rotation |
| F-13.3 | P2 | Security | Long URLs in sms:/mailto: |
| F-13.4 | P2 | Security | No CSP |
| F-13.5 | P2 | Privacy | JSON-only export |
| F-14.1 | P1 | Tests | No content or timezone rendering tests |
| F-14.2 | P2 | Tests | Narrow terminology test |
| F-14.3 | P2 | CI | No Lighthouse/axe |
| F-14.4 | P3 | QA | Device matrix not run |
