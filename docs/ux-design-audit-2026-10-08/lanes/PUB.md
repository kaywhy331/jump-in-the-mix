> Lane report PUB (Public pages, sign-in, onboarding, customer-facing pages) of the [UX, design and layout audit](../../UX_DESIGN_AUDIT_2026-10-08.md), 2026-10-08, commit `f23db11`. Written read-only by a review lane and consolidated by the lead auditor. Paths under `<captures>/` refer to the private local capture set (not committed; see [README](../README.md)); a selection is in [`../captures/`](../captures/). Severity adjustments made at consolidation are listed in [FINDINGS.md](../FINDINGS.md).

# Lane PUB — public pages, sign-in, invitation → onboarding, and the owner's customer pages

Audited code: `origin/main` = `f23db11` (worktree the repository). Paths below: screenshots are relative to `<captures>` (`<captures>`). My crops are in `<captures>/lanes/crops/PUB/`. Code is cited as `src/...:line`. Heights are in CSS px. A phone screen is 844 px (390×844).

## 1. Lane summary

**Verdict.** The public pages are tidy, honest and match the export's order (JITM-07 §2.24–§2.25). On a phone, though, they make visitors scroll and read too much before the demo and the waitlist. Sign-in, registration and the waitlist are short, one-screen forms. The weak points are the step after them and the pages the owner's customers see:
- **Onboarding** is 4,435 px (5.3 phone screens). Its only required inputs (the person's name and a review tick) sit on screens 3 and 5.
- **Fix-first defect: the private review page's star rating is reversed on screen** (verified in code; one tap on a real page will confirm it). A customer who taps the fifth star records 1 out of 5. That corrupts the owner's feedback data.
- **False claim on three public pages.** Since D31 the demo opens the visitor's own app, but these pages still say "The demo doesn't send anything or open another app."

**Changes that would most improve the workflow**
1. Fix the rating order, and check the ratings stored since 2026-09-04 (PUB-01).
2. Replace the three stale demo claims (PUB-02).
3. Rebuild the one-person onboarding as a two-screen phone form, in this order:
   - business type and name;
   - the person;
   - one of 4–5 distinct reasons;
   - the date;
   - a filled-in preview with real dates;
   - a button named "Start Jordan's follow-up" in place of the tick.

   The Mega-Mix options become a secondary link (PUB-03…PUB-08, S1).
4. On the first Today, make "Review Jordan's follow-up" the only primary action. Show the invitation strip, the More badge and the "Filter 1" chip only later (PUB-07, S2).
5. On the phone landing page, cut the six-line disclaimer to one line so the demo's draft and "Open text" fit on the first screen. Offer the waitlist after the first recorded Beat (PUB-13, S3).

### 1a. The two questions, answered

**(1) Does the homepage or a profession page move a small-business visitor from situation → demo → waitlist efficiently on a phone?**

Partly.

- **Situation.** Clear on screen 1. Each page leads with a recognizable situation, such as "The estimate went out. Don't let the follow-up disappear."
- **Demo.** Starts at the bottom of screen 1. On `/for/contractors` its draft and its "Open text" button sit at about 1,466 px (screen 2). They come after a 55-word, six-line note under the buttons and a second disclaimer at the top of the demo card (`<captures>/lanes/crops/PUB/for-contractors-full-00.png`, `-01.png`).
- **Waitlist inside the demo.** Offered only after all three Beats are recorded. On a phone that means three trips out to the Messages, Mail and Phone apps (`src/components/ProductDemo.tsx:116`).
- **Waitlist band.** Starts at about 4,060 px (screen 5). Two profession navigations come before it: the "Mixes for:" chips and a 12-row directory in which 7 rows are not links. The page is 5,124 px tall in all (`-04.png`, `-05.png`).
- **Fastest path.** The hero's "Join the waitlist" button: one tap to `/waitlist`, then one email field.

So a visitor who already wants in gets through quickly. A visitor who tries the demo first does not. Laptop is close to fine: the demo's "Open text" sits right at the 900 px fold and the band starts at about 2,600 px. Tablet works, but the sections below the hero lose the hero's side margin (PUB-27).

**(2) Is the invited person's path (link → register → verify → onboarding → first follow-up) as short and clear as it can be?**

No. Registration and the verification screen are already lean. Onboarding and the first Today are where the length and the competing choices are.

| Step | Screen | Length | Typed input | Choices | App switch |
|---|---|---|---|---|---|
| 1 | Owner's invitation (email or text) | — | tap link | — | mail/SMS → browser |
| 2 | `/register?invite=…` (`shots/flow-reg-1-register-full.png`) | 943 px (1.1 screens) | name, password (email prefilled, read-only) | 0 | — |
| 3 | `/verify-email/pending` (`shots/flow-onb-1-first.png`) | 1 screen | 0 (but the filled button is "Send another verification link") | 0 | browser → mail |
| 4 | Verification email | — | tap "Verify email" | — | mail → browser (signs in, lands on `/onboarding?verified=1`) |
| 5 | `/onboarding` (`shots/flow-onb-3-onboarding-full.png`) | **4,435 px (5.3 screens)**; it was 2,768 px at the 2026-09-18 audit | 1 required (person's name, at about 2,300 px) + a required tick (at about 4,100 px); phone "recommended · optional" | 7 choices with defaults (see the list below) | import opens a new tab if used |
| 6 | First Today (`shots/flow-onb-5-today-welcome-full.png`) | 1 screen | — | invitation strip, "Filter 1" and Review all compete | — |
| 7 | Review sheet → Open text | — | — | — | browser → Messages |

The seven onboarding choices, each with a default:
- starting point (3 cards);
- uses (3 checkboxes);
- type of business (9 options);
- an "Optional business details" disclosure;
- the first follow-up (9 options, but only 4 different starters);
- the date;
- the timezone.

**Total:** about 8.4 phone screens of scrolling before the review sheet, 3–4 app switches, and 3 required typed fields. The one-person path could fit in about 2 phone screens with 4 choices; S1 describes how.

## 2. Page and overlay verdicts

### Public header and Explore menu (all `PublicHeader` pages)
- **Purpose:** get a visitor to the demo, the waitlist or Sign in.
- **Works well:** the phone header meets JITM-07 §2.25. It has the wordmark, a short "Join" whose accessible name is "Join the waitlist", and a 44 px Explore (•••) menu. Desktop shows Templates, Questions, the appearance switch, Sign in and Join the waitlist (`shots/sweep/laptop-light-public/home.png`).
- **In the way:**
  - The contact, privacy, terms and security pages use a different header: logo, appearance switch and Sign in, with no Join and no Explore (`src/components/PublicDocument.tsx:16`; `<captures>/lanes/crops/PUB/sheet-docs.png`).
  - The open Explore menu was not captured.
- **Verdict:** Good, fix details.
- **Structure:** keep it. Give `PublicDocument` the same `PublicHeader`.

### Hero (homepage and the five profession pages)
- **Purpose:** name the visitor's situation, then offer the demo or the waitlist.
- **Works well:**
  - One recognizable situation per profession (JITM-02 §4).
  - A value-phrased demo button next to a literal "Join the waitlist" (JITM-04 §2.30).
  - Contrast is fine. The light hero note is 4.81:1 and the dark muted text 5.88:1, computed from the token values.
- **In the way:**
  - The note under the buttons is 55 words and 6 lines on a phone (`src/components/PublicLanding.tsx:25`). JITM-04 §2.30 asks for one line that answers the nearest worry.
  - The demo card adds a second disclaimer (`src/components/ProductDemo.tsx:82`).
  - Profession headings run to 4 lines on a phone (`<captures>/lanes/crops/PUB/sheet-personas.png`).
  - Together these push the demo's draft below the first screen (PUB-13).
- **Verdict:** Good, fix details.
- **Structure:** a one-line note: fictional contact, drafts open in your own app, plus the access facts (JITM-02 §2.18). Drop the demo card's repeat.

### Interactive demo ("Try a 3-step Mix")
- **Purpose:** let a visitor feel the core loop (review → open own app → record what happened) with a fictional contact.
- **Works well:**
  - Honest handoff copy: "Opens your messages app with this draft." and "Opening an app does not send it. Record what happened."
  - Undo is explained.
  - The draft is in Newsreader.
  - Profession pages preselect their own situations.
  - Desktop shows a QR code for text and call Beats.
- **In the way:**
  - The waitlist appears only after all three Beats (`src/components/ProductDemo.tsx:116`).
  - The heading uses "Mix" before the page defines it (PUB-22).
  - Status text is 12 px (PUB-21).
  - "Try the demo" focuses the textarea, which probably raises the keyboard on Android (PUB-20).
  - On a 1440×900 laptop, "Open text" sits at the fold and the hint and Reset fall below it (`shots/sweep/laptop-light-public/home.png`).
- **Verdict:** Good, fix details.
- **Structure:**
  - Put the draft and its main action first. The Situation select goes under the draft, or becomes chips.
  - After the first recorded Beat, show a secondary "Join the waitlist" beside "Review email · tomorrow".

### "Mixes for:" choices and the profession directory
- **Purpose:** send visitors to their own trade's page.
- **Works well:** the current page is highlighted, and the link names are the professions.
- **In the way:**
  - Two navigations lead to the same five pages.
  - On a phone the directory is 12 rows, 7 of them not links ("Coaches & trainers" … "And more"). That adds about 600 px before the waitlist band (`<captures>/lanes/crops/PUB/for-contractors-full-04.png`).
  - On a phone there is about 120 px of empty space between the directory's intro and its list.
  - Contractors are listed 4th of 5, although trades are the first priority (JITM-02 §2.2). That is a question for Kevin, not a violation.
- **Verdict:** Good, fix details.
- **Structure:** on phones, fold the seven non-link professions into one sentence. Consider listing Contractors and Real estate first (Kevin).

### How it works and "Keep the rhythm. Keep your own voice."
- **Purpose:** define Mix and Beat, show the three steps, state the boundaries.
- **Works well:**
  - The definition comes after the value (JITM-05 §2.18).
  - Each profession page states its honest boundary.
  - The Newsreader heading matches the export.
- **In the way:** the inline "reminders" link looks like plain text (known: JITM-10 §6; `<captures>/lanes/crops/PUB/zoom-reminders-link-phone.png`).
- **Verdict:** Optimal, apart from the known link style.

### Waitlist band and footer
- **Purpose:** capture an email at the end of the page.
- **Works well:**
  - Email only (JITM-09 §2.16).
  - Honest access copy (JITM-04 §2.15).
  - The dark band's secondary text is 8.8:1.
- **In the way:**
  - On a phone the band starts at about 4,060 px.
  - Its paragraph ends "Until then, try a three-Beat Mix…" with no link to the demo, which is about 3,000 px higher (`src/components/PublicLanding.tsx:47`).
  - The footer tagline is known (JITM-02 §6).
- **Verdict:** Good, fix details.

### FAQ (`/faq`)
- **Purpose:** answer objections about sending, replies, cost, data and invitations.
- **Works well:** seven plain answers in disclosures, with "See the plans" in the cost answer.
- **In the way:** the page ends with no action. A visitor who has just had their worries answered must scroll back to the header (`src/app/faq/page.tsx:22-33`; `shots/sweep/laptop-light-public/faq-full.png`).
- **Verdict:** Good, fix details.
- **Structure:** add a closing row: "Free beta. No card required." with Join the waitlist and Try the demo.

### Pricing (`/pricing`)
- **Purpose:** show the plans truthfully while billing is off.
- **Works well:** the copy matches JITM-02 §2.18. The limits are explained, and the desktop layout is clear.
- **In the way:** on a phone the three plan cards fill about 3 screens (2,834 px page) before the only in-page "Join the waitlist" (`src/app/pricing/page.tsx:60`).
- **Verdict:** Good, fix details.
- **Structure:** on phones, repeat "Free beta. No card required. Join the waitlist" right under the intro.

### Follow-up reminders feature page (`/features/follow-up-reminders`)
- **Purpose:** explain reminders and the review-and-send model.
- **Works well:** accurate notification copy, and "What stays with you" is clear.
- **In the way:**
  - The call-to-action block says "Edit a draft, preview it, and record what happened." and "The demo doesn't send anything or open another app." Both are untrue since D31 (PUB-02).
  - The table of contents has a wrapping glitch (PUB-28) and takes most of the first phone screen.
- **Verdict:** Needs a copy fix. The layout is Good.

### Template hub and the estimate and proposal template pages
- **Purpose:** useful wording, then a step into the demo.
- **Works well:**
  - The illustrative label and the "only if it's true" cue (JITM-04 §2.20, §2.23).
  - Copy buttons.
  - A "Know when to stop" section.
- **In the way:**
  - The hub and the estimate page repeat the false demo claim (PUB-02).
  - "Try this estimate follow-up plan" leads to a different plan from the 4-Beat example on the page (PUB-26).
  - The Copy buttons are 40 px tall on phones (PUB-24).
  - The same table-of-contents glitch (PUB-28).
- **Verdict:** Good, fix details.

### Waitlist pages (`/waitlist`, `/waitlist/confirm`, `/waitlist/leave`)
- **Purpose:** join, confirm or leave, with one email field.
- **Works well:**
  - One field and three numbered steps.
  - Honest "We can't promise a date."
  - Confirm and leave both need a button press.
- **In the way:** "Sign in", "Leave the waitlist or stop invitation emails" and "Back to home" look like plain text (known: JITM-10 §6) and are 20 px tall on phones (PUB-24).
- **Verdict:** Optimal for the workflow. Link style is known.

### Contact, privacy, terms and security (`PublicDocument`)
- **Works well:** body links are underlined, and each page has a contents list and an effective date.
- **In the way:** a header that differs from the other public pages (see above), and the table-of-contents wrapping glitch (PUB-28).
- **Verdict:** Good, fix details.

### Small states: offline, signed out, account deleted, magic-link retry, staff accept
- **Works well:** each says what happened and gives one next action.
- **In the way:**
  - On the signed-out page, the "Sign in" and "Back to home" buttons touch, with 0 px between them (`<captures>/lanes/crops/PUB/zoom-signedout-buttons.png`; `src/app/signed-out/page.tsx:8`).
  - The signed-out and account-deleted cards have no logo, unlike every other card on these screens.
- **Verdict:** Good, fix details.

### Sign in (`/login`)
- **Purpose:** a returning owner signs in on a new device.
- **Works well:** Show password, an inline "Forgot password?", and a link option.
- **In the way:** on a phone there are two email fields and two filled main buttons, "Sign in" and "Email sign-in link" (`src/app/login/page.tsx:90-104`; `<captures>/lanes/crops/PUB/sheet-auth-0.png`).
- **Verdict:** Good, fix details.
- **Structure:** one email field, then "Sign in" (main). "Email me a sign-in link instead" becomes a secondary button that submits the same field.

### Forgot and reset password
- **Verdict:** Optimal. The email field is focused, there is one action and the error is clear.

### Registration from an invitation (`/register?invite=…`)
- **Purpose:** turn an invitation into an account.
- **Works well:**
  - Two typed fields.
  - The email is fixed to the invitation.
  - "Create free account".
  - It promises "start with one person and review every follow-up before sending".
- **In the way:**
  - The read-only email is styled like an editable field, and the same address is repeated under it ("Invitation sent to …").
  - The page doesn't say who invited them, even though the invitation stores the inviter (`prisma/schema.prisma:748`).
  - "Sign in" and "Get help…" look like plain text (known: JITM-10 §6; `<captures>/lanes/crops/PUB/zoom-register-links.png`).
- **Verdict:** Good, fix details.
- **Structure:** show the email as plain text. Consider "{Inviter first name} invited you" above the heading (Kevin).

### Verify-email pending and the verification email
- **Purpose:** get the person into their inbox and back.
- **Works well:**
  - The page states the address.
  - Opening the link signs the person in and lands them on onboarding, so there is no second sign-in (`src/app/api/auth/verify-email/route.ts:78-84`).
- **In the way:**
  - The page's only filled button is "Send another verification link". Sending a new link cancels the one already in the inbox (`src/lib/auth-tokens.ts:43-46`), so a reflex tap breaks the email the person is about to open (PUB-12).
  - The same fact is stated twice, in the paragraph and again in the green notice.
  - "Typed the wrong email?" shows for email invitations, whose address can't be wrong.
  - "Contact support if you cannot recover your account." talks about recovering an account the person created seconds ago.
  - The email itself says "Hi Riley Novak, confirm this email address to finish securing your Jump in the Mix account." That is security-framed, uses the full name and says nothing about what happens next.
- **Verdict:** Needs rework (small).
- **Structure:** one instruction ("Open the link we sent to … on this phone"). Make resend a secondary button. Hide the wrong-email form for email invitations. Whether verification could follow the first follow-up is a question for Kevin (S5).

### Onboarding (`/onboarding`, one-person route)
- **Purpose:** JITM-01 §2.12. Name the business, add one person, and see a useful prepared follow-up within minutes, on a phone.
- **Works well:**
  - One-person-first is the default (JITM-09 §2.20).
  - The preview of the actual starter (09-18 ONB-05).
  - Timezone detection with a clear Change button.
  - Retry-safe submit.
  - "Skip for now".
- **In the way:**
  - **Length and order (PUB-03).** 5.3 screens.
    - Screen 1 holds only choices that already have defaults: the starting point (3 cards) and the "Recommended" one-person card.
    - Uses (3 cards) and Type of business come next.
    - The person's name is at about 2,300 px and the tick at about 4,100 px.
  - **9 reasons, 4 starters (PUB-04).**
    - "Reconnect with a lead", "Reconnect with someone" and "Reconnect" sit side by side. Together with "Follow up on an inquiry" and "General follow-up", all five give the same "Went quiet" starter.
    - So a fresh inquiry gets "just checking in… has the timing changed?".
  - **The preview can't be read as it will be sent (PUB-05, PUB-16, PUB-17).**
    - Raw `{{First Name}}`, `{{My Company}}` and `{{SMS Signature}}`.
    - 24-hour "10:00" and "11:00".
    - Relative days.
    - A Beat called "One-week call" that is "5 days after".
    - Text about 170 px wide, in sans-serif violet.
    - The tick then asks the owner to confirm this.
  - **Phone "recommended · optional" (PUB-06).** The starter's first Beat is a text. If the owner leaves Phone empty, the first Today says "Add a phone number" instead of offering a ready follow-up.
  - **Business name is hidden.** It sits inside the collapsed "Optional business details and signature" box, so the first draft says "from my business" (PUB-14, known). That box also holds a required field (PUB-18).
  - **iPhone-class browsers (PUB-19).** The person step opens with "Device contact selection isn't available in this browser…" and two import buttons, before the Name field.
  - **Known: ONB-03.** Jargon ("Jump in the mix.", "Mega-Mix", "journey"), with no glossary on this page. JITM-05 §6 already asks whether to add one.
- **Verdict:** Needs rework.
- **Structure:** S1.

### First Today after onboarding, and "Setup is complete"
- **Purpose:** show the first prepared follow-up and get it reviewed.
- **Works well:**
  - The welcome names the person ("Your first follow-up for Jordan Lee is ready. Tap Review to begin.") and offers the matching Mega-Mix as optional.
  - The follow-up is on screen 1.
  - Desktop opens the review docked (`shots/riley-today-laptop.png`).
- **In the way:**
  - A filled "Invite people" strip above the list.
  - A "3" badge on the More tab.
  - A "Filter 1" chip the person never set: the welcome link adds `range=all`, which is counted as a filter (`src/lib/onboarding-actions.ts:35`, `src/app/(app)/jumps/page.tsx:283`).
  - Meanwhile Review is a small text action, clipped at 390 px (O29, Today lane) (PUB-07).
  - "Setup is complete" (`shots/riley-onboarding-after-laptop.png`) is fine on phones. On laptop its buttons sit at the far right, away from its left-aligned text.
- **Verdict:** Good, fix details.
- **Structure:** S2.

### The invitation the recipient receives (default System Mix wording)
- **Purpose:** an owner's personal invitation that makes the recipient curious and sure who sent it.
- **Works well:**
  - First person, from the owner, sent by the owner's own app.
  - The subject names the sender ("Demo Owner invited you to Jump in the Mix").
- **In the way:**
  - "Hi riley.newowner@example.test," for a person invited by email only.
  - "to stay in touch with the people in my circle". That is personal framing with no category and no mechanism, which the marketing register requires (JITM-04 §2.3) (PUB-08; `shots/flow-inv-6-review.png`; `src/lib/system-mix.ts:6,25`).
- **Verdict:** Needs rework (copy; Kevin, JITM-09 §2.19).

### Hosted lead form (`/lead/[id]`, the owner's customers)
- **Purpose:** a customer sends their details to the owner.
- **Works well:**
  - The business name at the top.
  - 5 fields and one button.
  - "Email or phone" handled with one hint.
  - Honest "can follow up" receipt (code).
  - 1,237 px on a phone.
- **In the way:**
  - The required consent tick shows alone above its sentence (PUB-09; `<captures>/lanes/crops/PUB/lead-form-b.png`).
  - "so we can respond" and "How can we help?" (PUB-10).
  - The message box is optional but not marked, against the JITM-08 §2.27 convention.
  - "Company (optional)" means little to homeowners (question for Kevin).
- **Verdict:** Good, fix details.

### Private review page (`/review/[token]`) and the review request message
- **Purpose:** a customer rates the job privately. A public review or referral is optional.
- **Works well:**
  - "It is not posted publicly."
  - 48 px rating targets.
  - The live "Selected N out of 5" text.
  - No sentiment gating in code: the public-review link is offered after any rating (`src/components/ReviewFeedbackForm.tsx:40`).
- **In the way:**
  - The stars are reversed on screen (PUB-01).
  - "Hi Marcus, how did we do?" and "Anything you'd like us to know?" (PUB-10).
  - No business-name header, unlike the lead form.
  - The request message says "How did we do?" and doubles the dash before an owner signature that already starts with "—" (PUB-10).
  - The owner-side card promises sentiment gating the page doesn't do (PUB-11).
- **Verdict:** Needs rework.
- **Structure:** S4.

## 3. Findings table

| ID | Rule | Finding | Evidence | Label | Severity | Fix direction |
|---|---|---|---|---|---|---|
| PUB-01 | none — gap (data integrity; JITM-17 §2.14 "data … corrupted"); JITM-10 §2.7 | **Review stars are reversed on screen.** The radios are in DOM order 1→5, but `.rating-options { flex-direction: row-reverse }` draws them 5…1 from left to right. The highlight `label:has(input:checked) ~ label` fills from the tapped star towards the left (the higher values). It therefore looks like a normal star bar, but tapping the k-th star from the left records 6−k. The legend "1 — Poor · 5 — Excellent" reads left to right, the wrong way. A customer who taps the fifth star records 1/5 ("Selected 1 out of 5") and is classed as needs-attention. The owner's contact history logs "Private feedback received with a 1 of 5 rating." The answer is single-use, so the customer can't correct it afterwards. This has been the case since 793b091 (2026-09-04). | `src/components/ReviewFeedbackForm.tsx:43`; `src/styles/product.css:104,108`; `src/app/api/reviews/[token]/route.ts:22,26,28`; `git show 793b091`; e2e picks by name only (`e2e/ui-ux-workflows.spec.ts:95`); `shots/flow-review-2-public.png` (unselected state only) | VERIFIED-CODE; the on-screen order is INFERRED from the CSS (row-reverse is deterministic). One runtime tap still needed | HIGH (BLOCKER-class once confirmed: stored feedback is wrong) | Use `flex-direction: row` with DOM 1→5, and highlight with `.rating-options label:has(~ label input:checked), label:has(input:checked)`. Or reverse the DOM to 5→1 and keep the CSS. Add a visual test that taps the fifth star and expects "Selected 5 out of 5". Review the `ReviewRequest.rating` values stored since 2026-09-04. |
| PUB-02 | JITM-04 §2.26, §2.28; JITM-09 §2.67 (3.0.0, D31) | Three public pages say "A fictional contact and editable drafts. The demo doesn't send anything or open another app." Since D31 the demo opens the visitor's own text, email or phone app. The feature page also says "Edit a draft, preview it" (no preview step exists now). | `src/app/features/follow-up-reminders/page.tsx:44,46`; `src/app/follow-up-templates/page.tsx:48`; `src/app/follow-up-templates/estimate-follow-up/page.tsx:48`; `<captures>/lanes/crops/PUB/tpl-est-04.png`; the demo's own hint "Opens your messages app with this draft." (`<captures>/lanes/crops/PUB/for-contractors-full-01.png`) | VERIFIED-CODE, VERIFIED-RUNTIME | HIGH | Use the homepage's accurate wording (copy table). Add these pages to the D31 claim review. |
| PUB-03 | JITM-01 §2.12; JITM-09 §2.10 (SHOULD: one compact form) | The one-person onboarding is 4,435 px (5.3 phone screens), up from 2,768 px at the 09-18 audit (ONB-03). Screen 1 holds only choices that already have defaults. The first required input (the person's name) is at about 2,300 px, the required tick at about 4,100 px, and the submit button at about 4,315 px. | `shots/flow-onb-3-onboarding-full.png` (8,870 px @2x); `<captures>/lanes/crops/PUB/onb-full-00…05.png`; `src/components/OnboardingForm.tsx:48-97`; `docs/UI_UX_PRODUCT_READINESS_AUDIT_2026-09-18.md:574-580` | VERIFIED-RUNTIME | MEDIUM | S1: a two-screen form with the person first. Mega-Mix and individual Mixes become a secondary link. |
| PUB-04 | JITM-09 §2.10; JITM-04 §2.1, §2.18 | "What do you want to do?" offers 9 reasons for Business but produces only 4 different starters:<br>• "Follow up on an inquiry", "Reconnect with a lead", "Reconnect with someone", "Reconnect" and "General follow-up" all map to `plan_generic_reconnect` ("Went quiet: gentle reconnect").<br>• "estimate" and "quote" are identical.<br>The other options change only the reason label, and a new inquiry gets a "went quiet" text. | `src/lib/onboarding-options.ts:4`; `src/lib/vertical-plan-library.ts:282-292,214-228`; `<captures>/lanes/crops/PUB/onb-full-02.png` | VERIFIED-CODE | MEDIUM | Offer 4–5 options that each lead to a different starter (copy table). Per-business-type starts remain the open JITM-09 §6 question. |
| PUB-05 | JITM-06 §2.13 and export anatomy ("merge fields as wash chips inside Newsreader text"); JITM-04 §2.21. Raw tokens are known: ONB-10 (beta 2026-09-26), open per JITM-09 §6 | The starter preview prints `{{First Name}}`, `{{My Company}}` and `{{SMS Signature}}`, in sans-serif violet. The browser's default blockquote margins inside the list squeeze the text to about 170 px, so a 2-Beat plan is about 1,140 px tall. `MergeFieldText` (chips) already exists, and the person's name, business name and signature are typed on the same form. The required tick then certifies this view. | `src/components/StarterPreview.tsx:27`; `src/styles/components.css:231` (no `ol`/`blockquote` reset); `src/components/MergeFieldText.tsx:11`; `<captures>/lanes/crops/PUB/onb-full-03.png`, `-04.png` | VERIFIED-RUNTIME, VERIFIED-CODE | MEDIUM | Fill in the typed values live, with `MergeFieldText` chips for anything missing. Use Newsreader for the message. Reset the list and blockquote margins. |
| PUB-06 | JITM-01 §2.12 | Phone and Email are labelled "recommended · optional", but the starter's first Beat is a text. With no phone, the first Today becomes "Your follow-up for X is saved. Add a phone number to review and send it." The explanation ("If you save someone without a phone or email…") is about 1,700 px below the fields. | `src/components/OnboardingForm.tsx:87-88,95`; `src/app/(app)/jumps/page.tsx:430-433` | VERIFIED-CODE (blank-phone run NOT RUN) | MEDIUM | One hint under Name: "Add their mobile number so you can text them from your phone. You can add it later." Mark only the field the first Beat needs. |
| PUB-07 | 09-18 audit ONB-06 acceptance ("the first screen after setup makes the chosen person's next action visually primary"); JITM-01 §2.12 | The first Today for a new account shows a filled "Invite people" strip, a More badge "3" and a "Filter 1" chip (from `range=all`) above and around the first follow-up. Its "Review" is a small text action, clipped at 390 px (O29). O37 is confirmed. | `shots/flow-onb-5-today-welcome-full.png`; `src/app/(app)/jumps/page.tsx:141,283,495`; `src/lib/onboarding-actions.ts:35`; `docs/APPEARANCE_INVITATIONS_RELEASE_2026-09-27.md:18-23` | VERIFIED-RUNTIME, VERIFIED-CODE | MEDIUM | Welcome notice gets a main button, "Review Jordan's follow-up" (`/jumps?jump=<id>&range=all`). Show the strip and badge after the first recorded outcome (Kevin). Don't count `range` on the welcome view. |
| PUB-08 | JITM-04 §2.3 (marketing register, invitation email included, "names the category and the mechanism literally"); JITM-02 §2.10 | The default invitation:<br>• greets an email-only invitee by address ("Hi riley.newowner@example.test,"), because the contact's display name is the address;<br>• describes the product as staying "in touch with the people in my circle", with no category and no mechanism.<br>O35 is confirmed. | `shots/flow-inv-6-review.png`; `src/lib/system-mix.ts:6,23-25` | VERIFIED-RUNTIME, VERIFIED-CODE | MEDIUM | Use "Hi there," when the name is an email address or phone number. Rewrite the body (copy table; Kevin, staff-published per JITM-09 §2.19). |
| PUB-09 | none — gap (layout) | Lead form: the required consent checkbox renders alone, with its sentence on the next line. The cause is `.checkbox-row { flex-wrap: wrap }` in base.css and no `flex: 1` on the text, so the long text wraps below. The same class is used in 6 other components. | `<captures>/lanes/crops/PUB/lead-form-b.png`; `src/styles/base.css:169`; `src/styles/product.css:406-407`; `src/components/PublicLeadForm.tsx:16` | VERIFIED-RUNTIME, VERIFIED-CODE | MEDIUM | `.checkbox-row { flex-wrap: nowrap }` and `.checkbox-row > span { flex: 1; min-width: 0 }`. Ask the other lanes to recheck `CalendarEntryForm`, `Appearance`, `SupportContext`, `ContactTimeline`, `SchedulePreview`, `AutomaticSendPreview` and preferences. |
| PUB-10 | JITM-04 §2.5 (D23: first person singular; "we" never the default) | Text the owner's customers see defaults to "we":<br>• "so we can respond", "How can we help?";<br>• "Hi Marcus, how did we do?", "Anything you'd like us to know?", tab title "How did we do?";<br>• request text "How did we do?", subject "How did we do at {company}?".<br>The request also always adds " — " before the signature, giving "— — Alex at Northline Home Services" for a signature that starts with a dash. O39 and O40 are confirmed. | `src/components/PublicLeadForm.tsx:13,15`; `src/app/review/[token]/page.tsx:6,30`; `src/components/ReviewFeedbackForm.tsx:44`; `src/app/api/contacts/[contactId]/review-request/route.ts:45,52`; `prisma/seed.ts:47`; `shots/flow-lead-2-public-form.png`, `shots/flow-review-2-public.png` | VERIFIED-CODE, VERIFIED-RUNTIME | MEDIUM | On the hosted pages, use the business name ("so {Business} can reply", "How did {Business} do?"). Use "I" in the ready-made request. Join the signature with a space. |
| PUB-11 | Copy disagrees with code (JITM-04 §2.7 truth rule) | The owner-side card says "Your customer rates the experience first. Happy customers can continue to your public review page and share a referral." The customer page offers the public review link after any rating. The wording also describes sentiment-gated review requests, which the major review platforms prohibit. | `src/components/ReviewRequestButton.tsx:48`; `src/components/ReviewFeedbackForm.tsx:40`; `shots/flow-review-1-ready.png` | VERIFIED-CODE, VERIFIED-RUNTIME | MEDIUM | Describe what actually happens (copy table). Keep the no-gating behaviour. |
| PUB-12 | none — gap (risk) | The verify page's only filled button is "Send another verification link", and a new link cancels the one already in the inbox. A reflex tap while the first email is still arriving makes that email fail ("That verification link is invalid or expired."). "Typed the wrong email?" shows even for email invitations, whose address is fixed. | `src/app/verify-email/pending/page.tsx:36-48`; `src/lib/auth-tokens.ts:43-46`; `src/app/api/auth/verify-email/route.ts:77`; `shots/flow-onb-1-first.png` | VERIFIED-CODE, VERIFIED-RUNTIME | MEDIUM | Make resend secondary ("Didn't get it? Send another link"). One line of instruction. Show the wrong-email form only for text invitations. |
| PUB-13 | JITM-04 §2.30 (one line answering the nearest worry), §2.25 (one primary action) | On a phone the demo's draft and "Open text" are at about 1,466 px (`/for/contractors`), behind a 55-word note plus the demo card's own disclaimer. The demo offers "Join the waitlist" only after all three Beats (three app handoffs). The waitlist band starts at about 4,060 px. | `src/components/PublicLanding.tsx:25`; `src/components/ProductDemo.tsx:82,116`; `<captures>/lanes/crops/PUB/for-contractors-full-00…05.png`; `shots/sweep/phone-light-public/home.png` | VERIFIED-RUNTIME | MEDIUM | S3. |
| PUB-14 | Known: JITM-09 §6 (rest of ONB-10); JITM-04 §2.21 | The first prepared text for every non-realtor reads "…the estimate from my business…", because Business name is inside the collapsed "Optional business details and signature" box and the renderer falls back to "my business". Fresh evidence: Riley's first draft. | `shots/riley-today-laptop.png`; `src/components/OnboardingForm.tsx:60-66` | VERIFIED-RUNTIME | MEDIUM (known) | Put Business name, marked optional, next to Type of business. Or reword the starter so it reads well without one ("received my estimate"). |
| PUB-15 | Known: JITM-10 §6 / §2.8 | Inline links look like plain text: "reminders" (how it works), "Sign in" and "Get help with an invitation or account" (register), "Sign in", "Leave the waitlist…" and "Back to home" (waitlist), "Run setup again". | `<captures>/lanes/crops/PUB/zoom-reminders-link-phone.png`, `zoom-register-links.png`; `src/styles/base.css:63` | VERIFIED-RUNTIME | MEDIUM (known) | The global rule from §6. The invited person's path (register, verify) should be fixed first. |
| PUB-16 | none — gap (time format); JITM-04 §4 example "Tue 10:00 AM" | Preview times are 24-hour ("10:00", "11:00"), relative ("Your chosen day", "5 days after") and "in your selected timezone". Today shows the same Beats as "10:00 AM" and "Oct 13, 11:00 AM". `timeOfDayLabel` exists. | `src/components/StarterPreview.tsx:27`; `src/lib/display-labels.ts:10`; `shots/flow-onb-5-today-welcome-full.png` | VERIFIED-RUNTIME | LOW | Real dates from "Follow up on", formatted with `timeOfDayLabel`. |
| PUB-17 | JITM-04 §2.1 (honest, plain) | A Beat named "One-week call" shows as "Call · 5 days after". Shifting the starter's days renames only the first Beat. | `src/lib/vertical-plan-library.ts:40,299-309`; `<captures>/lanes/crops/PUB/onb-full-04.png` | VERIFIED-RUNTIME, VERIFIED-CODE | LOW | Rename shifted Beats ("Follow-up call"), or don't shift. |
| PUB-18 | JITM-08 §2.27 | The "Optional business details and signature" box holds a required field ("How do you sign texts?", prefilled, `required`). | `src/components/OnboardingForm.tsx:61,64` | VERIFIED-CODE | LOW | Show the prefilled signature outside the box, or rename the box. |
| PUB-19 | JITM-08 §2.21 (optional content behind a disclosure); prior 09-18 ONB-07 | Before the Name field, the person step shows "Import contacts from a file", "Refresh imported contacts" and, on browsers without contact picking (all iPhone browsers), "Device contact selection isn't available in this browser. Import a CSV or vCard file, or enter a person below." | `src/components/DeviceContactQuickAdd.tsx:185`; `src/components/OnboardingForm.tsx:80-82`; `<captures>/lanes/crops/PUB/onb-full-02.png` | VERIFIED-RUNTIME (headless Chromium); iPhone INFERRED (no Contact Picker API) | LOW | Show nothing where it's unsupported. Put import behind "Have a list? Import a file". |
| PUB-20 | JITM-08 §2.12 (by analogy: the review doesn't focus the message so the keyboard doesn't cover the send buttons) | "Try the demo" focuses the demo textarea. On Android Chrome this probably raises the keyboard over the draft and "Open text". | `src/components/ProductDemo.tsx:66` | INFERRED (code; device NOT RUN) | LOW | On touch devices, focus the step heading instead. |
| PUB-21 | JITM-10 §2.2 (13 px floor) | Demo text is 12 px: "1 Beat due" and "Beat 1 of 3". The due labels are also 12 px; they are inside buttons, which the exception may cover. | `src/components/ProductDemo.module.css:12,23,29`; `shots/sweep/phone-light-public/_results.json` (home `small`) | VERIFIED-RUNTIME | LOW | Raise to 13 px. |
| PUB-22 | JITM-05 §2.18 | The demo heading "Try a 3-step Mix" is the first use of "Mix", on screen 1, before the page defines it. The export used "Try one follow-up". | `src/components/ProductDemo.tsx:17`; `shots/sweep/phone-light-public/home.png`; `<captures>/lanes/crops/PUB/export-landingphone-00.png` | VERIFIED-RUNTIME | LOW | "Try a 3-step follow-up". |
| PUB-23 | JITM-04 §2.25 (one primary action) | The FAQ ends with no action. On a phone, Pricing's only in-page call to action comes after about 3 screens of plan cards. | `src/app/faq/page.tsx:22-33`; `src/app/pricing/page.tsx:60`; `shots/sweep/laptop-light-public/faq-full.png` | VERIFIED-RUNTIME | LOW | A closing action row on the FAQ. A beta call to action under the pricing intro on phones. |
| PUB-24 | JITM-10 §2.1 (44×44 at ≤900 px, 8 px apart) | Phone targets that are too small:<br>• standalone text links are 20–26 px tall: "Back to home" (FAQ, waitlist), "Back to sign in", "Forgot password?", "Leave the waitlist…", table-of-contents and Related links;<br>• "Copy text" and "Copy email" are 40 px tall;<br>• the signed-out page's two buttons touch, 0 px apart. | `shots/sweep/phone-light-public/_results.json` (`smallTargets`); `src/styles/homepage.css:153`; `<captures>/lanes/crops/PUB/zoom-signedout-buttons.png`; `src/app/signed-out/page.tsx:8` | VERIFIED-RUNTIME | LOW | `min-height: 44px` with inline-flex on standalone links and the Copy buttons. An actions row with an 8 px gap on the signed-out page. |
| PUB-25 | none — gap (one main action per auth page) | Sign-in on a phone has two email fields and two filled main buttons. | `src/app/login/page.tsx:90-104`; `<captures>/lanes/crops/PUB/sheet-auth-0.png` | VERIFIED-RUNTIME | LOW | S7. |
| PUB-26 | JITM-04 §2.26 (the proof must match the claim) | "Try this estimate follow-up plan" opens the contractors demo, a 3-Beat text/email/call plan. The page just described a 4-Beat estimate Mix, and onboarding's estimate starter has 2 Beats. Proposal: "Try this proposal follow-up plan" with "Nothing goes out unless you open your own email app…", but that demo starts with a text. | `src/app/follow-up-templates/estimate-follow-up/page.tsx:31-37,47`; `src/app/follow-up-templates/proposal-follow-up/page.tsx:42-43`; `src/lib/demo-workspace.ts:4-8`; `src/lib/vertical-plan-library.ts:39-40` | VERIFIED-CODE | LOW | "Try an estimate follow-up" / "Try a proposal follow-up", with accurate small print. |
| PUB-27 | JITM-06 §2.33 (export is the reference) | Tablet (834 px): the hero content is inset (left edge about 65 px, `max-width: 740px`), but the sections below run at 18–24 px. The export keeps one left edge. | `<captures>/lanes/crops/PUB/tablet-home-00…02.png` vs `export-tablet-00/01.png`; `src/styles/design-public.css:66` | VERIFIED-RUNTIME | LOW | Give the sections at 761–1000 px the same max width and gutter as the hero. |
| PUB-28 | none — gap (consistency) | The "On this page" lists use `display: flex; flex-wrap: wrap` on bulleted items, so short items share a line ("• Make 'I'll follow up' a plan • Related"). This happens on the feature, template and policy pages. | `src/styles/homepage.css:276`; `<captures>/lanes/crops/PUB/tpl-est-00.png`, `sheet-docs.png` | VERIFIED-RUNTIME | LOW | One item per line on phones (`display: grid`). Leave the CTA and "Related" out of the list. |

## 4. Copy findings

Public copy needs Kevin's approval (JITM-04 §2.31). Sending and claim lines need a ledger entry (§2.26).

| Current string (exact) | Where | Problem | Proposed |
|---|---|---|---|
| "A fictional contact and editable drafts. The demo doesn't send anything or open another app." | `src/app/features/follow-up-reminders/page.tsx:46`; `src/app/follow-up-templates/page.tsx:48`; `src/app/follow-up-templates/estimate-follow-up/page.tsx:48` | False since D31 (PUB-02) | "Fictional contact and editable drafts. The demo sends nothing itself. A draft you open goes to a non-working example." |
| "Edit a draft, preview it, and record what happened." | `src/app/features/follow-up-reminders/page.tsx:44` | There is no preview step any more | "Edit a draft, open it in your own text or email app, and record what happened." |
| "Practice with a fictional contact. The demo sends nothing itself. If you choose to open the draft in your own text, email or phone app, the recipient is a non-working example and you decide whether to send or call. Free accounts, no card; access is by invitation from a member, or from the waitlist as space opens." | `src/components/PublicLanding.tsx:25` | 55 words; §2.30 asks for one line (PUB-13) | "Fictional contact: drafts open in your own app, addressed to a non-working number. Free beta, no card required; access is by invitation or the waitlist." |
| "Fictional contact. This page sends nothing and schedules nothing. Edits stay in this tab and clear on refresh." | `src/components/ProductDemo.tsx:82` | Repeats the hero note just above it | Remove, or "Edits clear when you leave the page." |
| "Try a 3-step Mix" | `src/components/ProductDemo.tsx:17` | Uses "Mix" before it is defined (JITM-05 §2.18) | "Try a 3-step follow-up" |
| "Until then, try a three-Beat Mix with a fictional contact: text today, email tomorrow, and a call in one week." | `src/components/PublicLanding.tsx:47` | Points to a demo about 3,000 px away, with no link | End with a "Try the demo" link (`#sample`), or remove the sentence. |
| "Try this estimate follow-up plan" / "Try this proposal follow-up plan" + "Preview a fictional contact and an editable draft. Nothing goes out unless you open your own email app and send it." | `src/app/follow-up-templates/estimate-follow-up/page.tsx:47`; `src/app/follow-up-templates/proposal-follow-up/page.tsx:42-43` | Promises "this plan", but the demo is a different plan, and its first Beat opens the messages app (PUB-26) | "Try an estimate follow-up" / "Try a proposal follow-up"; "Fictional contact. Nothing goes out unless you send it yourself." |
| "Jump in the mix." | `src/app/onboarding/page.tsx:41` | Wordplay as the setup heading. Known jargon (ONB-03) | "Set up your first follow-up" |
| "Make this fit your life" | `src/components/OnboardingForm.tsx:53` | Personal framing for a business setup step | "How you'll use it" |
| "Optional business details and signature" | `src/components/OnboardingForm.tsx:61` | Holds a required field (PUB-18) and hides the business name (PUB-14) | Move "Business name (optional)" next to Type of business. Show "Text signature: Riley Novak · Edit" as a line. |
| "Phone recommended · optional" / "Email recommended · optional" | `src/components/OnboardingForm.tsx:87-88` | Two contradictory qualifiers. Hides the fact that a text needs a phone number (PUB-06) | Labels "Mobile phone (optional)" / "Email (optional)", with the hint "Add their mobile number so you can text them from your phone. You can add it later." |
| "If you save someone without a phone or email, we save the reminder and ask you to add their contact details before sending." | `src/components/OnboardingForm.tsx:95` | About 1,700 px from the fields it explains | Fold into the hint above. |
| Reason options: "Follow up about an estimate", "Follow up on a quote", "Follow up on an inquiry", "Reconnect with a lead", "Reconnect with someone", "Check in after the job", "Ask for a review", "Reconnect", "General follow-up" | `src/lib/onboarding-options.ts:4` | 9 options, 4 outcomes (PUB-04) | "An estimate or quote I sent" · "A new inquiry or lead" · "Someone who went quiet" · "Check in after the job" · "Ask for a review" (each with its own starter; Kevin, JITM-09 §6) |
| "Text · Your chosen day · 10:00 in your selected timezone" / "Call · 5 days after · 11:00 in your selected timezone" | `src/components/StarterPreview.tsx:27` | 24-hour time, relative days (PUB-16) | "Text · Thu, Oct 8 · 10:00 AM" / "Call · Tue, Oct 13 · 11:00 AM" |
| "One-week call" (shown as 5 days after) | `src/lib/vertical-plan-library.ts:40,308` | The name contradicts the timing (PUB-17) | "Follow-up call" |
| "I reviewed this Mix and its timing." | `src/components/StarterPreview.tsx:30` | A tick that certifies a preview showing raw tokens | Replace the tick and "Prepare my first follow-up" with one button, "Start Jordan's follow-up", under a filled-in, real-date preview (Kevin; 09-18 ONB-05 asked for explicit acceptance of the timing). |
| "Device contact selection isn't available in this browser. Import a CSV or vCard file, or enter a person below." | `src/components/DeviceContactQuickAdd.tsx:185` | A failure notice on every iPhone (PUB-19) | Nothing, or "Type their name and number below." |
| "Open the one-time verification link sent to {email}. Verification protects account recovery and personal data controls." + "We sent a verification link to {email}. Check your inbox and spam folder." | `src/app/verify-email/pending/page.tsx:36-37` | Says the same thing twice; no next step | "We sent a link to {email}. Open it on this phone to finish setting up. Check spam if it isn't there in a minute." |
| "Send another verification link" (filled main button) | `src/app/verify-email/pending/page.tsx:44` | Invites a resend that cancels the link already sent (PUB-12) | Secondary button: "Didn't get it? Send another link" |
| "Contact support if you cannot recover your account." | `src/app/verify-email/pending/page.tsx:57` | The person has just created the account | "Still nothing? Contact support." |
| "Hi Riley Novak, confirm this email address to finish securing your Jump in the Mix account." | `src/lib/auth-email.ts:27` | Full name; security framing; no next step | "Hi Riley, confirm your email to finish creating your Jump in the Mix account. Then add one person and review their first follow-up." (first-name helper needed) |
| "Hi riley.newowner@example.test," | rendered from `src/lib/system-mix.ts:6,25` | Greets an address (PUB-08) | "Hi there," when the contact's name is an email address or phone number |
| "I'm using Jump in the Mix to stay in touch with the people in my circle. It's free and invitation-only, and I'd like to share one of my three personal invitations with you." | `src/lib/system-mix.ts:6` | No category or mechanism (JITM-04 §2.3); personal framing | "I use Jump in the Mix, a client follow-up app, to keep track of who I need to get back to. It lines up each text or email so I just review and send it. It's free and invitation-only, and I'd like to give you one of my three invitations." (Kevin; staff-published) |
| "Share an email or phone number so we can respond." | `src/components/PublicLeadForm.tsx:13` | "We" (PUB-10); its own error line already says "so the business can reply" (`:15`) | "Share an email or phone number so {Business} can reply." |
| "How can we help?" | `src/components/PublicLeadForm.tsx:15` | "We"; optional field not marked (JITM-08 §2.27) | "What do you need help with? (optional)" |
| "Hi {firstName}, how did we do?" / page title "How did we do?" | `src/app/review/[token]/page.tsx:30,6` | "We"; the business is named only one line later | "Hi {firstName}, how did {company} do?" / "Share your feedback" |
| "Anything you'd like us to know?" | `src/components/ReviewFeedbackForm.tsx:44` | "We" | "Anything else {company} should know?" |
| "Hi {firstName}, thanks for choosing {company}. How did we do? Your private feedback takes a few seconds: {url} — {signature}" ; subject "How did we do at {company}?" | `src/app/api/contacts/[contactId]/review-request/route.ts:45,52` | A ready-made message defaulting to "we" (D23); doubled dash | "Hi {firstName}, thanks for choosing {company}. How did I do? It takes a few seconds and comes straight to me: {url} {signature}" ; subject "How did I do?" |
| "Your customer rates the experience first. Happy customers can continue to your public review page and share a referral." | `src/components/ReviewRequestButton.tsx:48` | Describes gating that the page doesn't do (PUB-11) | "Your customer rates the experience privately first. Then they can choose to leave a public review or recommend you." |
| "Email me a secure sign-in link" + second button "Email sign-in link" | `src/app/login/page.tsx:101-102` | A second email field and a second main button (PUB-25) | One email field; secondary button "Email me a sign-in link instead". |

## 5. Structural recommendations (ranked)

**S1. Rebuild the one-person onboarding as a two-screen phone form.**
- **Problem:** PUB-03/04/05/06/14/18/19. The required name and tick sit at about 2,300 px and 4,100 px of 4,435 px. There are 9 near-duplicate reasons. The preview can't be read as it will be sent. The phone field invites a skip that breaks the first follow-up. The business name is hidden, so the draft says "my business".
- **Change:** one card, in this order:
  1. **Your work:** Type of business, plus Business name (optional) on the same screen.
  2. **Who:** Name, Mobile phone, Email, with one hint.
  3. **What it's about:** 4–5 distinct options as radio cards, and "What should you remember?" (optional).
  4. **When:** the date, with the timezone line.
  5. **Preview:** the filled-in message in Newsreader, with chips only for missing values and real 12-hour dates.
  6. **Main button:** "Start Jordan's follow-up". Below it, "Skip for now".

  Then:
  - "Setting up a whole pipeline? Use a complete Mega-Mix · Choose individual Mixes" becomes a link row at the top, replacing the three radio cards.
  - Import and device contacts move behind "Have a list? Import a file".
  - Uses (Business / Personal / Networking) fold into the type select, as "Personal use" and "Networking" entries.
- **Benefit:** about 2 phone screens instead of 5.3. Required inputs land on screen 1. Choices drop from about 7 to 4. The first draft names the business. This meets JITM-09 §2.10's compact-form budget and the 09-18 ONB-03 recommendation.
- **Effort:** M.
- **Kevin:** yes. It changes O9's approved option layout (D26g), the uses question (D37 keeps non-business use available) and the 09-18 tick acceptance.

**S2. First Today after setup: one primary action.**
- **Problem:** PUB-07. Three competing calls to action, with Review the smallest, against the 09-18 ONB-06 acceptance.
- **Change:**
  - The welcome notice gets a main button, "Review Jordan's follow-up", that opens the review sheet.
  - The invitation strip and More badge wait until the first recorded outcome, which is JITM-01 §2.14 activation.
  - The welcome link doesn't light "Filter 1".
- **Benefit:** the first useful action is unmistakable, which is what the promise in JITM-01 §2.12 promises.
- **Effort:** S.
- **Kevin:** yes. The invitation prompts were owner-requested on 2026-09-27.

**S3. Phone landing: the demo's draft and action on screen 1; a waitlist exit after the first Beat.**
- **Problem:** PUB-13. The action is at about 1,466 px, the waitlist is offered only after three app handoffs, and the band is at about 4,060 px.
- **Change:**
  - A one-line hero note.
  - Remove the demo card's disclaimer.
  - Show the Situation select under the draft, or as chips.
  - After the first recorded Beat, show "Join the waitlist" (secondary) beside "Review email · tomorrow".
- **Benefit:** the demo starts on the first screen, and a convinced visitor can join from inside the demo.
- **Effort:** S.
- **Kevin:** yes (public copy).

**S4. The owner's customer pages: correct, branded, in the business's voice.**
- **Problem:** PUB-01, PUB-09, PUB-10, PUB-11.
- **Change:**
  - Fix the star order first; no decision is needed.
  - Put a business-name header on the review page, matching the lead form.
  - Use the business name instead of "we".
  - Fix the consent row.
  - Consider letting the owner hide "Company (optional)".
- **Benefit:** customers' ratings are recorded correctly, and both pages look like the owner's own.
- **Effort:** S.
- **Kevin:** only for the copy and the Company field.

**S5. Verification that doesn't fight the person.**
- **Problem:** PUB-12, and verification sits as a hard stop between registering and onboarding.
- **Change:**
  - One instruction line, a secondary resend, and the wrong-email form only for text invitations.
  - Optional: let onboarding continue right after registration, with a "Confirm your email" banner that blocks only recovery and data controls.
- **Benefit:** fewer failed links, and possibly one less app switch before the first follow-up.
- **Effort:** S for the page; M for deferring verification.
- **Kevin:** yes for deferral (security trade-off, JITM-09 §2.15).

**S6. A shorter landing page on phones.**
- **Problem:** two profession navigations, and 7 of the directory's 12 rows are not links. Together they add about 600 px before the waitlist band.
- **Change:** on phones, fold the non-link professions into one sentence ("Also used by coaches, sales reps, event planners and more"). Optionally put Contractors and Real estate first.
- **Effort:** S.
- **Kevin:** yes (JITM-07 §2.24 order; JITM-02 §2.2 order question).

**S7. Sign-in with one field.**
- **Problem:** PUB-25.
- **Change:** one email field. "Sign in" reveals or uses the password; "Email me a sign-in link instead" is a secondary button that submits the same field.
- **Effort:** S.
- **Kevin:** layout approval only.

**S8. One public header.**
- **Problem:** the `PublicDocument` pages break JITM-07 §2.25.
- **Change:** use `PublicHeader`.
- **Effort:** S.
- **Kevin:** no; it brings the code in line with the standard.

## 6. Documents that disagree, gaps, and questions for Kevin

**Documents that disagree with each other or with the code**
- **Old no-handoff wording.** JITM-04 §2.30's model line ("Nothing is sent and no messaging app opens.") and the export's landing screens ("Try one follow-up", "Nothing is sent…") are older than D31. JITM-09 §2.67 (3.0.0) now has the demo open the visitor's own app. Three public pages still follow the old wording (PUB-02).
- **Review gating.** `src/components/ReviewRequestButton.tsx:48` ("Happy customers can continue…") vs `src/components/ReviewFeedbackForm.tsx:40` (the public review is offered after any rating) (PUB-11).
- **"Mixes for:" on every page.** JITM-09 §2.68 says "The 'Mixes for:' row appears on every public page". In code it appears only on the six `PublicLanding` pages (`src/components/PublicLanding.tsx:28`). The FAQ, pricing, feature, template, policy and auth pages don't have it. Either the wording or the code should change.
- **Phone header.** JITM-07 §2.25 (phone header: Join and Explore) vs `src/components/PublicDocument.tsx:16`.
- **Three estimate plans.** The template page's 4-Beat estimate Mix (`src/app/follow-up-templates/estimate-follow-up/page.tsx:31-37`), the contractors demo's 3 Beats (`src/lib/demo-workspace.ts:4-8`) and the onboarding starter's 2 Beats (`src/lib/vertical-plan-library.ts:39-40`). A contractor meets all three on the way in.
- **First screen after setup.** The 09-18 audit's ONB-06 acceptance (the first screen after setup makes the person's next action primary) vs the owner-requested Today invitation strip (`docs/APPEARANCE_INVITATIONS_RELEASE_2026-09-27.md:18-23`).
- **Onboarding length.** The 09-18 audit (ONB-03) measured the one-person start at 2,768 px and asked for a shorter path. It is now 4,435 px. JITM-01 §2.12 requires a change that lengthens this path to say so in its plan; I did not read the plans to check (NOT RUN).

**Gaps where no rule exists**
- How times of day are written (12- or 24-hour). Today and `timeOfDayLabel` use "10:00 AM"; the onboarding preview uses "10:00".
- Whose voice the pages for the owner's customers use (lead form, review page). D23 covers only ready-made messages and drafts. I suggest the business name, never "we" or "I".
- Whether each first-run choice must lead to a different outcome.
- The visual order of rating and choice controls: tests pick by accessible name only, so a reversed display passes.
- Whether the public demo may offer the waitlist before it is finished.
- Whether an auth page may have more than one filled main button.

**Questions for Kevin**
1. Should onboarding keep opening with "How will you use Jump in the Mix?" (Business / Personal connections / Networking), and should the homepage demo keep "A personal hello"? Both are allowed (JITM-02 §2.3, §2.20), but they compete with the "client follow-up app" positioning. Together with "people in my circle" in the invitation and O26, they are what remains of the personal-tool framing.
2. May the default invitation name the category and drop "people in my circle"?
3. May the invitation strip and the More badge wait until the new owner records a first outcome?
4. Should email verification stay before onboarding, or follow the first prepared follow-up?
5. Should the profession lists put Contractors and Real estate first?
6. Should the hosted lead form keep "Company (optional)" for consumer trades?
7. Should a "Start Jordan's follow-up" button beside a real-date preview replace the "I reviewed this Mix and its timing." tick?
8. May the registration page name the inviter?

## 7. Captures needed / NOT RUN

- **PUB-01 confirmation (priority):** at `/review/<token>` at 390 px, tap the right-most star and record the "Selected N out of 5" line. Then submit and check the stored rating.
- Public Explore menu open on a phone (`/`, tap •••).
- Demo states on a phone:
  - after "Open text" (the returned view);
  - after "Sent" (the recorded view);
  - after the third Beat (the waitlist call to action);
  - the desktop QR dialog.
- "Try the demo" on physical Android Chrome: does the keyboard open (PUB-20)?
- Waitlist states:
  - `/waitlist?submitted=1`, `?confirmed=1`;
  - the over-limit message;
  - `/waitlist/confirm?token=…`.
- Lead form:
  - submitted receipt;
  - the missing-contact error;
  - 320 px and dark.
- Review page:
  - thank-you after a low and a high rating;
  - expired link;
  - dark and 320 px.
- Onboarding:
  - at 1440 and 834;
  - dark;
  - 320 px at 200% text;
  - with Real estate (journey starts);
  - with a marketing scenario;
  - with Personal connections only;
  - with Phone left blank (to confirm PUB-06's welcome);
  - after "Skip for now".
- Register:
  - from a text invitation (confirm-email field);
  - with Google or Apple configured.
- Verification on physical iPhone and Android with the Gmail and Outlook apps: does the session land in the mail app's built-in browser rather than Safari or Chrome?
- Public pages at 320 px (no `phone320` public set was captured). The new dark and tablet sets have no metrics in `_results.json` (path only), so text-floor and target checks there are visual only.
- Lighthouse budgets (JITM-10 §2.18): NOT RUN, per the brief.
- `shots/flow-onb-4-filled.png` has a blank white band (134 px) across the top. The cause is unknown, possibly a capture artifact; recapture before drawing conclusions.
- Not read: `PublicCapabilities`, `PublicContents` internals, `DemoPhoneQr`, and the waitlist and lead server actions beyond the lines cited.
