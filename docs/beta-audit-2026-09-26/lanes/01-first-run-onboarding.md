# Lane 1 — First-run and onboarding

> Raw lane report from the read-only lane reviewer, kept as written. The reconciled severities, merged IDs and runtime labels are in [../FINDINGS_TABLE.md](../FINDINGS_TABLE.md), which takes precedence where the two differ.

**Lane verdict: GO WITH CONDITIONS.** Reading the code found no BLOCKER on the path from invitation to first follow-up. The prior audit's funnel P1s (FUN-F1 to FUN-F4) are fixed in code:
- The device timezone is detected.
- The session cookie is Lax.
- The invited email is read-only, and the mismatch message names the invited address.
- A text invitee can correct a mistyped email.
- Google and Apple buttons stay hidden while they are unconfigured.

Two HIGH risks would hit a plumber or realtor in week one:
- **ONB-01.** In workspaces set up the recommended way, adding a person with "Save & schedule follow-up" can save a date and schedule nothing. The form, and Today's empty state, still promise the person "will appear on Today".
- **ONB-02.** The recommended (default) onboarding is the longest and most jargon-heavy route. It ends with nobody enrolled, and an evening or weekend start pushes the first follow-up to the next working morning.

Conditions before inviting:
- Fix or relabel ONB-01.
- Get an owner decision on ONB-02.
- Have the lead run one real invite → register → verify → onboarding pass on a phone, with a real inbox. That has never been recorded (see NOT RUN).

## Summary table

| ID | Severity | Label | Title |
|---|---|---|---|
| ONB-01 | HIGH | INFERRED (code path VERIFIED) | "Save & schedule follow-up" can schedule nothing; the follow-up on Add contact is off by default |
| ONB-02 | HIGH | INFERRED (code VERIFIED; owner decision 2026-09-22) | The recommended mega-mix onboarding is the longest, most jargon-dense route to a first follow-up |
| ONB-03 | MEDIUM | VERIFIED | Jargon on first-run screens; glossary absent where invitees first meet it; canonical doc contradicts shipped vocabulary |
| ONB-04 | MEDIUM | INFERRED (code VERIFIED) | Day-one Today says "You're caught up / Nothing due / Add a person" when the first follow-up is later this week |
| ONB-05 | MEDIUM | INFERRED (markup VERIFIED) | Customer name/phone/email fields carry the owner's own autofill tokens |
| ONB-06 | MEDIUM | INFERRED (code VERIFIED) | A specific beta tester can only be invited after they join and confirm the waitlist (or with one of the owner's 3 personal invitations) |
| ONB-07 | LOW | VERIFIED | "Setup is complete — Your follow-ups are on Today" shown with nobody enrolled; "finish later" is never prompted again |
| ONB-08 | LOW | INFERRED (code VERIFIED) | Using an emailed sign-in link before verifying silently removes the password chosen at registration |
| ONB-09 | LOW | VERIFIED | One-person setup has no retry/duplicate guard (prior FUN-F8 residual) |
| ONB-10 | LOW | VERIFIED | First prepared text can say "the estimate from my business"; the starter preview shows raw `{{…}}` placeholders |

## Flows traced

- **F1 Cold visit → waitlist.**
  - `/` (`src/app/page.tsx:13`) → `PublicLanding.tsx:24-25,47`.
  - → `WaitlistForm.tsx:33-40` → `joinWaitlistFormAction` (`waitlist-actions.ts:62-70`) → `processWaitlistSubmission` (`:23-54`) → `requestWaitlistEntry` (`waitlist.ts:24-42`; 24 h token).
  - → email (`waitlist-actions.ts:41-46`) → `/waitlist/confirm` (`page.tsx:12`, POST button) → `confirmWaitlistAction` (`waitlist-actions.ts:72-79`) → `confirmWaitlistEntry` (`waitlist.ts:44-63`) → `/waitlist?confirmed=1` (`waitlist/page.tsx:18,23`).
- **F2 Access grant.** Two sources, no others: `git grep referralAccessInvite.create` finds only these two.
  - Weekly wave `runDueWaitlistWave` (`waitlist.ts:116-140`) or staff selection `inviteSelectedWaitlistEntries` (`:94-110`) → `grantWaitlistAccess` (`:75-92`) → `queueAccessInvitation` (`access-invitation-mail.ts:8-18`), an email with `/register?invite=`.
  - Member invitation: `allocateAccessInvite` (`referral-access.ts:27-86`) creates a follow-up on the member's Today, which they send from their own app (`:69-81`).
- **F3 Register.**
  - `register/page.tsx:24-63` → `registerFormAction` (`auth-actions.ts:531`) → `registerAction` (`:129-206`).
  - → `createBusinessAccount` (`account-provisioning.ts:6-49`) → `claimInvitation` (`referral-access.ts:125-137`).
  - → `deliverVerification` (`auth-actions.ts:115-127`) → `sendVerificationEmail` (`auth-email.ts:23-33`) → `/verify-email/pending?registered=1` (`pending/page.tsx:37`).
- **F4 Verify.** `GET /api/auth/verify-email` (`route.ts:28-89`) → `createSession` → `/onboarding?verified=1`. If the link was already used and the account is verified, it goes to `/login?verified=1` or `/jumps?verified=1` instead (`:55-62,76`).
- **F5 Emailed sign-in link.**
  - `login/page.tsx:97-104` → `requestMagicLinkAction` (`auth-actions.ts:240-271`) → `auth-email.ts:59-71`.
  - → `GET /api/auth/magic` (`route.ts:13-22`; the token moves to a cookie and is not spent) → `/auth/magic` (`page.tsx:17-34`).
  - → `consumeMagicLinkAction` (`auth-actions.ts:274-292`) → `claimMagicLink` (`magic-link.ts:44-67`) → `releaseUnverifiedAccount` (`unverified-account.ts:16-21`).
- **F6 Password reset.** `forgot-password/page.tsx:34-37` → `requestPasswordResetAction` (`auth-actions.ts:410-441`) → `/reset-password` → `resetPasswordAction` (`:443-479`) → `/login?reset=1`.
- **F7 Onboarding, one-person path.**
  - `onboarding/page.tsx:17-49` → `OnboardingForm.tsx:41-89` → `completeOnboardingFormAction` (`onboarding-actions.ts:155-161`) → `completeOnboardingAction` (`:39-131`).
  - Inside that action: `ensureStarterMix` (`starter-mix.ts:5-55`, a DATE_TRIGGERED Mix on the system Follow-up date). One transaction then writes the contact, the JumpDate, the MixAssignment, onboarding step 5 and the timezone. `generateJumps` runs inline (`:129`).
  - → `/jumps?welcome=1&range=all&firstContact=…` (`jumps/page.tsx:395-413`).
- **F8 Onboarding, recommended mega-mix path (the default).**
  - `OnboardingForm.tsx:24,39-40` → `MegaMixSetup.tsx:21-48` → `installMegaMixAction` (`mega-mix-actions.ts:15-34`) → `installMegaMix` (`mega-mix-service.ts:10-75`; MANUAL_START Mixes, nobody enrolled, `:72`).
  - → `/templates/journeys?journey=…&added=1` → `MegaMixLibrary.tsx:29-33` → `/contacts/new?returnTo=/journey?mix=…&start=1` → `createContact` (`contact-actions.ts:281-382`).
  - → `workflowContinuation` (`workflow-continuation.ts:4-11`) → `/journey?…&contactId=` → "Start this Mix" (`WorkflowJourney.tsx:248`) → `workflowCalendarStepTime` (`workflow-scheduling.ts:7-12`) → the follow-up appears on Today.
- **F9 Other onboarding exits.**
  - "Save answers and finish later": `mega-mix-actions.ts:72-87` → `/jumps?setupLater=1`.
  - "Skip for now": `onboarding-actions.ts:133-153` creates a starter Mix and no person → `/jumps?welcome=1`.
  - "Choose individual mixes": `mega-mix-actions.ts:36-55` → `/templates?setup=individual`.
- **F10 First person outside onboarding.**
  - Today's empty state (`jumps/page.tsx:461`) → `/contacts/new` (`page.tsx:22-66`; Mix list `:30-42`) → `ContactForm.tsx:200-212` → `createContact` → `initialFollowUpPayload` (`contact-actions.ts:178-204`).
  - → a JumpDate, plus a MixAssignment only when a Mix is chosen (`:330-354`) → `/contacts/{id}?created=1&dateCreated=1` → `ContactProfile.tsx:201-209`.
  - Follow-ups are generated only from active MixAssignments (`jump-engine.ts:190-201`).
- **F11 Today on day one.** `jumps/page.tsx:117-465`: default range "due" (`:124`), counts (`:163-174`), header (`:425`), "Next 7 days" (`:449`), empty state (`:459-462`).
- **F12 Google and Apple.** `register/page.tsx:49` and `login/page.tsx:89` → `SocialSignInOptions.tsx:7` returns `null` when neither provider is configured (`social-auth.ts:54-60`). Production has neither (`AUDIT_RELEASE_B_2026-09-25.md:83`).

### Time to first value (Q1)

| Path | Screens | Typed fields | Minimum taps | First follow-up visible |
|---|---|---|---|---|
| (a) Email invitation → "Other uses or one follow-up" | invite email → `/register` → pending → inbox → `/onboarding` → Today welcome | 2 at sign-up (name, 12+ char password; email pre-filled read-only) + person's name (phone "recommended") | ≈8: open link, Create free account, open email, Verify email, pick 3rd radio, "I reviewed this plan" box, Prepare my first follow-up, Review | Immediately. Date defaults to today; a past send time is due now. |
| (b) Email invitation → default "A complete mega-mix · Recommended" | … → `/onboarding` → "Your pipeline is ready" → Add contact → Journey start → Today | 2 + first name, phone | ≈12: Review my setup, reviewed box, Add Contractor mega-mix, Add your first customer, Save contact, Start this Mix, Today, Review (+2 for a realtor to change the preselected Contractor pipeline) | Same day only when started Mon–Fri before 17:00; otherwise the next working day at 09:00 |
| (c) Text invitation | as (a) or (b) | + "Confirm email" | same | same |
| (d) Cold visitor | `/` → `/waitlist` → inbox → `/waitlist/confirm` → "You're on the waitlist" → **wait** → invitation email → (a) or (b) | + email | +4 | After an unannounced wait |

**Is there any other path for a cold visitor?** No. Accounts come only from a member's System Mix invitation (`referral-access.ts:63`) or a waitlist grant (`waitlist.ts:79`). Pilot self-registration is off in hosted mode (`register/page.tsx:28-29`, `render.yaml:13` `PILOT_MODE=false`).

**What they are told about timing:** "access is by invitation from a member, or from the waitlist as space opens" (`PublicLanding.tsx:25`). Also "We email invitations in small groups as space opens. We can't promise a date." (`waitlist/page.tsx:20`), with the same wording in `:23`, `PublicLanding.tsx:47`, `register/page.tsx:41`, `faq/page.tsx:30` and the confirmation email (`waitlist-actions.ts:43`). This is honest and consistent. Whether waves actually run depends on the admission ceilings, which default to zero (canonical doc `:135`); Lane 7 checks those.

**Where they get stuck:**
- The waitlist wait.
- A verification email in spam (resend, at most 4 a day).
- The default path's Journey start (ONB-02).
- ONB-01, the first time they add a person outside onboarding.

## Findings

### ONB-01 — "Save & schedule follow-up" can schedule nothing; the follow-up on Add contact is off by default
- Severity: HIGH (not BLOCKER: recovery exists through the post-install "Add your first customer" link, Quick Add, or the contact page's "Start a touchpoint") · Label: INFERRED (code path VERIFIED end to end) · Prior: none
- **What the user experiences:** A plumber sets up the recommended way ("A complete mega-mix", or "Save answers and finish later").
  - Later he opens Today and reads "Nothing due right now — A little hello goes a long way. Add a person and choose a follow-up date; your next action will appear here."
  - He taps **Add a person** and reads "First follow-up — Choose when you want this person to appear on Today."
  - He ticks **Schedule a follow-up now**, picks Tuesday, and taps **Save & schedule follow-up**.
  - Only a saved date is stored; no follow-up is ever created. The contact page says "Nothing scheduled", and on Tuesday Today is empty.
  - In every workspace the checkbox starts unticked. The most natural add ("name, phone, Save contact") schedules nothing either.
- **Reproduction:**
  1. With a new account at 390 px, open `/onboarding`, keep "A complete mega-mix · Recommended", then Review my setup → tick "I've reviewed…" → Add Contractor mega-mix.
  2. Open `/jumps` and tap **Add a person**.
  3. Enter name and phone, tick "Schedule a follow-up now", pick tomorrow. Note that the Mix field reads "You can add a mix later." Tap **Save & schedule follow-up**.
  4. The contact page shows "Nothing scheduled". `/jumps?range=all` never shows a follow-up for this person.
- **Evidence:**
  - `src/app/(app)/jumps/page.tsx:461`: `<EmptyState title="Nothing due right now" description="A little hello goes a long way. Add a person and choose a follow-up date; your next action will appear here." actionHref="/contacts/new" …/>`
  - `src/components/ContactForm.tsx`:
    - `:140`: `useState(Boolean(followUp?.defaultDate))`. The box is unticked unless a Quick Add draft supplies a date (`NewContactForm.tsx:30`).
    - `:201`: "Choose when you want this person to appear on Today."
    - `:210`: when no Mix matches, `<small>You can add a mix later.</small>`.
    - `:303`: "Save & schedule follow-up".
  - `src/app/(app)/contacts/new/page.tsx:30-42`: the only Mixes offered are ACTIVE `triggerMode: "DATE_TRIGGERED"` on the system `follow-up` date type.
  - `src/lib/contact-actions.ts`:
    - `:191`: with no Mix chosen it returns `mixId: null`.
    - `:330-354`: the JumpDate is created, but a MixAssignment only `if (followUp.mixId)`.
  - `src/lib/jump-engine.ts:190-201`: follow-ups come only from `mixAssignment … isActive: true`.
  - A date-based Follow-up Mix comes only from `ensureStarterMix` (`starter-mix.ts:28-29`) or from adding a date-based ready-made Mix. `ensureStarterMix` is called from the one-person path (`onboarding-actions.ts:82`), Skip (`:150`) and the Mixes page's starter action (`starter-mix-actions.ts:79`).
  - None of these create one:
    - Mega-mix install: `mega-mix-service.ts:44-45` sets `triggerMode: "MANUAL_START"`, and `:72` says "No assignment or workflow instance is created by installation."
    - Finish later (`mega-mix-actions.ts:72-87`).
    - Individual mixes (`:36-55`), unless the person later adds a date-based ready-made Mix.
  - `src/components/ContactProfile.tsx:209`: "Nothing scheduled". The recovery control is "Start a touchpoint" (`:142`).
  - No test covers this: `git grep "scheduleFollowUp\|followUpDateTypeId" -- tests e2e` returns nothing.
- **Root cause:** The Add-contact follow-up block depends on a date-triggered Follow-up Mix existing. The recommended onboarding installs only manual-start Journey Mixes, and neither the form nor Today's empty state knows which kind of workspace it is in.
- **Fix direction:** When no date-based Follow-up Mix exists, create a one-time follow-up for the chosen date (as Quick Add already does in `quick-capture.ts:78-94`) or offer "Start ⟨entry Mix⟩". Tick the box by default. In Journey workspaces, point Today's empty state at "Add a customer and start them" (`workflowStartPath`).
- **Runtime check for the lead:** Steps 1–4 above at 390 px. Afterwards, `/jumps?range=all` should show no card for the person, while the contact's "More → Dates" shows the saved Follow-up date.

### ONB-02 — The recommended mega-mix onboarding is the longest, most jargon-dense route to a first follow-up
- Severity: HIGH · Label: INFERRED (code VERIFIED; the owner chose "mega-mix first" on 2026-09-22) · Prior: 09-22 UX audit item 2 (`UI_UX_WORKFLOW_AND_ICON_AUDIT_2026-09-22.md:20`); not in FINDINGS_TABLE
- **What the user experiences:**
  - After verifying, an invited plumber lands on "Jump in the mix. — Choose a connected journey or build your own." with "A complete mega-mix · Recommended" preselected.
  - Before "Review my setup" he faces 18 pre-filled controls: the mega-mix select, communication, spacing, timezone, 7 working-day boxes, 5 time pickers, the appointment buffer and an appointment checkbox.
  - Finishing gives "Your pipeline is ready" with 13 Mixes and nobody in them. The first follow-up takes four more screens (Time to first value table, path b).
  - Started after 17:00 or at a weekend, the first follow-up lands on the next working day at 09:00, so Today is empty on day one (ONB-04).
  - A realtor invited by a member, whose invitation carries no scenario, gets the **Contractor** pipeline preselected ("New project inquiry", "Site visit follow-through").
  - Meanwhile the waitlist invitation email and `/register` promised "After verification, start with one person and review every follow-up before sending." The one-person path is the third radio, "Other uses or one follow-up".
- **Reproduction:** At 390 px, with timezone America/Denver and a local time after 17:00, run path (b) from a fresh invited account. Count screens and taps, and note Today after "Start this Mix". Compare with path (a).
- **Evidence:**
  - `OnboardingForm.tsx:24`: default `setupMode` is `"journey"`. `:39`: "A complete mega-mix · Recommended … Your whole pipeline on day one". The one-person option is labelled "Other uses or one follow-up".
  - `JourneyPreferenceFields.tsx:15-31` holds the controls. `MegaMixSetup.tsx:29,36,41-44` has the select, "Review my setup", the required reviewed box and "Add … mega-mix".
  - `mega-mix-service.ts:72`: nobody is enrolled. `MegaMixLibrary.tsx:29-30`: "Your pipeline is ready … Nothing is sent until you start someone."
  - `workflow-scheduling.ts:9-11` computes `due = max(planned, readyAt)` and then applies `nextJourneyAvailability`. Defaults are Mon–Fri, 540–1020 minutes (`journey-preferences.ts:15`), and `journey-availability.ts:17-18` moves anything after hours to the next working day at `workStart`.
  - By contrast, the one-person path keeps a past send time as due now (`jump-engine.ts:512-523`; no working-hours rule without Journey preferences).
  - `onboarding/page.tsx:46` passes `industry = profile.industry ?? scenario?.businessType ?? null` (null for a new member-invited account). `OnboardingForm.tsx:40` then calls `suggestedMegaMix(industry, scenarioId)` (`mega-mixes.ts:99-101`), which returns `"contractor"`. Member invitations carry no scenario (`referral-access.ts:63-66`).
  - Invitation copy: `waitlist.ts:86-87` and `register/page.tsx:47` say "After verification, start with one person…".
  - Canonical doc `:34`: "create an account, identify their business, add one person, and see a useful prepared follow-up in minutes from a phone".
  - Owner decision: `UI_UX_WORKFLOW_AND_ICON_IMPLEMENTATION_2026-09-22.md:8`, "Onboarding: stays mega-mix first."
  - The pipeline has 13 Mixes (`e2e/mega-mixes.spec.ts:40`). No test follows the default path to a follow-up on Today (see Test coverage).
- **Root cause:** A product decision: the whole pipeline comes first, and people are started later by an explicit step.
- **Fix direction (owner):** For the beta, recommend "Start with one person" and keep the mega-mix one tap away. Or keep mega-mix first but take the first customer inside onboarding, start the entry Mix in the same submit, and ask the business type before preselecting a pipeline.
- **Runtime check for the lead:** As in Reproduction. Also a member-invited account: `/onboarding` shows "Your mega-mix: Contractor" selected.

### ONB-03 — Jargon on first-run screens; glossary absent where invitees first meet it; canonical doc contradicts shipped vocabulary
- Severity: MEDIUM · Label: VERIFIED (strings) · Prior: 09-22 UX audit item 1; `PRODUCT_AUDIT_2026-09-04.md` F-10.1
- **What the user experiences:** Invitees arrive straight at `/register` from an email or text. They never see the homepage definition ("A Mix is a reusable follow-up plan. Each Beat is one scheduled message or call reminder…", `PublicLanding.tsx:32`). Their first product screens say:

| Screen | Quote (file:line) |
|---|---|
| Onboarding | "Jump in the mix." / "Choose a connected journey or build your own." (`onboarding/page.tsx:41-42`) |
| Onboarding | "A complete mega-mix · Recommended" / "Your whole pipeline on day one…" / "Choose individual mixes" / "Build your journey one Mix at a time." (`OnboardingForm.tsx:39`) |
| Onboarding | "We'll suggest mixes that fit your work." (`OnboardingForm.tsx:48`) |
| Onboarding | "No Mix is installed and no person is enrolled." (`MegaMixSetup.tsx:25`) |
| Onboarding | "Your mega-mix" … "Includes {n} connected mixes." (`MegaMixSetup.tsx:29`) |
| Onboarding | "Preview the {name} journey" / "Your {n} connected mixes…" / "I've reviewed my journey and preferences." / "Add {name} mega-mix" (`MegaMixSetup.tsx:41-44`) |
| Onboarding | "The recommended mix uses texts, emails and calls. Your preference sets message types in new mega-mixes." (`JourneyPreferenceFields.tsx:16`) |
| Onboarding | "A connected starting point" / "{n} mixes · {n} Beats · Editable connections" / "continue along a connected path … Paths labeled Follow-up finished…" (`MegaMixPreview.tsx:9,11,13`) |
| Setup complete | "…the Marketplace has more ready-made mixes to add." / "Browse the Marketplace" (`onboarding/page.tsx:26,28`) |
| After install | "Your pipeline is ready" / "…every Beat already written and connected…" / "Open my Journey" / "Its connected paths carry that person forward…" (`MegaMixLibrary.tsx:29-32`) |
| Add contact (from pipeline) | "Save this person to return to your selected Mix. You will choose when to start it." (`contacts/new/page.tsx:52`) |
| Journey start | "Start for someone" / "Work label (optional)" / "Starts separate work using your sending preferences." / "Start this Mix" (`WorkflowJourney.tsx:247-248`) |
| Add contact | "Mix" / "Just save the date" / "You can add a mix later." / "Start a matching mix if one is available." (`ContactForm.tsx:204,210`) |
| Contact page | "Start a touchpoint" (`ContactProfile.tsx:142`); "Loop · repeat this date" (`:248,253`); "Keep this connection in the mix with a series of thoughtful beats." (`:257`) |
| Today | "Skip beat", "Stop mix…" (`jumps/page.tsx:385`); "Find a person, Mix, or reason" (`:427`) |
| Navigation | "Mixes", "Journey" (`Nav.tsx:11-12`) |
| Waitlist confirm | "…your turn to start mixing." (`waitlist/confirm/page.tsx:10`) |

  The plain-word glossary exists: `BrandTermsHelp.tsx:6-12`, "Mix: A ready-to-go series of follow-ups…". It appears only on `/mixes`, `/mixes/mega`, `/marketplace` and Journey (`git grep BrandTermsHelp`). It is missing from `/onboarding`, the post-install page and Today.
- **Documented conflict (owner question):**
  - `docs/CANONICAL_PRODUCT_DECISIONS.md`:
    - `:8` says "When code, copy, tests, or another document disagrees with this file, this file wins."
    - `:40-50` lists the customer words Today / Follow-up / **Plan** / **Ready-made plan** / Tag / **Saved date** / Note. It adds: "'Jump in the Mix' is the brand, not a noun for work. Internal database names such as `Jump`, `Mix` … must not leak into customer copy."
    - `:54-59` gives the navigation as "Today, Contacts, **Plans**, More".
  - The shipped product, the design export (`docs/design/jump-in-the-mix-designs/screens/Landing.html`: "A Mix is a reusable follow-up plan. Each Beat is…") and the owner's decision of 2026-09-22 (`UI_UX_WORKFLOW_AND_ICON_IMPLEMENTATION_2026-09-22.md:9`: "Mix, Beat, Mega-mix, Journey and Today stay as the brand names") all use Mix/Beat/Mega-mix/Journey, with "Mixes" in the navigation (`Nav.tsx:11`) and "Ready-made mixes" (`AppShell.tsx:60`).
  - The canonical doc was never updated, so by its own rule it still "wins".
  - The same doc is stale in two more places (other lanes): "five lifetime invitations" (`:12`) against `REFERRAL_INVITE_LIMIT = 3` (`system-mix.ts:1`) and "three" in the FAQ (`faq/page.tsx:30`); and "SameSite=Strict, a 14-day maximum" (`:109`) against `sameSite: "lax"` (`auth.ts:100`) with a 90-day cap (`env.ts:61`).
  - "Jump" appears to users only as the brand, the brand used as a verb ("Jump in the mix.", "start mixing", "Stay in the mix", `persona-mixes.ts:41,79,124,162,201`) and the `/jumps` address.
- **Fix direction:** Put the existing ⓘ glossary on `/onboarding`, the post-install page and Today. Use plain labels for the three setup choices, for example "Full set of follow-up plans for a contractor" and "One follow-up for one person". The owner should then either update the canonical doc's Product language and Navigation sections or order a plain-language pass.
- **Runtime check for the lead:** `/onboarding` at 390 px has no ⓘ "What these words mean" control; `/mixes` has one.

### ONB-04 — Day-one Today says "You're caught up / Nothing due / Add a person" when the first follow-up is later this week
- Severity: MEDIUM · Label: INFERRED (code VERIFIED) · Prior: none (`TODAY_EMPTY_STATE_FIX_2026-09-25` fixed only the target size)
- **What the user experiences:** This happens in two cases: an evening or weekend start on the mega-mix path (ONB-02), or a future "Follow up on" date on the one-person path.
  - Plain `/jumps` shows the header "You're caught up." and the card "Nothing due right now … Add a person and choose a follow-up date". The "Next 7 days (1)" group is collapsed.
  - The card sends them to add someone else, which in mega-mix workspaces leads straight into ONB-01.
  - Conversely, right after onboarding with a date three days out, the welcome says "Your first follow-up for X is ready. Tap Review to begin."
- **Reproduction:** Complete the one-person path with "Follow up on" three days ahead and note the welcome. Then open `/jumps` with no parameters.
- **Evidence:** `jumps/page.tsx`:
  - `:124`: the default range is `"due"`.
  - `:169-170`: `pendingCount` and `attentionCount` cover the same due-by-tonight rows, so `upcomingCount = pendingCount - attentionCount` is 0 (`:248`).
  - `:425`: the header shows the upcoming count only through `upcomingCount + workflowAttention.futureTotal`. `futureTotal` counts only open callback commitments (`workflow-attention.ts:44-46`), not follow-ups, so the header reads "You're caught up."
  - `:449`: the group opens only if `upcoming.length`, which is empty in the "due" range.
  - `:459-461`: the empty state.
  - `:398,402`: the welcome text ("is ready" / "Tap Review to begin"). `e2e/core-flows.spec.ts:166-176` asserts "is ready." for a date three days out.
- **Fix direction:** When `dueThisWeekCount > 0`, show "Next: ⟨name⟩ on ⟨day⟩" in the header and empty state with a link. Word the welcome as "scheduled for ⟨date⟩" when the date is not today.
- **Runtime check for the lead:** As in Reproduction, at 390 px.

### ONB-05 — Customer name/phone/email fields carry the owner's own autofill tokens
- Severity: MEDIUM · Label: INFERRED (markup VERIFIED) · Prior: none
- **What the user experiences:** On the phone, the customer's Name field suggests the owner's own name and card. Accepting one suggestion can fill the owner's own phone and email into the customer record, so the first follow-up would text the owner himself (visible only at review).
- **Evidence:**
  - `OnboardingForm.tsx:77`: `id="contactName" … autoComplete="name"`. `:78`: `autoComplete="tel"`. `:79`: `autoComplete="email"`.
  - `ContactForm.tsx:185`: `autoComplete="given-name"`. `:186`: `"family-name"`. `:190`: `autoComplete={index ? "off" : "tel"}`. `:192`: the same pattern with `"email"`.
  - Autofill tokens describe the person filling in the form, who here is the owner. The `inputMode="tel"`, `type="email"` and `inputMode="email"` settings are correct.
- **Fix direction:** Use `autoComplete="off"` on third-party (customer) fields and keep `type`/`inputMode`.
- **Runtime check for the lead:** Android Chrome with a saved address profile: `/onboarding` → "Other uses or one follow-up" → tap Name. iOS Safari: check the keyboard AutoFill bar.

### ONB-06 — A specific beta tester can only be invited after they join and confirm the waitlist (or with one of the owner's 3 personal invitations)
- Severity: MEDIUM · Label: INFERRED (code VERIFIED) · Prior: none (admission capacity and operations are Lane 7)
- **What the user experiences:** The owner tells a plumber "I'll invite you". Unless the owner spends one of three lifetime personal invitations, sent by hand from his own phone through Today, the plumber must:
  1. Go to the site and join the waitlist.
  2. Find and confirm the first email.
  3. Wait, having been told "we can't promise a date", until staff select him.
  4. Receive the invitation email, then the verification email.

  That is three emails before the first product screen, and it needs coordination.
- **Evidence:**
  - Accounts can be created only from `referral-access.ts:63`, capped by `REFERRAL_INVITE_LIMIT = 3` (`system-mix.ts:1`, `referral-access.ts:60-61`), or from `waitlist.ts:79`.
  - Staff can grant only `status: "WAITING", verifiedAt: { not: null }` entries (`waitlist.ts:102`). `access-admin-actions.ts:14-50` can only revoke or retry.
  - Canonical doc `:12` says "Administrators may send additional selected invitations" and promises five member invitations.
- **Fix direction:** A staff "invite this email" action through the same admission checks (owner and Lane 7), or a written beta procedure ("join the waitlist, confirm, then I'll select you").
- **Runtime check for the lead:** `/admin/waitlist` and `/admin/access` have no free-form invite. `/mixes/system` shows "3 of 3 invitations remaining".

### ONB-07 — "Setup is complete — Your follow-ups are on Today" shown with nobody enrolled; "finish later" is never prompted again
- Severity: LOW · Label: VERIFIED · Prior: FUN-F8 (residual)
- **Evidence:**
  - `onboarding/page.tsx:21-30` shows "Your follow-ups are on Today, and the Marketplace has more ready-made mixes to add." whenever `onboardingStep >= 5`. The mega-mix install (`mega-mix-service.ts:30`) and the individual path (`mega-mix-actions.ts:47`) set step 5 with nobody enrolled. The page's actions are "Open Today" and "Browse the Marketplace", not "Add your first customer".
  - "Finish later" sets `onboardingDone: true, onboardingStep: 1` (`mega-mix-actions.ts:82`), so sign-in lands on `/jumps` (`auth-actions.ts:237`). The only reminder is the one-time `?setupLater=1` notice (`jumps/page.tsx:411`).
- **Fix direction:** With nobody enrolled, offer "Add your first customer". While `onboardingStep < 5`, show a persistent "Finish setup" card on Today.

### ONB-08 — Using an emailed sign-in link before verifying silently removes the password chosen at registration
- Severity: LOW · Label: INFERRED (code VERIFIED) · Prior: intentional per Release B decision 7
- **What the user experiences:** He registers with a password but cannot find the verification email, so he uses "Email me a secure sign-in link". He is signed in and verified. Next time, on another device, his password gets "The email or password is incorrect."
- **Evidence:**
  - `magic-link.ts:63` calls `releaseUnverifiedAccount`, and `unverified-account.ts:17` sets `passwordHash: null`. No notice follows (destination `/onboarding`, `magic-link.ts:65`).
  - `auth-actions.ts:223-224` then answers "The email or password is incorrect."
  - Recovery exists at Account → Security "Set a password" (`account/page.tsx:63`) or through Forgot password.
- **Fix direction:** Show a one-time notice on the landing page: "Your earlier password was removed because this email wasn't confirmed yet. Set one in Account → Security."
- **Runtime check for the lead:** Register from an invite without verifying → `/login` → Email sign-in link → Continue → sign out → sign in with the original password.

### ONB-09 — One-person setup has no retry/duplicate guard (prior FUN-F8 residual)
- Severity: LOW · Label: VERIFIED · Prior: FUN-F8
- **Evidence:**
  - `onboarding-actions.ts:83-96` creates a contact with a random id, with no duplicate lookup and no idempotency key. The assignment key includes the new contact id (`:113`).
  - After a lost response, `ActionForm.tsx:13` says "We couldn't confirm this save…". A second tap creates a second person and a second follow-up. "Run setup again" (`onboarding/page.tsx:29`) does the same.
  - Phone and email uniqueness is per contact only (`prisma/migrations/20260715000000_existing_mvp_baseline/migration.sql:689,695`).
- **Fix direction:** Reuse the Add-contact receipt pattern (`contact-actions.ts:284-289`).

### ONB-10 — First prepared text can say "the estimate from my business"; the starter preview shows raw `{{…}}` placeholders
- Severity: LOW · Label: VERIFIED · Prior: none
- **Evidence:**
  - The default plumber starter is "Follow up about an estimate", which maps to `plan_home_estimate`: "just checking that you received the estimate from {{My Company}}" (`vertical-plan-library.ts:39`).
  - The business name is optional and inside a collapsed disclosure (`OnboardingForm.tsx:51-56`). The renderer falls back to `"my business"` (`jump-render.ts:103`).
  - `StarterPreview.tsx:27` prints `step.body` raw, braces and all. `:28` adds "Names and signatures fill from your details."
- **Fix direction:** Render the preview with the owner's values and "[customer's first name]". Fall back to the owner's name instead of "my business".

### Answers to Q3, Q5, Q6, Q7, Q8

**Q3, closing the tab partway:**

| Step | What persists | On return |
|---|---|---|
| Register form | Nothing | The invite link still works |
| After "Create free account" | User, workspace and profile `{}`; invite `acceptedAt` (consumed); timezone UTC (`account-provisioning.ts:15-47`, `referral-access.ts:133`) | The invite link says "unavailable … sign in below". Sign-in goes to `/verify-email/pending` (`auth-actions.ts:227-228`) with resend (4 a day; "A new link replaces older ones", `pending/page.tsx:38`) |
| Verified, onboarding not done | Verified account | Sign-in goes to `/onboarding` (`auth-actions.ts:237`) with a fresh form |
| One-person path, not submitted | Only contacts imported in the other tab | Everything else is retyped; nothing half-created (one transaction, `onboarding-actions.ts:84-128`) |
| Mega-mix, "finish later" | Journey preferences and draft choice (`mega-mix-actions.ts:80`) | The draft is restored on `/onboarding`, but sign-in goes to Today (ONB-07) |
| Mega-mix installed, nobody started | 13 Mixes | Today is empty → ONB-01 |

There is no per-step `onboardingStep` persistence: the only values are 0, 1 and 5 (`git grep onboardingStep`).

**Q5, empty states on first run:**
- Today: ONB-04, with ONB-01 behind its button.
- Contacts: "Start with one person — Make time for your circle. Add a customer, a friend…" leads to Add a person, the ONB-01 form (`ContactsBulkWorkspace.tsx:220`).
- Mixes: "Create your first mix — Choose a ready-made mix or create your own." (`mixes/page.tsx:76`). This is not a business action.
- Calendar: only "No time reserved." per day, with no page-level guidance (`calendar/page.tsx:82`; desktop navigation and More only).

**Q6, what setup creates:**
- Registration creates the workspace, three tags ("New connections", "Keep in touch", "Introductions"), preferences in UTC, and notifications off (`account-provisioning.ts:26-47`).
- The one-person path creates the starter plan, the person, the saved date, the assignment and follow-ups, generated inline.
- Skip creates a starter plan only.
- A mega-mix install creates 11–13 Mixes and no people.
- There is no sample follow-up and no system date type per account (the Follow-up type is global, seeded at deploy: `install-application-catalog.ts:9`, `render.yaml` `db:seed:catalog`).
- The first follow-up is due on the chosen date (default today in the device timezone: `OnboardingForm.tsx:82`, `LocalDateInput.tsx:9-13`) at the starter's time (mostly 10:00). A mega-mix start follows the working-hours rule in ONB-02.

**Q7, phone ergonomics:**
- `/register`: 3–4 fields, correct `autoComplete` values (name, email, new-password), a Show/Hide control on the password (`PasswordInput.tsx:6`), and a 12-character minimum (`password-policy.ts:2`).
- Pending page: email fields use `inputMode="email"`.
- One-person path: `inputMode="tel"` and email types, a native date picker and native selects, and the primary button at the bottom. Wrong autofill tokens (ONB-05).
- Mega-mix path: 18 controls including five native time pickers (ONB-02).
- On iPhone the Contact Picker is unavailable. Onboarding says so honestly and offers CSV/vCard import or typing (`DeviceContactQuickAdd.tsx:176`).

**Q8, promises against behaviour:**
- False or misleading: "appear on Today" and "Save & schedule follow-up" (ONB-01); "start with one person" (ONB-02); "Your follow-ups are on Today" (ONB-07); "is ready. Tap Review to begin." for a future date (ONB-04).
- True: "Free accounts, no card" (no billing code; `git grep -i stripe` finds nothing in `src`); "You review, edit, and send" (manual by default); "Practice with a fictional contact. Nothing is sent"; "This step sends nothing."

## What holds up

- **Invitation gate and addresses:**
  - The invited email is shown read-only with "Invitation sent to …" (`register/page.tsx:53-55`), and a mismatch names the address (`auth-actions.ts:154-156`).
  - Text invitations ask for the email twice (`:157`, `register/page.tsx:56`). A mistyped text-invite email can be corrected with the password (`auth-actions.ts:344-408`; `pending/page.tsx:46-56`).
  - A used or revoked link explains what to do next (`register/page.tsx:40-43`). A paused redemption keeps the invitation (`:44-45`).
- The registration limit counts only valid new sign-ups and shows human durations (`auth-actions.ts:55-65,162-163`). The first screen says "We sent a verification link…" (`pending/page.tsx:37`).
- A verification link that was already used on a verified account sends the person to sign in with a notice instead of an error (`verify-email/route.ts:55-62,76`). Onboarding and Today show "Your email is verified." (`onboarding/page.tsx:44`, `jumps/page.tsx:420`).
- **Emailed sign-in links:** the emailed link never spends the token; the person confirms on `/auth/magic`, and a different browser gets a clear "open it again on this device" page (`api/auth/magic/route.ts:13-22`; `auth/magic/page.tsx:22-33`).
- The session cookie is Lax, with sliding renewal up to a 90-day cap (`auth.ts:100`, `env.ts:61`).
- The device timezone is adopted during onboarding while the account still holds UTC, on both paths, and the default date follows it (`OnboardingForm.tsx:82`, `MegaMixSetup.tsx:34`, `TimezonePicker.tsx:74-81`, `LocalDateInput.tsx:9-13`). FUN-F1 is fixed.
- Google and Apple are hidden unless configured (`SocialSignInOptions.tsx:7`). Signed-in visitors get "Open Today" and skip `/login` (`PublicHeader.tsx:27`, `login/page.tsx:43-61`).
- The one-person path is atomic, with the follow-up generated inline. The welcome adapts when a phone or email is missing (`onboarding-actions.ts:84-129`; `jumps/page.tsx:395-406`). An installed app imports on the same screen (`OnboardingForm.tsx:29-31,71-72`).
- **Waitlist:** double opt-in through a POST button, a heading for each state, the daily limit shown, and no date promised (`waitlist/page.tsx:18-23`; `WaitlistForm.tsx:25-40`).
- **Access story:** the homepage, FAQ, `/register` and `/waitlist` tell the same access story.
- **Other ways to add a person:** Quick Add creates a one-time follow-up with no Mix needed (`quick-capture.ts:78-94`). Add contact is idempotent for each opened form (`ContactForm.tsx:85-91`; `contact-actions.ts:284-289`).

## Test coverage for this lane

- **Registration by invitation:**
  - e2e: `e2e/registration.spec.ts:56-171` (email fixed, text confirm, wrong-email fix, Google/Apple with placeholder credentials).
  - unit/integration: `tests/register-action.test.ts`, `tests/referral-access*.test.ts`, `tests/sign-up-funnel.test.ts`, the latter checking source text only.
- **Verification:** `tests/verify-email-route.test.ts`, `tests/verify-email-redirect.test.ts`, `e2e/session-cookie-cross-site.spec.ts`.
- **Emailed sign-in links:** `e2e/registration.spec.ts:173-215`, `tests/magic-link-release.integration.test.ts`, `tests/magic-login-return.test.ts`.
- **Waitlist:** `e2e/waitlist.spec.ts`, `e2e/homepage-conversion.spec.ts:146`, `tests/waitlist*.test.ts`.
- **One-person onboarding:** `e2e/core-flows.spec.ts:122-197`, starting from a user seeded straight into the database as verified. Also `e2e/onboarding-invitations.spec.ts:29`.
- **Mega-mix onboarding:** install only. `e2e/mega-mixes.spec.ts:65-93`, `e2e/onboarding-journey-preferences.spec.ts:25`, `tests/mega-mix-installation.integration.test.ts`.
- **Today empty state:** `e2e/a2-css-checks.spec.ts:112`, target size only.

**Critical flows with no test:**
- invitation → register → verify → onboarding → first follow-up, as one chain;
- the default mega-mix path from "Add your first customer" to a follow-up on Today;
- Add contact with "Schedule a follow-up now", in any workspace (ONB-01);
- Today on day one when the only follow-up is later this week (ONB-04);
- an onboarding retry after a lost response (ONB-09);
- the welcome for a future-dated first follow-up (the current test asserts the misleading "is ready").

## NOT RUN

- **Real email.** Delivery and spam placement of the waitlist confirmation, invitation, verification and sign-in emails on production, in Gmail, Outlook/M365 (Safe Links) and iCloud. The release records show synthetic owners and minted tokens, never a real inbox. This needs a real invitation to a real inbox, run by the lead.
- **Admission ceilings.** Whether production ceilings allow waves or staff selection; they default to 0. This is Lane 7. If they are 0, "as space opens" never happens for cold visitors.
- **Devices.** In-app browsers (Gmail and Outlook on iOS) opening verification and sign-in links, including cookie isolation from Safari and the installed app. Autofill behaviour (ONB-05). The first review opening the SMS app on a physical iPhone or Android. All of these need devices.
- **First load after idle.** Render cold-start latency on the first visit from an invitation link. Lead or ops.
- **Layout.** Rendered layout at each width is Lane 8.
- **Marketing files.** I opened the untracked owner file `Jump_in_the_Mix_Brand_price_freatures.md`: I read the first 30 lines and grepped it for onboarding and pricing terms. It is a proposed catalog, not a claim. I did **not** open the two Joanna Wiebe files. In the repository I read `assets/README.md` and the relevant parts of the contractor and real-estate ICPs: "impatient with unnecessary setup", "dislikes … software jargon", and "Onboarding should get her to a meaningful follow-up quickly".

## Questions for Kevin

1. For beta testers, keep "A complete mega-mix · Recommended" as the default (your 09-22 decision), or recommend "one person, one follow-up" and keep the mega-mix one tap away? (ONB-02)
2. Is the 09-22 vocabulary (Mix/Beat/Mega-mix/Journey) current? If yes, `CANONICAL_PRODUCT_DECISIONS.md` Product language and Navigation must change, since the doc says it "wins". If no, the first-run screens need a plain-language pass. (ONB-03)
3. Member invitations: three (code, FAQ, System Mix page) or five (canonical doc `:12`)?
4. Should staff be able to invite a named email directly for the beta, without the waitlist step? (ONB-06)
5. Plumbers/HVAC and insurance are named launch audiences (canonical doc `:24`) but have no profession page, and `/for/contractors` is written for painters (`persona-mixes.ts:154-191`, `marketing-scenarios.ts:7`). Which pages should exist for the beta?
6. Stripe is planned (canonical doc `:85`). Should beta testers be told whether "Free accounts, no card" continues after the beta?
